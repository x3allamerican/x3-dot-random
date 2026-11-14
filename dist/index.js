/**
 * X3 DOT Random: FMCSA random drug and alcohol testing (49 CFR 382.305) done right.
 *
 * - averagePool / annualMinimums: how many tests the year requires (382.305(b), (j)(1))
 * - periodTarget: how many to select this period so the year ends at the minimum, spread through the year (382.305(k)(2))
 * - selectRandom: an unbiased, scientifically valid draw (382.305(i)) that every driver has an equal chance of, every
 *   time (no one is removed after being tested). With a seed it is reproducible for audits; the record carries a
 *   hash of the pool so nobody can quietly change who was in it.
 *
 * Zero dependencies. Uses Web Crypto (Node 18+ and browsers).
 */
/** Minimum annual rates for FMCSA-regulated drivers. 382.305(b) sets 50% drugs and 10% alcohol; FMCSA confirms or changes them each year. 2026: 50% and 10%. */
export const FMCSA_RATES = { drug: 0.5, alcohol: 0.1, year: 2026, source: '49 CFR 382.305(b); FMCSA calendar year 2026 rates (50% drug, 10% alcohol). Check transportation.gov/odapc/random-testing-rates each January.' };
const subtle = () => {
    const s = globalThis.crypto?.subtle;
    if (!s)
        throw new Error('Web Crypto is not available (Node 18+ or a modern browser is required).');
    return s;
};
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
// ---------------------------------------------------------------------------------------------
// How many tests
// ---------------------------------------------------------------------------------------------
/** Average number of covered drivers: the sum of eligible drivers in each random testing period / number of periods (382.305(j)(1)). */
export function averagePool(driversPerPeriod) {
    if (!driversPerPeriod.length)
        throw new Error('Give the number of drivers in the pool for each testing period.');
    return driversPerPeriod.reduce((a, b) => a + b, 0) / driversPerPeriod.length;
}
/** The year's minimum number of tests: rate x average driver positions, rounded up so the minimum is met. */
export function annualMinimums(averageDrivers, rates = FMCSA_RATES) {
    return { drug: Math.ceil(averageDrivers * rates.drug - 1e-9), alcohol: Math.ceil(averageDrivers * rates.alcohol - 1e-9), averageDrivers, rates: { drug: rates.drug, alcohol: rates.alcohol } };
}
/**
 * How many drivers to select in period `periodIndex` (0-based) of `periodsPerYear`, given the pool sizes so far
 * (including this period) and the tests already completed. Keeps the year on pace: by the end of period k the
 * running total reaches the rate on the running average pool, times k / periods.
 */
