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
export declare const FMCSA_RATES: {
    readonly drug: 0.5;
    readonly alcohol: 0.1;
    readonly year: 2026;
    readonly source: "49 CFR 382.305(b); FMCSA calendar year 2026 rates (50% drug, 10% alcohol). Check transportation.gov/odapc/random-testing-rates each January.";
};
/** Average number of covered drivers: the sum of eligible drivers in each random testing period / number of periods (382.305(j)(1)). */
export declare function averagePool(driversPerPeriod: number[]): number;
/** The year's minimum number of tests: rate x average driver positions, rounded up so the minimum is met. */
export declare function annualMinimums(averageDrivers: number, rates?: {
    drug: number;
    alcohol: number;
}): {
    drug: number;
    alcohol: number;
    averageDrivers: number;
    rates: {
        drug: number;
        alcohol: number;
    };
};
/**
 * How many drivers to select in period `periodIndex` (0-based) of `periodsPerYear`, given the pool sizes so far
 * (including this period) and the tests already completed. Keeps the year on pace: by the end of period k the
 * running total reaches the rate on the running average pool, times k / periods.
 */
export declare function periodTarget(input: {
    periodsPerYear: number;
    periodIndex: number;
    /** Drivers in the pool for each period so far, including this one. */
    poolSoFar: number[];
    /** Tests completed in earlier periods (selections not tested do not count). */
    completedSoFar: number;
    rate: number;
}): number;
/** SHA-256 of the sorted, de-duplicated pool IDs: proof of exactly who was in the pool. */
export declare function poolHash(ids: string[]): Promise<string>;
export interface Selection {
    testType: 'drug' | 'alcohol' | 'both';
    selected: string[];
    alternates: string[];
    poolSize: number;
    poolHash: string;
    /** Present when the draw is reproducible. */
    seed?: string;
    method: string;
    at: string;
    citation: string;
}
/**
 * Select `count` drivers (and optional alternates) from the pool, without replacement within this draw. Use a fresh
 * draw for each period and test type; never remove drivers who were tested before (382.305(i)(2)).
 * Pass `seed` (for example the period name plus a secret kept in your file) to make the draw reproducible for an auditor.
 */
export declare function selectRandom(pool: string[], count: number, opts?: {
    alternates?: number;
    seed?: string;
    testType?: Selection['testType'];
    at?: string;
}): Promise<Selection>;
/** Re-run a seeded selection and confirm it matches the record (same pool, same seed, same result). */
export declare function verifySelection(pool: string[], record: Selection): Promise<{
    ok: boolean;
    problems: string[];
}>;
export interface YearCheck {
    averageDrivers: number;
    required: {
        drug: number;
        alcohol: number;
    };
    completed: {
        drug: number;
        alcohol: number;
    };
    shortfall: {
        drug: number;
        alcohol: number;
    };
    spreadOk: boolean;
    findings: string[];
    citations: string[];
}
/** Did the year meet the minimums, and were tests spread through the year? */
export declare function checkYear(periods: Array<{
    drivers: number;
    drugTests: number;
    alcoholTests: number;
}>, rates?: {
    drug: number;
    alcohol: number;
}): YearCheck;
