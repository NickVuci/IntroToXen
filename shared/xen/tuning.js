// Math facade for playground pages. The only file that imports the math bundle.
//
// Pitches cross every module boundary as *interval text*:
//   "5/4"     an exact ratio (canonical: reduced, always with a denominator)
//   "702.3c"  cents, explicitly approximate
// Nothing outside this file sees a xen-tune-core type.
import * as X from '../xen-tune-core.browser.js';

const RATIO = /^(\d+)(?:\/(\d+))?$/;
const CENTS = /^(-?\d+(?:\.\d+)?)c$/;

function exact(text) {
  const match = RATIO.exec(text);
  if (!match) return null;
  if (BigInt(match[1]) === 0n || (match[2] !== undefined && BigInt(match[2]) === 0n)) return null;
  return X.parseFraction(`${match[1]}/${match[2] ?? '1'}`);
}

const ratioText = r => `${r.num}/${r.den}`;
const centsText = cents => `${Number(cents.toFixed(4))}c`;

/** Canonical form of an interval. Throws on anything that is not interval text. */
export function parseInterval(input) {
  const text = String(input).trim();
  const r = exact(text);
  if (r) return { text: ratioText(r), exact: true };
  const cents = CENTS.exec(text);
  if (cents) return { text: centsText(Number(cents[1])), exact: false };
  throw new Error(`Not an interval: "${input}". Write a ratio such as 7/4, or cents such as 702.3c.`);
}

export const isInterval = input => { try { parseInterval(input); return true; } catch { return false; } };
export const isExact = text => parseInterval(text).exact;

/** Frequency ratio as a float. For audio and drawing only; never store the result. */
export function intervalRatio(text) {
  const { text: canonical, exact: isRatio } = parseInterval(text);
  return isRatio ? X.ratioToApproxNumber(exact(canonical)) : 2 ** (Number(canonical.slice(0, -1)) / 1200);
}

export const intervalCents = text => 1200 * Math.log2(intervalRatio(text));

function combine(a, b, sign) {
  const pa = parseInterval(a), pb = parseInterval(b);
  if (pa.exact && pb.exact) {
    const ra = exact(pa.text), rb = exact(pb.text);
    return ratioText(sign > 0 ? ra.mul(rb) : ra.div(rb));
  }
  return centsText(intervalCents(pa.text) + sign * intervalCents(pb.text));
}

/** Stack two intervals. Exact when both are ratios; otherwise the result is cents. */
export const multiply = (a, b) => combine(a, b, 1);
export const divide = (a, b) => combine(a, b, -1);

export function power(text, n) {
  let out = '1/1';
  for (let i = 0; i < Math.abs(n); i += 1) out = n > 0 ? multiply(out, text) : divide(out, text);
  return out;
}

