// Small-number JI toolkit for interactive pages (the Reference Library, the Practice Room, labs).
//
// Exact facts (factorisation, limits, monzos, ratio text) come from xen-tune-core, so every page
// agrees with the rest of the platform. Ratios here are plain integers [n, d] and monzos plain
// number arrays, so the fast paths (cents of a monzo, patent vals) can run inside search loops.
// Pages that store or exchange intervals use shared/xen/tuning.js (interval text) instead.
import * as X from '../xen-tune-core.browser.js';

/** The primes of the 15-odd-limit: every monzo here is in this basis unless a page passes its own. */
export const PRIMES = Object.freeze([2, 3, 5, 7, 11, 13]);

const LOG2 = new Map();
const log2Of = p => { if (!LOG2.has(p)) LOG2.set(p, Math.log2(p)); return LOG2.get(p); };
const BASES = new Map();
const basisOf = primes => {
  const key = primes.join(',');
  if (!BASES.has(key)) BASES.set(key, X.createPrimeBasis(primes.map(BigInt)));
  return BASES.get(key);
};
const exact = (n, d) => {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n <= 0 || d <= 0) throw new Error(`Not a positive ratio: ${n}/${d}`);
  return X.parseFraction(`${n}/${d}`);
};

/** Greatest common divisor of two non-negative integers. */
export function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

/** n/d in lowest terms, as [n, d]. */
export function reduce(n, d) { const g = gcd(n, d); return [n / g, d / g]; }

/** n/d moved by octaves into [1/1, 2/1), in lowest terms. */
export function octaveReduce(n, d) {
  while (n >= 2 * d) d *= 2;
  while (n < d) n *= 2;
  return reduce(n, d);
}

/** x with every factor of 2 removed. */
export function oddPart(x) { while (x > 0 && x % 2 === 0) x /= 2; return x; }

export const ratioKey = (n, d) => `${n}/${d}`;

/** Size of n/d in cents. Approximate: for display, sorting and sound, never for identity. */
export const cents = (n, d) => 1200 * Math.log2(n / d);

/** Odd limit of n/d (1 for 1/1 and powers of 2). */
export const oddLimit = (n, d) => Number(X.oddLimitOfBigRational(exact(n, d)));

/** Largest prime in n/d (1 for 1/1, 2 for powers of 2). */
export const primeLimit = (n, d) => Number(X.primeLimitOfBigRational(exact(n, d)));

/** Prime-exponent vector of n/d in `primes`. Throws if n/d needs a prime outside them. */
export function monzo(n, d, primes = PRIMES) {
  return X.toMonzoInBasis(exact(n, d), basisOf(primes)).exponents.map(Number);
}

/** The ratio a monzo stands for, as exact text such as "81/80". */
export function monzoRatio(m, primes = PRIMES) {
  let num = 1n, den = 1n;
  m.forEach((e, i) => {
    const p = BigInt(primes[i]);
    if (e > 0) num *= p ** BigInt(e);
    else if (e < 0) den *= p ** BigInt(-e);
  });
  const r = X.parseFraction(`${num}/${den}`);
  return `${r.num}/${r.den}`;
}

/** Size of a monzo in cents (fast; approximate). */
export function monzoCents(m, primes = PRIMES) {
  let s = 0;
  for (let i = 0; i < m.length; i++) if (m[i]) s += m[i] * log2Of(primes[i]);
  return s * 1200;
}

/** The patent val of an equal division of 2/1: each prime mapped to its nearest step. */
export const patentVal = (edo, primes = PRIMES) => primes.map(p => Math.round(edo * log2Of(p)));

/** Steps a monzo maps to under a val. */
export function valSteps(val, m) { let s = 0; for (let i = 0; i < m.length; i++) s += val[i] * m[i]; return s; }

/** Whether an EDO's patent val tempers a monzo out (maps it to 0 steps). */
export const tempersOut = (edo, m, primes = PRIMES) => valSteps(patentVal(edo, primes), m) === 0;

/**
 * Every ratio formed by two odd numbers up to `limit`, octave-reduced into [1/1, 2/1), sorted by size.
 * Each entry: { n, d, key, cents, oddLimit, primeLimit, pairs } where pairs lists the [a, b] that give it.
 */
export function oddLimitIntervals(limit) {
  const odds = [];
  for (let o = 1; o <= limit; o += 2) odds.push(o);
  const found = new Map();
  for (const a of odds) for (const b of odds) {
    const [n, d] = octaveReduce(a, b), key = ratioKey(n, d);
    if (!found.has(key)) found.set(key, { n, d, key, cents: cents(n, d), oddLimit: oddLimit(n, d), primeLimit: primeLimit(n, d), pairs: [] });
    found.get(key).pairs.push([a, b]);
  }
  return [...found.values()].sort((x, y) => x.cents - y.cents);
}