export function periodTarget(input) {
    const { periodsPerYear: n, periodIndex: k, poolSoFar, completedSoFar, rate } = input;
    if (k < 0 || k >= n)
        throw new Error(`periodIndex must be 0 to ${n - 1}.`);
    if (poolSoFar.length !== k + 1)
        throw new Error('poolSoFar needs one entry per period so far, including this one.');
    const avg = averagePool(poolSoFar);
    const dueByEnd = Math.ceil(rate * avg * ((k + 1) / n) - 1e-9);
    const pool = poolSoFar[k];
    return Math.min(pool, Math.max(0, dueByEnd - completedSoFar));
}
// ---------------------------------------------------------------------------------------------
// Unbiased random draw
// ---------------------------------------------------------------------------------------------
/** A stream of random 32-bit integers: crypto.getRandomValues, or SHA-256 counter mode on a seed (reproducible). */
async function randomSource(seed) {
    if (seed === undefined) {
        return async () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    let counter = 0;
    let buf = [];
    return async () => {
        if (!buf.length) {
            const d = new Uint32Array(await subtle().digest('SHA-256', enc.encode(`${seed}:${counter++}`)));
            buf = [...d];
        }
        return buf.shift();
    };
}
/** Uniform integer in [0, n) with rejection sampling, so no driver is more likely than another. */
async function uniform(next, n) {
    const limit = Math.floor(0x1_0000_0000 / n) * n;
    for (;;) {
        const x = await next();
        if (x < limit)
            return x % n;
    }
}
/** SHA-256 of the sorted, de-duplicated pool IDs: proof of exactly who was in the pool. */
export async function poolHash(ids) {
    return hex(await subtle().digest('SHA-256', enc.encode([...new Set(ids)].sort().join('\n'))));
}
/**
 * Select `count` drivers (and optional alternates) from the pool, without replacement within this draw. Use a fresh
 * draw for each period and test type; never remove drivers who were tested before (382.305(i)(2)).
 * Pass `seed` (for example the period name plus a secret kept in your file) to make the draw reproducible for an auditor.
 */
export async function selectRandom(pool, count, opts = {}) {
    const ids = [...new Set(pool.map((x) => String(x).trim()).filter(Boolean))];
    if (ids.length !== pool.filter((x) => String(x).trim()).length)
        throw new Error('The pool has duplicate IDs; each driver must appear once.');
    const want = count + (opts.alternates ?? 0);
    if (count < 0 || !Number.isInteger(count))
        throw new Error('count must be a whole number.');
    if (want > ids.length)
        throw new Error(`Cannot select ${want} from a pool of ${ids.length}.`);
    // Sort first so the same pool and seed always give the same answer, whatever order the IDs came in.
    const order = [...ids].sort();
    const next = await randomSource(opts.seed);
    // Partial Fisher-Yates shuffle.
    for (let i = 0; i < want; i++) {
        const j = i + (await uniform(next, order.length - i));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return {
        testType: opts.testType ?? 'drug',
        selected: order.slice(0, count),
        alternates: order.slice(count, want),
        poolSize: ids.length,
        poolHash: await poolHash(ids),
        seed: opts.seed,
        method: opts.seed === undefined
            ? 'Fisher-Yates shuffle with rejection sampling on crypto.getRandomValues (CSPRNG)'
            : 'Fisher-Yates shuffle with rejection sampling on SHA-256 counter mode over the seed (reproducible)',
        at: opts.at ?? new Date().toISOString(),
        citation: '49 CFR 382.305(i)',
    };
}
/** Re-run a seeded selection and confirm it matches the record (same pool, same seed, same result). */
export async function verifySelection(pool, record) {
    const problems = [];
    if (record.seed === undefined)
        return { ok: false, problems: ['This selection was not seeded, so it cannot be re-run. Keep the record and the pool hash instead.'] };
    if ((await poolHash(pool)) !== record.poolHash)
        problems.push('The pool is not the same pool that was used for this selection.');
    const again = await selectRandom(pool, record.selected.length, { alternates: record.alternates.length, seed: record.seed, testType: record.testType, at: record.at });
    if (again.selected.join() !== record.selected.join())
        problems.push('Re-running the draw gives different selections.');
    if (again.alternates.join() !== record.alternates.join())
        problems.push('Re-running the draw gives different alternates.');
    return { ok: problems.length === 0, problems };
}
/** Did the year meet the minimums, and were tests spread through the year? */
export function checkYear(periods, rates = FMCSA_RATES) {
    const avg = averagePool(periods.map((p) => p.drivers));
    const req = annualMinimums(avg, rates);
    const done = { drug: periods.reduce((a, p) => a + p.drugTests, 0), alcohol: periods.reduce((a, p) => a + p.alcoholTests, 0) };
    const shortfall = { drug: Math.max(0, req.drug - done.drug), alcohol: Math.max(0, req.alcohol - done.alcohol) };
    const findings = [];
    if (shortfall.drug)
        findings.push(`${shortfall.drug} drug test(s) short of the ${req.drug} required (${rates.drug * 100}% of ${round(avg)} average drivers).`);
    if (shortfall.alcohol)
        findings.push(`${shortfall.alcohol} alcohol test(s) short of the ${req.alcohol} required (${rates.alcohol * 100}% of ${round(avg)} average drivers).`);
    // Spread: if tests are due at all, no more than half the periods should be empty, and no single period should hold more than half.
    const total = done.drug + done.alcohol;
    const empty = periods.filter((p) => p.drugTests + p.alcoholTests === 0).length;
    const biggest = Math.max(...periods.map((p) => p.drugTests + p.alcoholTests));
    const spreadOk = total === 0 || periods.length < 2 || (empty <= periods.length / 2 && biggest <= Math.max(1, total / 2));
    if (!spreadOk)
        findings.push('Tests look bunched into part of the year (rule of thumb: no more than half the periods empty, no period with more than half the tests). The rule requires dates spread reasonably throughout the calendar year.');
    if (!findings.length)
        findings.push('Minimums met and tests spread through the year.');
    return { averageDrivers: round(avg), required: { drug: req.drug, alcohol: req.alcohol }, completed: done, shortfall, spreadOk, findings, citations: ['49 CFR 382.305(b)', '49 CFR 382.305(j)(1)', '49 CFR 382.305(k)(2)'] };
}
const round = (x) => Math.round(x * 100) / 100;
