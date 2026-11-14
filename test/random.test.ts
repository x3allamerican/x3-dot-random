import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averagePool, annualMinimums, periodTarget, selectRandom, verifySelection, poolHash, checkYear, FMCSA_RATES } from '../src/index.ts';

const POOL = Array.from({ length: 40 }, (_, i) => `D${String(i + 1).padStart(3, '0')}`);

test('average pool and annual minimums (382.305(b), (j)(1))', () => {
  assert.equal(averagePool([40, 44, 38, 42]), 41);
  assert.deepEqual(annualMinimums(41), { drug: 21, alcohol: 5, averageDrivers: 41, rates: { drug: 0.5, alcohol: 0.1 } });
  assert.deepEqual(annualMinimums(40), { drug: 20, alcohol: 4, averageDrivers: 40, rates: { drug: 0.5, alcohol: 0.1 } });
  assert.equal(annualMinimums(3).alcohol, 1); // a small fleet still needs at least one
  assert.equal(FMCSA_RATES.drug, 0.5);
  assert.throws(() => averagePool([]), /each testing period/);
});

test('quarterly targets keep the year on pace', () => {
  const pools = [40, 40, 40, 40];
  let done = 0;
  const picks: number[] = [];
  for (let k = 0; k < 4; k++) {
    const n = periodTarget({ periodsPerYear: 4, periodIndex: k, poolSoFar: pools.slice(0, k + 1), completedSoFar: done, rate: 0.5 });
    picks.push(n); done += n;
  }
  assert.deepEqual(picks, [5, 5, 5, 5]);
  // A missed test in Q1 is made up in Q2.
  assert.equal(periodTarget({ periodsPerYear: 4, periodIndex: 1, poolSoFar: [40, 40], completedSoFar: 4, rate: 0.5 }), 6);
  assert.throws(() => periodTarget({ periodsPerYear: 4, periodIndex: 4, poolSoFar: [1, 1, 1, 1, 1], completedSoFar: 0, rate: 0.5 }), /periodIndex/);
});

test('selection: right counts, no duplicates, alternates separate, pool hash recorded', async () => {
  const s = await selectRandom(POOL, 5, { alternates: 2 });
  assert.equal(s.selected.length, 5);
  assert.equal(s.alternates.length, 2);
  assert.equal(new Set([...s.selected, ...s.alternates]).size, 7);
  assert.ok(s.selected.every((x) => POOL.includes(x)));
  assert.equal(s.poolHash, await poolHash([...POOL].reverse()));
  assert.equal(s.citation, '49 CFR 382.305(i)');
  await assert.rejects(selectRandom(POOL, 41), /pool of 40/);
  await assert.rejects(selectRandom(['A', 'A', 'B'], 1), /duplicate/);
});

test('seeded draws are reproducible and independent of input order', async () => {
  const a = await selectRandom(POOL, 5, { seed: '2026-Q1-drug:secret', alternates: 1 });
  const b = await selectRandom([...POOL].reverse(), 5, { seed: '2026-Q1-drug:secret', alternates: 1 });
  assert.deepEqual(a.selected, b.selected);
  const c = await selectRandom(POOL, 5, { seed: '2026-Q2-drug:secret' });
  assert.notDeepEqual(a.selected, c.selected);
  assert.deepEqual(await verifySelection(POOL, a), { ok: true, problems: [] });
  const swapped = await verifySelection([...POOL.slice(1), 'D999'], a);
  assert.equal(swapped.ok, false);
  assert.match(swapped.problems[0], /not the same pool/);
});

test('every driver has an equal chance (uniformity over 20,000 seeded draws)', async () => {
  const counts = new Map(POOL.map((x) => [x, 0]));
  const draws = 20_000;
  for (let i = 0; i < draws; i++) {
    const s = await selectRandom(POOL.slice(0, 10), 1, { seed: `u${i}` });
    counts.set(s.selected[0], counts.get(s.selected[0])! + 1);
  }
  const expected = draws / 10;
  const chi2 = [...counts.values()].slice(0, 10).reduce((a, o) => a + (o - expected) ** 2 / expected, 0);
  assert.ok(chi2 < 27.88, `chi-square ${chi2.toFixed(2)} (p < 0.001 cutoff for 9 df is 27.88)`);
});

test('checkYear finds shortfalls and bunching', () => {
  const ok = checkYear([{ drivers: 40, drugTests: 5, alcoholTests: 1 }, { drivers: 40, drugTests: 5, alcoholTests: 1 }, { drivers: 40, drugTests: 5, alcoholTests: 1 }, { drivers: 40, drugTests: 5, alcoholTests: 1 }]);
  assert.deepEqual([ok.shortfall, ok.spreadOk], [{ drug: 0, alcohol: 0 }, true]);
  const bad = checkYear([{ drivers: 40, drugTests: 0, alcoholTests: 0 }, { drivers: 40, drugTests: 0, alcoholTests: 0 }, { drivers: 40, drugTests: 0, alcoholTests: 0 }, { drivers: 40, drugTests: 18, alcoholTests: 4 }]);
  assert.deepEqual(bad.shortfall, { drug: 2, alcohol: 0 });
  assert.equal(bad.spreadOk, false);
  assert.equal(bad.findings.length, 2);
});