export function compare(a, b) {
  const pa = parseInterval(a), pb = parseInterval(b);
  if (pa.exact && pb.exact) return exact(pa.text).cmp(exact(pb.text));
  const d = intervalCents(pa.text) - intervalCents(pb.text);
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

function requireExact(text, what) {
  const r = exact(parseInterval(text).text);
  if (!r) throw new Error(`${what} needs an exact ratio; "${text}" is approximate.`);
  return r;
}

/** Odd limit and prime limit of an exact ratio. */
export function classify(text) {
  const c = X.classifyJiInterval(requireExact(text, 'Classification'));
  return { oddLimit: Number(c.oddLimit), primeLimit: Number(c.primeLimit) };
}

const basisOf = primes => X.createPrimeBasis(primes.map(BigInt));

/** Prime-exponent vector. With `primes`, in that basis (throws if the ratio lies outside it). */
export function monzo(text, primes) {
  const r = requireExact(text, 'A monzo');
  const m = primes ? X.toMonzoInBasis(r, basisOf(primes)) : X.toMonzoAutoBasis(r).monzo;
  return { primes: m.basis.primes.map(Number), exponents: m.exponents.map(Number) };
}

/** Whether an exact ratio lies in a prime subgroup such as [2, 3, 7]. */
export const inSubgroup = (text, primes) => X.isInPrimeSubgroup(requireExact(text, 'A subgroup test'), basisOf(primes));

const jiCache = new Map();
function jiWithinOctave(oddLimit) {
  if (!jiCache.has(oddLimit)) {
    const limit = BigInt(oddLimit);
    const list = X.generateJiIntervals({ searchMaxNumerator: 2n * limit + 2n, searchMaxDenominator: limit + 1n, maxOddLimit: limit })
      .filter(r => r.num >= r.den && r.num <= 2n * r.den)
      .map(r => ({ text: ratioText(r), cents: 1200 * Math.log2(X.ratioToApproxNumber(r)) }))
      .sort((a, b) => a.cents - b.cents);
    jiCache.set(oddLimit, list);
  }
  return jiCache.get(oddLimit);
}

/** Every ratio from 1/1 to 2/1 within an odd limit, ascending. */
export const jiIntervals = (oddLimit = 15) => jiWithinOctave(oddLimit).map(item => ({ ...item }));

/** The nearest ratio within an odd limit to a size in cents (0–1200). */
export function nearestJi(cents, { oddLimit = 15 } = {}) {
  let best = null;
  for (const item of jiWithinOctave(oddLimit)) {
    if (!best || Math.abs(item.cents - cents) < Math.abs(best.cents - cents)) best = item;
  }
  return { text: best.text, cents: best.cents, errorCents: cents - best.cents };
}

/** "386.31¢" — the house form for cents in an interface. */
export const formatCents = cents => `${cents.toFixed(2)}¢`;

// ----- tunings and pitches ---------------------------------------------------
// tuning: { referenceHz, equave, scale: [interval text, ascending, first "1/1", all below the equave] }
// pitch:  { degree, equaveOffset }  or  { interval }

export function normalizeTuning(tuning) {
  const referenceHz = Number(tuning?.referenceHz);
  if (!(referenceHz >= 20 && referenceHz <= 2000)) throw new Error('The reference frequency must be between 20 and 2000 Hz.');
  const equave = parseInterval(tuning.equave ?? '2/1').text;
  if (compare(equave, '1/1') <= 0) throw new Error('The equave must be larger than 1/1.');
  const seen = new Set();
  const scale = (Array.isArray(tuning.scale) ? tuning.scale : []).map(item => parseInterval(item).text)
    .filter(text => (seen.has(text) ? false : (seen.add(text), true)))
    .sort(compare);
  if (!scale.length || scale[0] !== '1/1') scale.unshift('1/1');
  if (scale.some(text => compare(text, '1/1') < 0 || compare(text, equave) >= 0)) throw new Error('Every scale interval must lie from 1/1 up to, but not including, the equave.');
  if (scale.length > 64) throw new Error('A scale may hold at most 64 intervals.');
  const out = { referenceHz, equave, scale };
  if (Array.isArray(tuning.subgroup)) out.subgroup = tuning.subgroup.map(Number);
  return out;
}

/** The interval above the reference that a pitch names. Exact whenever its parts are. */
export function pitchInterval(tuning, pitch) {
  if (pitch.interval !== undefined) return parseInterval(pitch.interval).text;
  const step = tuning.scale[pitch.degree];
  if (step === undefined) throw new Error(`The scale has no degree ${pitch.degree}.`);
  return multiply(step, power(tuning.equave, pitch.equaveOffset ?? 0));
}

export const pitchHz = (tuning, pitch) => tuning.referenceHz * intervalRatio(pitchInterval(tuning, pitch));

/** Place any interval on the scale: a degree pitch when it matches a scale note in some equave, else an interval pitch. */
export function pitchFromInterval(tuning, text) {
  const target = parseInterval(text).text;
  for (let equaveOffset = -4; equaveOffset <= 4; equaveOffset += 1) {
    const shift = power(tuning.equave, equaveOffset);
    const degree = tuning.scale.findIndex(step => compare(multiply(step, shift), target) === 0 && isExact(step) === isExact(target));
    if (degree >= 0) return { degree, equaveOffset };
  }
  return { interval: target };
}
