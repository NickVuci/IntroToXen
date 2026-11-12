import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as J from '../shared/xen/ji.js';
import * as T from '../shared/xen/tuning.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

// The Reference Library's and Practice Room's own math before they moved onto shared/xen/ji.js.
// Kept here so the move is shown to change no result.
const PR = [2, 3, 5, 7, 11, 13];
const old = {
  gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; },
  red(n, d) { const g = old.gcd(n, d); return [n / g, d / g]; },
  octRed(n, d) { while (n >= 2 * d) d *= 2; while (n < d) n *= 2; return old.red(n, d); },
  oddPart(x) { while (x % 2 === 0) x /= 2; return x; },
  factor(x) { const f = {}; let p = 2; while (x > 1 && p <= x) { while (x % p === 0) { f[p] = (f[p] || 0) + 1; x /= p; } p++; } return f; },
  monzo(n, d) { const a = old.factor(n), b = old.factor(d); return PR.map(p => (a[p] || 0) - (b[p] || 0)); },
  pLimit(n, d) { const m = old.monzo(n, d); for (let i = PR.length - 1; i > 0; i--) if (m[i]) return PR[i]; return 2; },
  oLimit(n, d) { return Math.max(old.oddPart(n), old.oddPart(d)); },
  patent(n) { return PR.map(p => Math.round(n * Math.log2(p))); },
  mC(m) { let s = 0; for (let i = 0; i < 6; i++) s += m[i] * Math.log2(PR[i]); return s * 1200; },
  mStr(m) { let n = 1n, d = 1n; m.forEach((e, i) => { const p = BigInt(PR[i]); if (e > 0) n *= p ** BigInt(e); else if (e < 0) d *= p ** BigInt(-e); }); return n + '/' + d; },
  maxPrime(n) { let m = 1; for (let p = 3; p <= n; p += 2) { while (n % p === 0) { m = p; n /= p; } } return m; },
};

const ratios = [];
for (let n = 1; n <= 120; n++) for (let d = 1; d <= 120; d++) if (old.gcd(n, d) === 1) ratios.push([n, d]);
const thirteenLimit = ([n, d]) => old.factor(n * d) && Object.keys(old.factor(n * d)).every(p => Number(p) <= 13);

test('reduction, octave reduction and odd part match the previous page code', () => {
  for (let n = 1; n <= 200; n++) for (let d = 1; d <= 60; d++) {
    assert.deepEqual(J.reduce(n, d), old.red(n, d));
    assert.deepEqual(J.octaveReduce(n, d), old.octRed(n, d));
  }
  for (let x = 1; x <= 4096; x++) assert.equal(J.oddPart(x), old.oddPart(x));
});

test('limits and monzos match the previous page code within the 13-limit', () => {
  for (const r of ratios.filter(thirteenLimit)) {
    assert.deepEqual(J.monzo(...r), old.monzo(...r), `monzo of ${r.join('/')}`);
    assert.equal(J.oddLimit(...r), old.oLimit(...r), `odd limit of ${r.join('/')}`);
    // The library called 1/1 and 2/1 "2-limit"; the core says 1 for 1/1. Only that case differs.
    const expected = r[0] === 1 && r[1] === 1 ? 1 : old.pLimit(...r);
    assert.equal(J.primeLimit(...r), expected, `prime limit of ${r.join('/')}`);
  }
});

test('the Practice Room\'s prime of an odd product agrees with primeLimit', () => {
  for (let a = 1; a <= 15; a += 2) for (let b = 1; b <= 15; b += 2) {
    if (a === b) continue;
    const [n, d] = J.octaveReduce(a, b);
    assert.equal(J.primeLimit(n, d), Math.max(old.maxPrime(J.oddPart(n) * J.oddPart(d)), 2));
  }
});

test('monzo cents, ratio text and patent vals match the previous code and the core', () => {
  for (const r of ratios.filter(thirteenLimit).slice(0, 400)) {
    const m = J.monzo(...r);
    near(J.monzoCents(m), old.mC(m), 1e-9);
    near(J.monzoCents(m), T.intervalCents(`${r[0]}/${r[1]}`), 1e-6);
    assert.equal(J.monzoRatio(m), old.mStr(m));
  }
  for (let n = 1; n <= 99; n++) assert.deepEqual(J.patentVal(n), old.patent(n));
});

test('known tempering facts', () => {
  const syntonic = J.monzo(81, 80);
  assert.deepEqual(syntonic, [-4, 4, -1, 0, 0, 0]);
  for (const edo of [12, 19, 31]) assert.ok(J.tempersOut(edo, syntonic), `${edo}-EDO tempers out 81/80`);
  for (const edo of [22, 41, 53]) assert.ok(!J.tempersOut(edo, syntonic), `${edo}-EDO keeps 81/80`);
  assert.equal(J.monzoRatio([-4, 4, -1, 0, 0, 0]), '81/80');
  near(J.monzoCents(syntonic), 21.5063, 0.00005);
});

test('the 15-odd-limit set agrees with the platform facade', () => {
  for (const limit of [3, 5, 7, 9, 11, 13, 15]) {
    const mine = J.oddLimitIntervals(limit).map(i => i.key);
    const facade = T.jiIntervals(limit).map(i => i.text).filter(t => t !== '2/1');
    assert.deepEqual(mine, facade, `${limit}-odd-limit`);
  }
  const set = J.oddLimitIntervals(15);
  assert.equal(set[0].key, '1/1');
  assert.ok(set.every(i => i.oddLimit <= 15 && i.cents >= 0 && i.cents < 1200));
});
