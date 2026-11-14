# X3 DOT Random

**FMCSA random drug and alcohol testing (49 CFR 382.305), done right and provable.** How many tests the year and this period need, and an unbiased random draw with a fingerprint of the pool, reproducible for an auditor.

**[Try the random selector →](https://x3allamerican.github.io/x3-dot-random/)** Runs in your browser; nothing is uploaded.

Built and maintained by **[X3 Fleet Safety](https://x3fleetsafety.com)**.

Common mistakes this prevents: using `Math.random()` or a spreadsheet `RAND()` with modulo bias, removing drivers after they are tested (every driver must have an equal chance each draw), testing on the year-end pool instead of the average, and bunching tests into December.

## Install

```sh
npm install github:x3allamerican/x3-dot-random
```

## Use

```ts
import { averagePool, annualMinimums, periodTarget, selectRandom, verifySelection, checkYear } from '@x3/dot-random';

annualMinimums(averagePool([40, 44, 38, 42])); // { drug: 21, alcohol: 5, averageDrivers: 41, ... }

// Quarter 2: pool sizes so far, tests completed so far.
const n = periodTarget({ periodsPerYear: 4, periodIndex: 1, poolSoFar: [40, 42], completedSoFar: 4, rate: 0.5 });

const pick = await selectRandom(poolIds, n, { alternates: 2, seed: '2026-Q2-drug:' + secret });
pick.selected;  // ['EMP-1007', ...]
pick.poolHash;  // SHA-256 of the sorted pool: proves who was in it
await verifySelection(poolIds, pick); // { ok: true } — an auditor can re-run it

checkYear([{ drivers: 40, drugTests: 5, alcoholTests: 1 }, /* ... each period */]);
// { required, completed, shortfall, spreadOk, findings }
```

## How the draw works

- Unique IDs are sorted, then a partial Fisher-Yates shuffle picks the drivers and alternates.
- Each pick is a uniform integer by rejection sampling, so no driver is more likely than another.
- Without a seed, randomness comes from `crypto.getRandomValues` (a CSPRNG). With a seed, it comes from SHA-256 in counter mode over the seed, so the same pool and seed always give the same result.
- The test suite checks uniformity with a chi-square test over 20,000 draws.

Keep the seed private until testing is done, and keep the selection record (date, method, pool hash, selected, alternates) with your random testing files.

## Rules covered

| Rule | Citation |
|---|---|
| Minimum rates: 50% drugs, 10% alcohol (FMCSA kept both for 2026) | 49 CFR 382.305(b) |
| Scientifically valid method; equal chance each selection; tested in the selection period | 382.305(i) |
| Average number of driver positions across periods | 382.305(j)(1) |
| Unannounced and spread reasonably through the year | 382.305(k) |

Rates can change each January; pass `{ drug, alcohol }` to override. Other DOT agencies (FTA, FAA, FRA, PHMSA, USCG) set their own rates.

## Limits

Decision support, not legal advice. The "spread through the year" check is a rule of thumb, not a regulatory formula. Pools should hold covered drivers only.

## Develop

```sh
npm install
npm test
npm run build
```

## License

MIT. Free for any use, including commercial.

---

**[X3 Fleet Safety](https://x3fleetsafety.com)** runs driver qualification, hours of service, drug and alcohol programs and CSA in one place.
