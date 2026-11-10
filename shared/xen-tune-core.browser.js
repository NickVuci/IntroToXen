// src/core/bigint.ts
var abs = (a) => {
  return a < 0n ? -a : a;
};
var gcd = (a, b) => {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
};
var normalizeSign = (num, den) => {
  if (den < 0n) {
    return { num: -num, den: -den };
  }
  return { num, den };
};

// src/core/errors.ts
class InvariantViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvariantViolationError";
  }
}

class NonExactOperationError extends Error {
  constructor(message) {
    super(message);
    this.name = "NonExactOperationError";
  }
}

// src/core/bigRational.ts
class BigRational {
  _num;
  _den;
  constructor(num, den) {
    this._num = num;
    this._den = den;
  }
  static from(num, den = 1n) {
    if (den === 0n) {
      throw new InvariantViolationError("Denominator must not be zero.");
    }
    const signed = normalizeSign(num, den);
    if (signed.num === 0n) {
      return new BigRational(0n, 1n);
    }
    const divisor = gcd(abs(signed.num), signed.den);
    return new BigRational(signed.num / divisor, signed.den / divisor);
  }
  static fromInt(value) {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) {
        throw new NonExactOperationError("Number input must be a safe integer.");
      }
      return BigRational.from(BigInt(value));
    }
    return BigRational.from(value);
  }
  get num() {
    return this._num;
  }
  get den() {
    return this._den;
  }
  add(other) {
    return BigRational.from(this._num * other._den + other._num * this._den, this._den * other._den);
  }
  sub(other) {
    return BigRational.from(this._num * other._den - other._num * this._den, this._den * other._den);
  }
  mul(other) {
    const g1 = gcd(abs(this._num), other._den);
    const g2 = gcd(abs(other._num), this._den);
    const leftNum = this._num / g1;
    const rightDen = other._den / g1;
    const rightNum = other._num / g2;
    const leftDen = this._den / g2;
    return BigRational.from(leftNum * rightNum, leftDen * rightDen);
  }
  div(other) {
    if (other._num === 0n) {
      throw new InvariantViolationError("Division by zero.");
    }
    const g1 = gcd(abs(this._num), abs(other._num));
    const g2 = gcd(this._den, other._den);
    const leftNum = this._num / g1;
    const rightNum = other._num / g1;
    const leftDen = this._den / g2;
    const rightDen = other._den / g2;
    return BigRational.from(leftNum * rightDen, leftDen * rightNum);
  }
  neg() {
    return new BigRational(-this._num, this._den);
  }
  inv() {
    if (this._num === 0n) {
      throw new InvariantViolationError("Cannot invert zero.");
    }
    return BigRational.from(this._den, this._num);
  }
  abs() {
    if (this._num >= 0n) {
      return this;
    }
    return new BigRational(-this._num, this._den);
  }
  cmp(other) {
    const left = this._num * other._den;
    const right = other._num * this._den;
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  }
  eq(other) {
    return this.cmp(other) === 0;
  }
  toFractionString() {
    return `${this._num}/${this._den}`;
  }
  toString() {
    return this.toFractionString();
  }
}
// src/core/types.ts
function isPositiveRational(value) {
  return value.num > 0n;
}
function isNonUnisonPeriod(value) {
  return value.num !== value.den;
}
function makeRationalExpr(value) {
  if (!isPositiveRational(value)) {
    throw new InvariantViolationError("Symbolic rational interval expressions must be strictly positive.");
  }
  return {
    kind: "rational",
    value
  };
}
function makeEdStepExpr(steps, divisions, period) {
  if (divisions < 1n) {
    throw new InvariantViolationError("ED-step symbolic expressions require divisions >= 1.");
  }
  if (!isPositiveRational(period)) {
    throw new InvariantViolationError("ED-step symbolic expressions require a strictly positive period.");
  }
  if (!isNonUnisonPeriod(period)) {
    throw new InvariantViolationError("ED-step symbolic expressions require a non-unison period (not 1/1).");
  }
  return {
    kind: "edStep",
    steps,
    divisions,
    period
  };
}
function makeMulExpr(factors) {
  if (factors.length < 1) {
    throw new InvariantViolationError("Multiplicative symbolic expressions require at least one factor.");
  }
  return {
    kind: "mul",
    factors: [...factors]
  };
}
function makePowExpr(base, exponent) {
  if (exponent === 0n) {
    throw new InvariantViolationError("Power symbolic expressions require a non-zero exponent.");
  }
  return {
    kind: "pow",
    base,
    exponent
  };
}
function isIntervalExpr(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const raw = value;
  if (typeof raw.kind !== "string") {
    return false;
  }
  if (raw.kind === "rational") {
    const rationalValue = value.value;
    return rationalValue instanceof BigRational && isPositiveRational(rationalValue);
  }
  if (raw.kind === "edStep") {
    const candidate = value;
    return typeof candidate.steps === "bigint" && typeof candidate.divisions === "bigint" && candidate.divisions >= 1n && candidate.period instanceof BigRational && isPositiveRational(candidate.period) && isNonUnisonPeriod(candidate.period);
  }
  if (raw.kind === "mul") {
    const candidate = value;
    if (!Array.isArray(candidate.factors) || candidate.factors.length < 1) {
      return false;
    }
    return candidate.factors.every((factor) => isIntervalExpr(factor));
  }
  if (raw.kind === "pow") {
    const candidate = value;
    return typeof candidate.exponent === "bigint" && candidate.exponent !== 0n && isIntervalExpr(candidate.base);
  }
  return false;
}

// src/core/equality.ts
function structuralKeyFromCanonical(expr) {
  if (expr.kind === "rational") {
    return `r(${expr.value.num.toString()}/${expr.value.den.toString()})`;
  }
  if (expr.kind === "edStep") {
    return `e(${expr.steps.toString()}/${expr.divisions.toString()}@${expr.period.num.toString()}/${expr.period.den.toString()})`;
  }
  if (expr.kind === "pow") {
    return `p(${structuralKeyFromCanonical(expr.base)}^${expr.exponent.toString()})`;
  }
  return `m(${expr.factors.map((factor) => structuralKeyFromCanonical(factor)).join("*")})`;
}
function compareLexicographic(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
function canonicalizeMulFactors(factors) {
  const flattened = [];
  for (const factor of factors) {
    const canonicalFactor = canonicalizeIntervalExpr(factor);
    if (canonicalFactor.kind === "mul") {
      flattened.push(...canonicalFactor.factors);
      continue;
    }
    flattened.push(canonicalFactor);
  }
  const sorted = [...flattened].sort((left, right) => compareLexicographic(structuralKeyFromCanonical(left), structuralKeyFromCanonical(right)));
  if (sorted.length === 1) {
    const single = sorted[0];
    if (single === undefined) {
      throw new InvariantViolationError("Canonicalization failed to preserve multiplicative factor.");
    }
    return single;
  }
  return makeMulExpr(sorted);
}
function canonicalizePow(base, exponent) {
  let currentBase = canonicalizeIntervalExpr(base);
  let currentExponent = exponent;
  while (currentBase.kind === "pow") {
    currentExponent *= currentBase.exponent;
    currentBase = currentBase.base;
  }
  return makePowExpr(currentBase, currentExponent);
}
function canonicalizeIntervalExpr(expr) {
  if (expr.kind === "rational") {
    return makeRationalExpr(expr.value);
  }
  if (expr.kind === "edStep") {
    return makeEdStepExpr(expr.steps, expr.divisions, expr.period);
  }
  if (expr.kind === "mul") {
    return canonicalizeMulFactors(expr.factors);
  }
  return canonicalizePow(expr.base, expr.exponent);
}
function intervalExprStructuralKey(expr) {
  const canonical = canonicalizeIntervalExpr(expr);
  return structuralKeyFromCanonical(canonical);
}
function equalIntervalExpr(a, b) {
  return intervalExprStructuralKey(a) === intervalExprStructuralKey(b);
}
function compareIntervalExprStructural(a, b) {
  return compareLexicographic(intervalExprStructuralKey(a), intervalExprStructuralKey(b));
}

// src/core/hash.ts
var FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
var FNV64_PRIME = 0x100000001b3n;
var U64_MASK = 0xffffffffffffffffn;
function fnv1a64(input) {
  const bytes = new TextEncoder().encode(input);
  let hash = FNV64_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = hash * FNV64_PRIME & U64_MASK;
  }
  return hash;
}
function stableHashString(input) {
  return fnv1a64(input).toString(16).padStart(16, "0");
}
function stableHashMonzoShape(basisPrimes, exponents) {
  if (basisPrimes.length !== exponents.length) {
    throw new InvariantViolationError("Monzo hash requires basis and exponent vectors of equal length.");
  }
  const canonicalParts = [];
  for (let i = 0;i < basisPrimes.length; i += 1) {
    const prime = basisPrimes[i];
    const exponent = exponents[i];
    if (prime === undefined || exponent === undefined) {
      throw new InvariantViolationError("Monzo hash encountered undefined basis or exponent entries.");
    }
    canonicalParts.push(`${prime.toString()}:${exponent.toString()}`);
  }
  return stableHashString(`monzo|${canonicalParts.join("|")}`);
}
function stableHashIntervalExpr(expr) {
  return stableHashString(`expr|${intervalExprStructuralKey(expr)}`);
}
// src/core/intervalSet.ts
function intervalStructuralKey(interval) {
  if (interval.num <= 0n) {
    throw new InvariantViolationError("Exact interval sets are defined only for strictly positive intervals.");
  }
  return `${interval.num.toString()}/${interval.den.toString()}`;
}
function compareStructural(a, b) {
  if (a.num < b.num) {
    return -1;
  }
  if (a.num > b.num) {
    return 1;
  }
  if (a.den < b.den) {
    return -1;
  }
  if (a.den > b.den) {
    return 1;
  }
  return 0;
}
function compareNumeric(a, b) {
  return a.cmp(b);
}
function canonicalizeExactIntervalSet(intervals, order = "structural") {
  const dedup = new Map;
  for (const interval of intervals) {
    if (interval.num <= 0n) {
      throw new InvariantViolationError("Exact interval sets are defined only for strictly positive intervals.");
    }
    const canonical = BigRational.from(interval.num, interval.den);
    const key = intervalStructuralKey(canonical);
    if (!dedup.has(key)) {
      dedup.set(key, canonical);
    }
  }
  const normalized = [...dedup.values()];
  normalized.sort((a, b) => {
    if (order === "numeric") {
      return compareNumeric(a, b);
    }
    return compareStructural(a, b);
  });
  return normalized;
}
// src/convert/exact/edstep.ts
function absBigInt(value) {
  return value < 0n ? -value : value;
}
function powBigInt(base, exponent) {
  let result = 1n;
  let currentBase = base;
  let currentExponent = exponent;
  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) {
      result *= currentBase;
    }
    currentBase *= currentBase;
    currentExponent /= 2n;
  }
  return result;
}
function powRationalInteger(base, exponent) {
  if (exponent === 0n) {
    return BigRational.from(1n, 1n);
  }
  let currentExponent = absBigInt(exponent);
  let currentBase = base;
  let result = BigRational.from(1n, 1n);
  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) {
      result = result.mul(currentBase);
    }
    currentBase = currentBase.mul(currentBase);
    currentExponent /= 2n;
  }
  return exponent > 0n ? result : result.inv();
}
function integerNthRootExact(value, degree) {
  if (degree <= 0n) {
    throw new InvariantViolationError("Root degree must be >= 1.");
  }
  if (value < 1n) {
    throw new InvariantViolationError("Root input must be >= 1.");
  }
  if (value === 1n || degree === 1n) {
    return value;
  }
  let low = 1n;
  let high = value;
  while (low <= high) {
    const mid = (low + high) / 2n;
    const powered = powBigInt(mid, degree);
    if (powered === value) {
      return mid;
    }
    if (powered < value) {
      low = mid + 1n;
    } else {
      high = mid - 1n;
    }
  }
  return null;
}
function isEdStepExactlyConvertible(edStep) {
  try {
    edStepToRationalExact(edStep);
    return true;
  } catch (error) {
    if (error instanceof NonExactOperationError || error instanceof InvariantViolationError) {
      return false;
    }
    throw error;
  }
}
function edStepToRationalExact(edStep) {
  if (edStep.divisions < 1n) {
    throw new InvariantViolationError("ED-step conversion requires divisions >= 1.");
  }
  if (edStep.period.num <= 0n) {
    throw new InvariantViolationError("ED-step conversion requires a strictly positive period.");
  }
  const common = gcd(absBigInt(edStep.steps), edStep.divisions);
  const reducedSteps = edStep.steps / common;
  const reducedDivisions = edStep.divisions / common;
  if (reducedDivisions === 1n) {
    return powRationalInteger(edStep.period, reducedSteps);
  }
  const rootNum = integerNthRootExact(edStep.period.num, reducedDivisions);
  const rootDen = integerNthRootExact(edStep.period.den, reducedDivisions);
  if (rootNum === null || rootDen === null) {
    throw new NonExactOperationError("ED-step expression is not exactly representable as a rational interval.");
  }
  const root = BigRational.from(rootNum, rootDen);
  return powRationalInteger(root, reducedSteps);
}

// src/convert/exact/predicates.ts
function absBigInt2(value) {
  return value < 0n ? -value : value;
}
function powRationalInteger2(base, exponent) {
  if (exponent === 0n) {
    return BigRational.from(1n, 1n);
  }
  let currentExponent = absBigInt2(exponent);
  let currentBase = base;
  let result = BigRational.from(1n, 1n);
  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) {
      result = result.mul(currentBase);
    }
    currentBase = currentBase.mul(currentBase);
    currentExponent /= 2n;
  }
  return exponent > 0n ? result : result.inv();
}
function evaluateIntervalExprExactly(expr) {
  if (expr.kind === "rational") {
    return expr.value;
  }
  if (expr.kind === "edStep") {
    return edStepToRationalExact(expr);
  }
  if (expr.kind === "mul") {
    if (expr.factors.length < 1) {
      throw new InvariantViolationError("Exact interval evaluation requires at least one multiplicative factor.");
    }
    let result = BigRational.from(1n, 1n);
    for (const factor of expr.factors) {
      result = result.mul(evaluateIntervalExprExactly(factor));
    }
    return result;
  }
  if (expr.exponent === 0n) {
    throw new InvariantViolationError("Exact interval evaluation rejects zero-power symbolic expressions.");
  }
  return powRationalInteger2(evaluateIntervalExprExactly(expr.base), expr.exponent);
}
function isIntervalExprExactlyEvaluable(expr) {
  try {
    evaluateIntervalExprExactly(expr);
    return true;
  } catch (error) {
    if (error instanceof NonExactOperationError || error instanceof InvariantViolationError) {
      return false;
    }
    throw error;
  }
}

// src/eval/evaluator.ts
function absNumber(value) {
  return value < 0 ? -value : value;
}
function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvariantViolationError(`${label} must be a finite number > 0.`);
  }
}
function normalizeNegativeZero(input) {
  return /^-0(?:\.0+)?$/.test(input) ? input.slice(1) : input;
}
function stripLeadingZeros(input) {
  const normalized = input.replace(/^0+(?=\d)/, "");
  return normalized.length === 0 ? "0" : normalized;
}
function toPlainNumberString(input) {
  if (!Number.isFinite(input)) {
    throw new InvariantViolationError("Plain-number formatting requires a finite value.");
  }
  const normalizedZero = Object.is(input, -0) ? 0 : input;
  const raw = normalizedZero.toString();
  if (!/[eE]/.test(raw)) {
    return raw;
  }
  const exponentMatch = raw.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (exponentMatch === null) {
    throw new InvariantViolationError("Could not parse exponential number notation.");
  }
  const sign = exponentMatch[1] ?? "";
  const integerPart = exponentMatch[2] ?? "0";
  const fractionalPart = exponentMatch[3] ?? "";
  const exponentPart = exponentMatch[4];
  if (exponentPart === undefined) {
    throw new InvariantViolationError("Missing exponent in exponential number notation.");
  }
  const exponent = Number(exponentPart);
  const digits = `${integerPart}${fractionalPart}`;
  const decimalIndex = integerPart.length;
  const shiftedIndex = decimalIndex + exponent;
  if (shiftedIndex <= 0) {
    const zeros = "0".repeat(-shiftedIndex);
    return `${sign}0.${zeros}${stripLeadingZeros(digits)}`;
  }
  if (shiftedIndex >= digits.length) {
    const zeros = "0".repeat(shiftedIndex - digits.length);
    return `${sign}${stripLeadingZeros(digits)}${zeros}`;
  }
  const whole = stripLeadingZeros(digits.slice(0, shiftedIndex));
  const fraction = digits.slice(shiftedIndex);
  return `${sign}${whole}.${fraction}`;
}
function toPlainIntegerString(input) {
  const asPlain = toPlainNumberString(input);
  const [whole] = asPlain.split(".");
  if (whole === undefined || whole.length === 0) {
    return "0";
  }
  return whole === "-0" ? "0" : whole;
}
function parseIntegerField(value, min, label) {
  if (!Number.isInteger(value) || value < min) {
    throw new InvariantViolationError(`${label} must be an integer >= ${min.toString()}.`);
  }
}
function roundToIntegerWithMode(value, mode) {
  const epsilon = 0.000000000001;
  if (mode === "floor") {
    return Math.floor(value);
  }
  if (mode === "ceil") {
    return Math.ceil(value);
  }
  if (mode === "trunc") {
    return value < 0 ? Math.ceil(value) : Math.floor(value);
  }
  if (mode === "halfUp") {
    return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
  }
  const base = Math.floor(value);
  const fraction = value - base;
  if (fraction < 0.5 - epsilon) {
    return base;
  }
  if (fraction > 0.5 + epsilon) {
    return base + 1;
  }
  return base % 2 === 0 ? base : base + 1;
}
function formatFixed(value, decimals, rounding) {
  const scale = 10 ** decimals;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new InvariantViolationError("Precision scale overflow during fixed rounding.");
  }
  const roundedInteger = roundToIntegerWithMode(value * scale, rounding);
  const sign = roundedInteger < 0 ? "-" : "";
  const absoluteDigits = toPlainIntegerString(absNumber(roundedInteger));
  if (decimals === 0) {
    return normalizeNegativeZero(`${sign}${absoluteDigits}`);
  }
  const padded = absoluteDigits.padStart(decimals + 1, "0");
  const splitIndex = padded.length - decimals;
  const whole = padded.slice(0, splitIndex);
  const fraction = padded.slice(splitIndex);
  return normalizeNegativeZero(`${sign}${whole}.${fraction}`);
}
function formatSignificant(value, digits, rounding) {
  if (value === 0) {
    return "0";
  }
  const magnitude = Math.floor(Math.log10(absNumber(value)));
  const decimals = digits - magnitude - 1;
  if (decimals >= 0) {
    return formatFixed(value, decimals, rounding);
  }
  const coarseScale = 10 ** -decimals;
  if (!Number.isFinite(coarseScale) || coarseScale <= 0) {
    throw new InvariantViolationError("Precision scale overflow during significant rounding.");
  }
  const roundedInteger = roundToIntegerWithMode(value / coarseScale, rounding);
  const rounded = roundedInteger * coarseScale;
  return normalizeNegativeZero(toPlainIntegerString(rounded));
}
function validateUniversalFormatOptions(options) {
  if (options.precision.kind === "fixed") {
    parseIntegerField(options.precision.decimals, 0, "Fixed precision decimals");
    return;
  }
  parseIntegerField(options.precision.digits, 1, "Significant precision digits");
}
function ratioToApproxNumber(value) {
  const numerator = Number(value.num);
  const denominator = Number(value.den);
  const numeric = numerator / denominator;
  assertFinitePositive(numeric, "Ratio value");
  return numeric;
}
function evaluateIntervalExprApproximately(expr) {
  if (expr.kind === "rational") {
    return ratioToApproxNumber(expr.value);
  }
  if (expr.kind === "edStep") {
    const period = ratioToApproxNumber(expr.period);
    const exponent = Number(expr.steps) / Number(expr.divisions);
    const value = Math.pow(period, exponent);
    assertFinitePositive(value, "ED-step evaluation");
    return value;
  }
  if (expr.kind === "mul") {
    let result = 1;
    for (const factor of expr.factors) {
      result *= evaluateIntervalExprApproximately(factor);
    }
    assertFinitePositive(result, "Multiplicative interval evaluation");
    return result;
  }
  const base = evaluateIntervalExprApproximately(expr.base);
  const exponent = Number(expr.exponent);
  const value = Math.pow(base, exponent);
  assertFinitePositive(value, "Power interval evaluation");
  return value;
}
function evaluateIntervalExprExactlyOrThrow(expr) {
  return evaluateIntervalExprExactly(expr);
}
function formatApproxNumber(value, options) {
  if (!Number.isFinite(value)) {
    throw new InvariantViolationError("Approximate formatting requires a finite value.");
  }
  validateUniversalFormatOptions(options);
  if (options.precision.kind === "fixed") {
    return formatFixed(value, options.precision.decimals, options.rounding);
  }
  return formatSignificant(value, options.precision.digits, options.rounding);
}
// src/basis/primes.ts
function isPrimeBigInt(n) {
  if (n < 2n) {
    return false;
  }
  if (n === 2n) {
    return true;
  }
  if (n % 2n === 0n) {
    return false;
  }
  for (let divisor = 3n;divisor * divisor <= n; divisor += 2n) {
    if (n % divisor === 0n) {
      return false;
    }
  }
  return true;
}
function primesUpTo(limit) {
  if (limit < 2n) {
    return [];
  }
  const primes = [];
  for (let candidate = 2n;candidate <= limit; candidate += 1n) {
    if (isPrimeBigInt(candidate)) {
      primes.push(candidate);
    }
  }
  return primes;
}
function nextPrimeAfter(n) {
  if (n < 1n) {
    return 2n;
  }
  let candidate = n + 1n;
  if (candidate % 2n === 0n) {
    if (candidate === 2n) {
      return 2n;
    }
    candidate += 1n;
  }
  while (!isPrimeBigInt(candidate)) {
    candidate += 2n;
  }
  return candidate;
}

// src/basis/basis.ts
function createPrimeBasis(primes) {
  for (let i = 0;i < primes.length; i += 1) {
    const prime = primes[i];
    if (prime === undefined) {
      throw new InvariantViolationError("Prime basis contains an undefined entry.");
    }
    if (!isPrimeBigInt(prime)) {
      throw new InvariantViolationError(`Prime basis entries must be prime integers >= 2; got ${prime.toString()}.`);
    }
    if (i > 0) {
      const previous = primes[i - 1];
      if (previous === undefined) {
        throw new InvariantViolationError("Prime basis contains an undefined entry.");
      }
      if (prime <= previous) {
        throw new InvariantViolationError("Prime basis must be strictly ascending with unique entries.");
      }
    }
  }
  return { primes: [...primes] };
}
function hasPrimeInBasis(basis, prime) {
  return indexOfPrimeInBasis(basis, prime) >= 0;
}
function indexOfPrimeInBasis(basis, prime) {
  let low = 0;
  let high = basis.primes.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = basis.primes[mid];
    if (candidate === undefined) {
      throw new InvariantViolationError("Prime basis lookup encountered undefined entry.");
    }
    if (candidate === prime) {
      return mid;
    }
    if (candidate < prime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return -1;
}
function extendPrimeBasis(basis, extraPrimes) {
  if (extraPrimes.length === 0) {
    return createPrimeBasis(basis.primes);
  }
  const merged = [...basis.primes];
  for (const prime of extraPrimes) {
    if (!isPrimeBigInt(prime)) {
      throw new InvariantViolationError(`Only prime values can extend a basis; got ${prime.toString()}.`);
    }
    if (!merged.includes(prime)) {
      merged.push(prime);
    }
  }
  merged.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return createPrimeBasis(merged);
}

// src/basis/factor.ts
function factorInteger(n) {
  if (n <= 0n) {
    throw new InvariantViolationError("Factorization input must be a strictly positive integer.");
  }
  if (n === 1n) {
    return {
      input: 1n,
      factors: []
    };
  }
  const factors = [];
  let remainder = n;
  let exponentOfTwo = 0n;
  while (remainder % 2n === 0n) {
    exponentOfTwo += 1n;
    remainder /= 2n;
  }
  if (exponentOfTwo > 0n) {
    factors.push({ prime: 2n, exponent: exponentOfTwo });
  }
  for (let divisor = 3n;divisor * divisor <= remainder; divisor += 2n) {
    let exponent = 0n;
    while (remainder % divisor === 0n) {
      exponent += 1n;
      remainder /= divisor;
    }
    if (exponent > 0n) {
      factors.push({ prime: divisor, exponent });
    }
  }
  if (remainder > 1n) {
    factors.push({ prime: remainder, exponent: 1n });
  }
  return {
    input: n,
    factors
  };
}

// src/ji/types.ts
function createMonzo(basis, exponents) {
  if (basis.primes.length !== exponents.length) {
    throw new InvariantViolationError("Monzo exponent vector length must match basis length.");
  }
  return {
    basis: createPrimeBasis(basis.primes),
    exponents: [...exponents]
  };
}
function toSparseMonzo(monzo) {
  const sparse = [];
  for (let i = 0;i < monzo.exponents.length; i += 1) {
    const exponent = monzo.exponents[i];
    if (exponent === undefined) {
      throw new InvariantViolationError("Monzo exponent vector contains an undefined entry.");
    }
    if (exponent !== 0n) {
      const prime = monzo.basis.primes[i];
      if (prime === undefined) {
        throw new InvariantViolationError("Monzo basis contains an undefined entry.");
      }
      sparse.push({
        prime,
        exponent
      });
    }
  }
  return sparse;
}
function fromSparseMonzo(basis, entries) {
  createPrimeBasis(basis.primes);
  const exponents = new Array(basis.primes.length).fill(0n);
  for (const entry of entries) {
    if (!hasPrimeInBasis(basis, entry.prime)) {
      throw new InvariantViolationError(`Sparse monzo contains prime outside basis: ${entry.prime.toString()}.`);
    }
    const index = indexOfPrimeInBasis(basis, entry.prime);
    if (index < 0) {
      throw new InvariantViolationError("Sparse monzo basis lookup failed.");
    }
    if (exponents[index] !== 0n) {
      throw new InvariantViolationError(`Sparse monzo contains duplicate prime entry: ${entry.prime.toString()}.`);
    }
    exponents[index] = entry.exponent;
  }
  return createMonzo(basis, exponents);
}
function hashMonzo(monzo) {
  return stableHashMonzoShape(monzo.basis.primes, monzo.exponents);
}

// src/convert/exact/rational.ts
function factorExponentMap(n) {
  const factorization = factorInteger(n);
  const map = new Map;
  for (const factor of factorization.factors) {
    map.set(factor.prime, factor.exponent);
  }
  return map;
}
function powBigInt2(base, exponent) {
  let result = 1n;
  for (let i = 0n;i < exponent; i += 1n) {
    result *= base;
  }
  return result;
}
function toMonzoInBasis(ratio, basis) {
  if (ratio.num <= 0n) {
    throw new InvariantViolationError("Rational-to-monzo conversion requires a strictly positive ratio.");
  }
  const numeratorFactors = factorExponentMap(ratio.num);
  const denominatorFactors = factorExponentMap(ratio.den);
  const allPrimes = new Set([
    ...numeratorFactors.keys(),
    ...denominatorFactors.keys()
  ]);
  for (const prime of allPrimes) {
    if (!basis.primes.includes(prime)) {
      throw new InvariantViolationError(`Prime ${prime.toString()} is outside the declared basis.`);
    }
  }
  const exponents = basis.primes.map((prime) => {
    const numExp = numeratorFactors.get(prime) ?? 0n;
    const denExp = denominatorFactors.get(prime) ?? 0n;
    return numExp - denExp;
  });
  return createMonzo(basis, exponents);
}
function toMonzoWithExtendedBasis(ratio, basis) {
  if (ratio.num <= 0n) {
    throw new InvariantViolationError("Rational-to-monzo conversion requires a strictly positive ratio.");
  }
  const numeratorFactors = factorExponentMap(ratio.num);
  const denominatorFactors = factorExponentMap(ratio.den);
  const requiredPrimes = [
    ...numeratorFactors.keys(),
    ...denominatorFactors.keys()
  ];
  const extendedBasis = extendPrimeBasis(basis, requiredPrimes);
  return {
    basis: extendedBasis,
    monzo: toMonzoInBasis(ratio, extendedBasis)
  };
}
function toMonzoAutoBasis(ratio) {
  if (ratio.num <= 0n) {
    throw new InvariantViolationError("Rational-to-monzo conversion requires a strictly positive ratio.");
  }
  const numeratorFactors = factorExponentMap(ratio.num);
  const denominatorFactors = factorExponentMap(ratio.den);
  const primeSet = new Set([
    ...numeratorFactors.keys(),
    ...denominatorFactors.keys()
  ]);
  const primes = [...primeSet].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const basis = createPrimeBasis(primes);
  return {
    basis,
    monzo: toMonzoInBasis(ratio, basis)
  };
}
function fromMonzoInBasis(monzo) {
  if (monzo.basis.primes.length !== monzo.exponents.length) {
    throw new InvariantViolationError("Monzo exponent vector length must match basis length.");
  }
  let numerator = 1n;
  let denominator = 1n;
  for (let i = 0;i < monzo.exponents.length; i += 1) {
    const exponent = monzo.exponents[i];
    const prime = monzo.basis.primes[i];
    if (exponent === undefined || prime === undefined) {
      throw new InvariantViolationError("Monzo contains undefined basis or exponent entries.");
    }
    if (exponent > 0n) {
      numerator *= powBigInt2(prime, exponent);
    } else if (exponent < 0n) {
      denominator *= powBigInt2(prime, -exponent);
    }
  }
  return BigRational.from(numerator, denominator);
}
// src/convert/universal/cents.ts
function resolveRatioValue(input) {
  if (input instanceof BigRational) {
    return ratioToApproxNumber(input);
  }
  try {
    return ratioToApproxNumber(evaluateIntervalExprExactlyOrThrow(input));
  } catch (error) {
    if (!(error instanceof NonExactOperationError)) {
      throw error;
    }
    return evaluateIntervalExprApproximately(input);
  }
}
function evaluateToCents(input, options) {
  const ratioValue = resolveRatioValue(input);
  if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
    throw new InvariantViolationError("Cents evaluation requires a finite positive ratio.");
  }
  const cents = 1200 * Math.log2(ratioValue);
  if (!Number.isFinite(cents)) {
    throw new InvariantViolationError("Cents evaluation produced a non-finite result.");
  }
  return {
    kind: "ApproxRatio",
    value: formatApproxNumber(cents, options),
    meta: {
      source: "cents",
      precision: options.precision,
      rounding: options.rounding,
      note: "evaluated cents output"
    }
  };
}
// src/convert/universal/decimalRatio.ts
function resolveApproxRatioValue(input) {
  if (input instanceof BigRational) {
    return ratioToApproxNumber(input);
  }
  try {
    return ratioToApproxNumber(evaluateIntervalExprExactlyOrThrow(input));
  } catch (error) {
    if (!(error instanceof NonExactOperationError)) {
      throw error;
    }
    return evaluateIntervalExprApproximately(input);
  }
}
function evaluateToDecimalRatio(input, options) {
  const ratioValue = resolveApproxRatioValue(input);
  if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
    throw new InvariantViolationError("Decimal-ratio evaluation requires a finite positive ratio value.");
  }
  return {
    kind: "ApproxRatio",
    value: formatApproxNumber(ratioValue, options),
    meta: {
      source: "decimalRatio",
      precision: options.precision,
      rounding: options.rounding,
      note: "evaluated decimal ratio output"
    }
  };
}
// src/notations/cents.ts
var CENTS_NUMERIC_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
function parseCents(input) {
  const trimmed = input.trim();
  if (!trimmed.endsWith("c")) {
    throw new Error("Invalid cents notation");
  }
  const numericPart = trimmed.slice(0, -1);
  if (!CENTS_NUMERIC_PATTERN.test(numericPart)) {
    throw new Error("Invalid cents notation");
  }
  const result = {
    kind: "ApproxRatio",
    value: numericPart,
    meta: {
      source: "cents",
      original: trimmed
    }
  };
  return result;
}

// src/notations/decimalRatio.ts
var DECIMAL_RATIO_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
function parseDecimalRatio(input) {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Invalid decimal ratio notation");
  }
  if (!DECIMAL_RATIO_PATTERN.test(trimmed)) {
    throw new Error("Invalid decimal ratio notation");
  }
  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new InvariantViolationError("Decimal ratio must be > 0");
  }
  const result = {
    kind: "ApproxRatio",
    value: trimmed,
    meta: {
      source: "decimalRatio",
      original: trimmed
    }
  };
  return result;
}

// src/notations/ratio.ts
var INTEGER_PATTERN = /^[+-]?\d+$/;
var FRACTION_PATTERN = /^([+-]?\d+)\/([+-]?\d+)$/;
var parseSignedInteger = (value) => {
  const sign = value[0];
  const digits = sign === "+" || sign === "-" ? value.slice(1) : value;
  const magnitude = BigInt(digits);
  if (sign === "-") {
    return -magnitude;
  }
  return magnitude;
};
function parseFraction(input) {
  const trimmed = input.trim();
  if (INTEGER_PATTERN.test(trimmed)) {
    return BigRational.from(parseSignedInteger(trimmed));
  }
  const fractionMatch = trimmed.match(FRACTION_PATTERN);
  if (fractionMatch !== null) {
    const [, rawNum, rawDen] = fractionMatch;
    if (rawNum === undefined || rawDen === undefined) {
      throw new NonExactOperationError(`Invalid rational fraction notation: "${input}"`);
    }
    const num = parseSignedInteger(rawNum);
    const den = parseSignedInteger(rawDen);
    return BigRational.from(num, den);
  }
  throw new NonExactOperationError(`Invalid rational fraction notation: "${input}"`);
}

// src/notations/parse.ts
function parseNotation(input, notation) {
  if (notation === "fraction") {
    return {
      notation,
      value: parseFraction(input)
    };
  }
  if (notation === "decimalRatio") {
    return {
      notation,
      value: parseDecimalRatio(input)
    };
  }
  return {
    notation,
    value: parseCents(input)
  };
}
function parseNotationAuto(input) {
  const trimmed = input.trim();
  if (trimmed.endsWith("c")) {
    return parseNotation(trimmed, "cents");
  }
  try {
    return parseNotation(trimmed, "fraction");
  } catch (error) {
    if (!(error instanceof NonExactOperationError)) {
      throw error;
    }
  }
  try {
    return parseNotation(trimmed, "decimalRatio");
  } catch (error) {
    if (error instanceof InvariantViolationError || error instanceof Error) {
      throw error;
    }
    throw new InvariantViolationError("Could not infer notation from input.");
  }
}

// src/convert/approx/rationalFit.ts
function absBigInt3(value) {
  return value < 0n ? -value : value;
}
function parseStrictPositiveDecimal(input) {
  const pattern = /^\d+(?:\.\d+)?$/;
  const trimmed = input.trim();
  if (!pattern.test(trimmed)) {
    throw new InvariantViolationError("Rational fit target must be a positive decimal string.");
  }
  if (trimmed.includes(".")) {
    const [rawWhole, rawFraction] = trimmed.split(".");
    if (rawWhole === undefined || rawFraction === undefined) {
      throw new InvariantViolationError("Invalid decimal target for rational fit.");
    }
    const scale = 10n ** BigInt(rawFraction.length);
    const whole = BigInt(rawWhole);
    const fraction = BigInt(rawFraction);
    return BigRational.from(whole * scale + fraction, scale);
  }
  return BigRational.from(BigInt(trimmed), 1n);
}
function compareFractions(aNum, aDen, bNum, bDen) {
  const left = aNum * bDen;
  const right = bNum * aDen;
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
function absDifference(target, numerator, denominator) {
  const left = target.num * denominator;
  const right = numerator * target.den;
  const diff = absBigInt3(left - right);
  const commonDenominator = target.den * denominator;
  return BigRational.from(diff, commonDenominator);
}
function toApproxError(value, format) {
  const numeric = Number(value.num) / Number(value.den);
  if (!Number.isFinite(numeric)) {
    throw new InvariantViolationError("Rational-fit error could not be represented numerically.");
  }
  return {
    kind: "ApproxRatio",
    value: formatApproxNumber(numeric, format),
    meta: {
      source: "other",
      precision: format.precision,
      rounding: format.rounding,
      note: "rational approximation error"
    }
  };
}
function fitRationalApproximation(target, constraints, format) {
  if (constraints.maxDenominator < 1n) {
    throw new InvariantViolationError("Rational-fit maxDenominator must be >= 1.");
  }
  if (constraints.maxNumerator !== undefined && constraints.maxNumerator < 1n) {
    throw new InvariantViolationError("Rational-fit maxNumerator must be >= 1 when set.");
  }
  const targetRatio = parseStrictPositiveDecimal(target.value);
  if (targetRatio.num <= 0n) {
    throw new InvariantViolationError("Rational-fit target must be strictly positive.");
  }
  let bestNumerator = 0n;
  let bestDenominator = 1n;
  let bestError = null;
  for (let denominator = 1n;denominator <= constraints.maxDenominator; denominator += 1n) {
    const scaled = targetRatio.num * denominator;
    const floorNumerator = scaled / targetRatio.den;
    const candidates = [floorNumerator, floorNumerator + 1n];
    for (const numerator of candidates) {
      if (numerator < 1n) {
        continue;
      }
      if (constraints.maxNumerator !== undefined && numerator > constraints.maxNumerator) {
        continue;
      }
      const error = absDifference(targetRatio, numerator, denominator);
      if (bestError === null) {
        bestNumerator = numerator;
        bestDenominator = denominator;
        bestError = error;
        continue;
      }
      const compareError = error.cmp(bestError);
      if (compareError < 0) {
        bestNumerator = numerator;
        bestDenominator = denominator;
        bestError = error;
        continue;
      }
      if (compareError === 0) {
        const compareDenominator = compareFractions(denominator, 1n, bestDenominator, 1n);
        if (compareDenominator < 0 || compareDenominator === 0 && numerator < bestNumerator) {
          bestNumerator = numerator;
          bestDenominator = denominator;
          bestError = error;
        }
      }
    }
  }
  if (bestError === null) {
    throw new InvariantViolationError("Rational-fit constraints produced no candidate approximation.");
  }
  const candidate = BigRational.from(bestNumerator, bestDenominator);
  const relativeError = targetRatio.num === 0n ? BigRational.from(0n, 1n) : bestError.div(targetRatio);
  return {
    kind: "rationalFit",
    candidate,
    isExactMatch: bestError.num === 0n,
    absoluteError: toApproxError(bestError, format),
    relativeError: toApproxError(relativeError, format)
  };
}

// src/convert/universal/notation.ts
function parseStrictDecimal(value, label) {
  const pattern = /^[+-]?\d+(?:\.\d+)?$/;
  if (!pattern.test(value)) {
    throw new InvariantViolationError(`${label} must be a plain decimal string.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvariantViolationError(`${label} must be finite.`);
  }
  return parsed;
}
function withOptionalOriginal(meta, original) {
  if (original === undefined) {
    return meta;
  }
  return {
    ...meta,
    original
  };
}
function toDecimalRatioApprox(input, format) {
  const parsed = parseNotation(input.value, input.notation);
  if (parsed.notation === "fraction") {
    return evaluateToDecimalRatio(parsed.value, format);
  }
  if (parsed.notation === "decimalRatio") {
    const numeric = parseStrictDecimal(parsed.value.value, "Decimal-ratio value");
    return {
      kind: "ApproxRatio",
      value: formatApproxNumber(numeric, format),
      meta: withOptionalOriginal({
        source: "decimalRatio",
        precision: format.precision,
        rounding: format.rounding,
        note: "formatted decimal-ratio output"
      }, parsed.value.meta.original)
    };
  }
  const centsValue = parseStrictDecimal(parsed.value.value, "Cents value");
  const ratio = Math.pow(2, centsValue / 1200);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new InvariantViolationError("Cents conversion produced an invalid decimal ratio.");
  }
  return {
    kind: "ApproxRatio",
    value: formatApproxNumber(ratio, format),
    meta: withOptionalOriginal({
      source: "decimalRatio",
      precision: format.precision,
      rounding: format.rounding,
      note: "converted from cents"
    }, parsed.value.meta.original)
  };
}
function toCentsApprox(input, format) {
  const parsed = parseNotation(input.value, input.notation);
  if (parsed.notation === "fraction") {
    return evaluateToCents(parsed.value, format);
  }
  if (parsed.notation === "cents") {
    const numeric = parseStrictDecimal(parsed.value.value, "Cents value");
    return {
      kind: "ApproxRatio",
      value: formatApproxNumber(numeric, format),
      meta: withOptionalOriginal({
        source: "cents",
        precision: format.precision,
        rounding: format.rounding,
        note: "formatted cents output"
      }, parsed.value.meta.original)
    };
  }
  const ratio = parseStrictDecimal(parsed.value.value, "Decimal-ratio value");
  if (ratio <= 0) {
    throw new InvariantViolationError("Cents conversion requires a strictly positive ratio.");
  }
  const cents = 1200 * Math.log2(ratio);
  if (!Number.isFinite(cents)) {
    throw new InvariantViolationError("Decimal-ratio conversion produced invalid cents.");
  }
  return {
    kind: "ApproxRatio",
    value: formatApproxNumber(cents, format),
    meta: withOptionalOriginal({
      source: "cents",
      precision: format.precision,
      rounding: format.rounding,
      note: "converted from decimal ratio"
    }, parsed.value.meta.original)
  };
}
function convertIntervalNotation(input, target, options) {
  if (target === "fraction") {
    const parsed = parseNotation(input.value, input.notation);
    if (parsed.notation === "fraction") {
      return {
        from: input.notation,
        to: target,
        value: parsed.value.toFractionString(),
        exactness: "exact",
        exactRatio: parsed.value
      };
    }
    if (options.rationalFit === undefined) {
      throw new InvariantViolationError("Converting decimal or cents notation to fraction requires explicit rational-fit constraints.");
    }
    const decimalTarget = toDecimalRatioApprox(input, options.format);
    const fit = fitRationalApproximation(decimalTarget, options.rationalFit, options.format);
    return {
      from: input.notation,
      to: target,
      value: fit.candidate.toFractionString(),
      exactness: fit.isExactMatch ? "exact" : "approx",
      exactRatio: fit.candidate,
      approxValue: decimalTarget,
      note: fit.isExactMatch ? "exact match under rational-fit constraints" : "approximation under rational-fit constraints"
    };
  }
  if (target === "decimalRatio") {
    const approx = toDecimalRatioApprox(input, options.format);
    return {
      from: input.notation,
      to: target,
      value: approx.value,
      exactness: "approx",
      approxValue: approx
    };
  }
  const approx = toCentsApprox(input, options.format);
  const includeSuffix = options.centsSuffix ?? true;
  return {
    from: input.notation,
    to: target,
    value: includeSuffix ? `${approx.value}c` : approx.value,
    exactness: "approx",
    approxValue: approx
  };
}
// src/convert/approx/edFit.ts
function parseStrictDecimal2(value) {
  const pattern = /^[+-]?\d+(?:\.\d+)?$/;
  if (!pattern.test(value)) {
    throw new InvariantViolationError("ApproxRatio value must be a plain decimal string.");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvariantViolationError("ApproxRatio value must be finite.");
  }
  return parsed;
}
function resolveTargetRatio(target) {
  if (target instanceof BigRational) {
    return ratioToApproxNumber(target);
  }
  if ("kind" in target && target.kind === "ApproxRatio") {
    const raw = parseStrictDecimal2(target.value);
    if (target.meta.source === "cents") {
      const ratioFromCents = Math.pow(2, raw / 1200);
      if (!Number.isFinite(ratioFromCents) || ratioFromCents <= 0) {
        throw new InvariantViolationError("Cents-derived ratio is invalid for ED fit.");
      }
      return ratioFromCents;
    }
    if (raw <= 0) {
      throw new InvariantViolationError("ED fit requires a strictly positive ratio target.");
    }
    return raw;
  }
  try {
    return ratioToApproxNumber(evaluateIntervalExprExactlyOrThrow(target));
  } catch (error) {
    if (!(error instanceof NonExactOperationError)) {
      throw error;
    }
    return evaluateIntervalExprApproximately(target);
  }
}
function candidateErrorCents(targetRatio, period, divisions, steps) {
  const exponent = Number(steps) / divisions;
  const fittedRatio = Math.pow(period, exponent);
  const centsError = 1200 * Math.log2(fittedRatio / targetRatio);
  return { fittedRatio, centsError };
}
function fitNearestEdStep(target, options) {
  if (options.divisions < 1n) {
    throw new InvariantViolationError("ED fit requires divisions >= 1.");
  }
  if (options.period.num <= 0n || options.period.num === options.period.den) {
    throw new InvariantViolationError("ED fit requires a strictly positive non-unison period.");
  }
  const targetRatio = resolveTargetRatio(target);
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    throw new InvariantViolationError("ED fit target ratio must be finite and positive.");
  }
  const period = ratioToApproxNumber(options.period);
  const divisions = Number(options.divisions);
  const estimate = divisions * (Math.log(targetRatio) / Math.log(period));
  const lower = BigInt(Math.floor(estimate));
  const upper = BigInt(Math.ceil(estimate));
  const lowerCandidate = candidateErrorCents(targetRatio, period, divisions, lower);
  const upperCandidate = candidateErrorCents(targetRatio, period, divisions, upper);
  const useLower = Math.abs(lowerCandidate.centsError) < Math.abs(upperCandidate.centsError) || Math.abs(lowerCandidate.centsError) === Math.abs(upperCandidate.centsError) && lower <= upper;
  const bestSteps = useLower ? lower : upper;
  const best = useLower ? lowerCandidate : upperCandidate;
  return {
    kind: "edFit",
    steps: bestSteps,
    fittedEdStep: makeEdStepExpr(bestSteps, options.divisions, options.period),
    fittedRatio: {
      kind: "ApproxRatio",
      value: formatApproxNumber(best.fittedRatio, options.format),
      meta: {
        source: "decimalRatio",
        precision: options.format.precision,
        rounding: options.format.rounding,
        note: "nearest ED-step fitted decimal ratio"
      }
    },
    centsError: {
      kind: "ApproxRatio",
      value: formatApproxNumber(best.centsError, options.format),
      meta: {
        source: "cents",
        precision: options.format.precision,
        rounding: options.format.rounding,
        note: "signed cents error of ED-step fit"
      }
    }
  };
}
// src/convert/approx/compare.ts
function parseStrictDecimal3(value, label) {
  const pattern = /^[+-]?\d+(?:\.\d+)?$/;
  if (!pattern.test(value)) {
    throw new InvariantViolationError(`${label} must be a plain decimal string.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvariantViolationError(`${label} must be finite.`);
  }
  return parsed;
}
function compareApproxRatios(left, right, options) {
  if (left.meta.source !== right.meta.source) {
    throw new InvariantViolationError("Approximate comparison requires matching source units (for example cents vs cents).");
  }
  const leftValue = parseStrictDecimal3(left.value, "Left ApproxRatio value");
  const rightValue = parseStrictDecimal3(right.value, "Right ApproxRatio value");
  const tolerance = parseStrictDecimal3(options.tolerance.value, "Approximate comparison tolerance");
  if (tolerance < 0) {
    throw new InvariantViolationError("Tolerance must be >= 0.");
  }
  const absoluteDifference = Math.abs(leftValue - rightValue);
  if (options.tolerance.kind === "abs") {
    return {
      withinTolerance: absoluteDifference <= tolerance,
      absoluteDifference: absoluteDifference.toString()
    };
  }
  const reference = Math.max(Math.abs(leftValue), Math.abs(rightValue));
  const threshold = reference === 0 ? tolerance : reference * tolerance;
  return {
    withinTolerance: absoluteDifference <= threshold,
    absoluteDifference: absoluteDifference.toString()
  };
}
// src/notations/format.ts
function formatNotation(input, target, options) {
  return convertIntervalNotation(input, target, options).value;
}
function formatNotationDetailed(input, target, options) {
  return convertIntervalNotation(input, target, options);
}
// src/complexity/exact.ts
function exactComplexityOfMonzo(monzo) {
  if (monzo.basis.primes.length !== monzo.exponents.length) {
    throw new InvariantViolationError("Monzo exponent vector length must match basis length.");
  }
  let supportSize = 0;
  let maxAbsExponent = 0n;
  let maxNumeratorExponent = 0n;
  let maxDenominatorExponent = 0n;
  for (let i = 0;i < monzo.exponents.length; i += 1) {
    const exponent = monzo.exponents[i];
    if (exponent === undefined) {
      throw new InvariantViolationError("Monzo exponent vector contains an undefined entry.");
    }
    if (exponent !== 0n) {
      supportSize += 1;
    }
    const absExponent = exponent < 0n ? -exponent : exponent;
    if (absExponent > maxAbsExponent) {
      maxAbsExponent = absExponent;
    }
    if (exponent > maxNumeratorExponent) {
      maxNumeratorExponent = exponent;
    }
    const denominatorExponent = exponent < 0n ? -exponent : 0n;
    if (denominatorExponent > maxDenominatorExponent) {
      maxDenominatorExponent = denominatorExponent;
    }
  }
  return {
    supportSize,
    maxAbsExponent,
    maxNumeratorExponent,
    maxDenominatorExponent
  };
}
function exactComplexityOfBigRational(ratio) {
  if (ratio.num <= 0n) {
    throw new InvariantViolationError("Exact complexity is defined only for strictly positive intervals.");
  }
  const { monzo } = toMonzoAutoBasis(ratio);
  return exactComplexityOfMonzo(monzo);
}

// src/ji/classify.ts
function removeFactorsOfTwo(n) {
  while (n % 2n === 0n) {
    n /= 2n;
  }
  return n;
}
function oddLimitOfBigRational(x) {
  if (x.num <= 0n) {
    throw new InvariantViolationError("Odd limit is defined only for strictly positive intervals.");
  }
  const absNum = x.num < 0n ? -x.num : x.num;
  const absDen = x.den < 0n ? -x.den : x.den;
  const oddNum = removeFactorsOfTwo(absNum);
  const oddDen = removeFactorsOfTwo(absDen);
  return oddNum >= oddDen ? oddNum : oddDen;
}
function ensurePositiveInterval(x) {
  if (x.num <= 0n) {
    throw new InvariantViolationError("Classification is defined only for strictly positive intervals.");
  }
}
function primesUsedByRatio(x) {
  const numeratorFactors = factorInteger(x.num);
  const denominatorFactors = factorInteger(x.den);
  const primeSet = new Set;
  for (const factor of numeratorFactors.factors) {
    primeSet.add(factor.prime);
  }
  for (const factor of denominatorFactors.factors) {
    primeSet.add(factor.prime);
  }
  return [...primeSet].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
function primeLimitOfBigRational(x) {
  ensurePositiveInterval(x);
  const usedPrimes = primesUsedByRatio(x);
  if (usedPrimes.length === 0) {
    return 1n;
  }
  const largest = usedPrimes[usedPrimes.length - 1];
  if (largest === undefined) {
    throw new InvariantViolationError("Prime limit calculation failed.");
  }
  return largest;
}
function isInPrimeSubgroup(x, subgroup) {
  ensurePositiveInterval(x);
  const canonicalSubgroup = createPrimeBasis(subgroup.primes);
  const usedPrimes = primesUsedByRatio(x);
  for (const prime of usedPrimes) {
    if (!hasPrimeInBasis(canonicalSubgroup, prime)) {
      return false;
    }
  }
  return true;
}
function classifyJiInterval(x) {
  ensurePositiveInterval(x);
  return {
    oddLimit: oddLimitOfBigRational(x),
    primeLimit: primeLimitOfBigRational(x),
    complexity: exactComplexityOfBigRational(x)
  };
}
function classifyJiIntervalInSubgroup(x, subgroup) {
  const base = classifyJiInterval(x);
  return {
    ...base,
    inSubgroup: isInPrimeSubgroup(x, subgroup)
  };
}
// src/ji/sets.ts
function canonicalizeJiIntervalSet(intervals, order = "structural") {
  return canonicalizeExactIntervalSet(intervals, order);
}
function jiIntervalStructuralKey(interval) {
  return intervalStructuralKey(interval);
}

// src/ji/generate.ts
function assertPositiveBound(name, value) {
  if (value <= 0n) {
    throw new InvariantViolationError(`${name} must be a strictly positive integer.`);
  }
}
function canonicalSubgroupOrUndefined(subgroup) {
  if (subgroup === undefined) {
    return;
  }
  return createPrimeBasis(subgroup.primes);
}
function passesConstraints(interval, constraints, subgroup) {
  if (constraints.maxNumerator !== undefined && interval.num > constraints.maxNumerator) {
    return false;
  }
  if (constraints.maxDenominator !== undefined && interval.den > constraints.maxDenominator) {
    return false;
  }
  if (constraints.maxOddLimit !== undefined) {
    if (oddLimitOfBigRational(interval) > constraints.maxOddLimit) {
      return false;
    }
  }
  if (constraints.maxPrimeLimit !== undefined) {
    if (primeLimitOfBigRational(interval) > constraints.maxPrimeLimit) {
      return false;
    }
  }
  if (subgroup !== undefined && !isInPrimeSubgroup(interval, subgroup)) {
    return false;
  }
  return true;
}
function generateJiIntervals(constraints) {
  assertPositiveBound("searchMaxNumerator", constraints.searchMaxNumerator);
  assertPositiveBound("searchMaxDenominator", constraints.searchMaxDenominator);
  if (constraints.maxNumerator !== undefined) {
    assertPositiveBound("maxNumerator", constraints.maxNumerator);
  }
  if (constraints.maxDenominator !== undefined) {
    assertPositiveBound("maxDenominator", constraints.maxDenominator);
  }
  if (constraints.maxOddLimit !== undefined) {
    assertPositiveBound("maxOddLimit", constraints.maxOddLimit);
  }
  if (constraints.maxPrimeLimit !== undefined) {
    assertPositiveBound("maxPrimeLimit", constraints.maxPrimeLimit);
  }
  const subgroup = canonicalSubgroupOrUndefined(constraints.subgroup);
  const candidates = [];
  for (let num = 1n;num <= constraints.searchMaxNumerator; num += 1n) {
    for (let den = 1n;den <= constraints.searchMaxDenominator; den += 1n) {
      const reduced = BigRational.from(num, den);
      if (passesConstraints(reduced, constraints, subgroup)) {
        candidates.push(reduced);
      }
    }
  }
  return canonicalizeJiIntervalSet(candidates, constraints.order ?? "structural");
}
// src/period/mod.ts
function applyPeriodShift(expr, period, shift) {
  if (shift === 0n) {
    return canonicalizeIntervalExpr(expr);
  }
  return canonicalizeIntervalExpr(makeMulExpr([expr, makePowExpr(period, shift)]));
}
function createSymbolicPeriodClass(period, representative, shift = 0n) {
  return {
    period: canonicalizeIntervalExpr(period),
    representative: canonicalizeIntervalExpr(representative),
    shift
  };
}
function canonicalizeSymbolicPeriodClass(input) {
  return createSymbolicPeriodClass(input.period, input.representative, input.shift);
}
function reduceExactIntervalExprToPeriodClass(expr, period) {
  const canonicalPeriod = canonicalizeIntervalExpr(period);
  const periodRatio = evaluateIntervalExprExactly(canonicalPeriod);
  if (periodRatio.cmp(BigRational.from(1n, 1n)) <= 0) {
    throw new InvariantViolationError("Period reduction requires a period strictly greater than 1/1.");
  }
  const exprRatio = evaluateIntervalExprExactly(canonicalizeIntervalExpr(expr));
  let representativeRatio = exprRatio;
  let shift = 0n;
  while (representativeRatio.cmp(periodRatio) >= 0) {
    representativeRatio = representativeRatio.div(periodRatio);
    shift += 1n;
  }
  while (representativeRatio.cmp(BigRational.from(1n, 1n)) < 0) {
    representativeRatio = representativeRatio.mul(periodRatio);
    shift -= 1n;
  }
  return createSymbolicPeriodClass(canonicalPeriod, makeRationalExpr(representativeRatio), shift);
}
// src/period/ordering.ts
function compareLexicographic2(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
function compareBigInt(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
function compareSymbolicPeriodClass(a, b) {
  const left = canonicalizeSymbolicPeriodClass(a);
  const right = canonicalizeSymbolicPeriodClass(b);
  const periodOrder = compareLexicographic2(intervalExprStructuralKey(left.period), intervalExprStructuralKey(right.period));
  if (periodOrder !== 0) {
    return periodOrder;
  }
  const representativeOrder = compareLexicographic2(intervalExprStructuralKey(left.representative), intervalExprStructuralKey(right.representative));
  if (representativeOrder !== 0) {
    return representativeOrder;
  }
  return compareBigInt(left.shift, right.shift);
}
// src/generators/iterate.ts
function iterateGenerator(request) {
  if (request.steps < 1n) {
    throw new InvariantViolationError("Generator iteration requires steps >= 1.");
  }
  const generator = canonicalizeIntervalExpr(request.generator);
  const start = canonicalizeIntervalExpr(request.start);
  evaluateIntervalExprExactly(generator);
  evaluateIntervalExprExactly(start);
  const states = [];
  for (let step = 0n;step < request.steps; step += 1n) {
    const value = step === 0n ? start : canonicalizeIntervalExpr(makeMulExpr([start, makePowExpr(generator, step)]));
    states.push({
      step,
      value
    });
  }
  return states;
}

// src/generators/stack.ts
function compareRepresentativeNumeric(a, b) {
  const left = evaluateIntervalExprExactly(a);
  const right = evaluateIntervalExprExactly(b);
  const ratioOrder = left.cmp(right);
  if (ratioOrder !== 0) {
    return ratioOrder;
  }
  return compareIntervalExprStructural(a, b);
}
function buildGeneratorStack(input) {
  if (input.count < 1n) {
    throw new InvariantViolationError("Generator stack requires count >= 1.");
  }
  const includeUnison = input.includeUnison ?? true;
  const order = input.order ?? "structural";
  const iteration = iterateGenerator({
    generator: input.generator,
    start: makeRationalExpr(BigRational.from(1n, 1n)),
    steps: input.count
  });
  const periodClass = reduceExactIntervalExprToPeriodClass(makeRationalExpr(BigRational.from(1n, 1n)), input.period);
  const dedup = new Map;
  for (const state of iteration) {
    if (!includeUnison && state.step === 0n) {
      continue;
    }
    const reduced = reduceExactIntervalExprToPeriodClass(state.value, input.period);
    const key = intervalExprStructuralKey(reduced.representative);
    if (!dedup.has(key)) {
      dedup.set(key, reduced.representative);
    }
  }
  const members = [...dedup.values()];
  if (members.length < 1) {
    throw new InvariantViolationError("Generator stack produced no members after filtering.");
  }
  members.sort((left, right) => {
    if (order === "numeric") {
      return compareRepresentativeNumeric(left, right);
    }
    return compareIntervalExprStructural(left, right);
  });
  return {
    periodClass,
    members
  };
}
// src/scales/build/fromGenerator.ts
function buildScaleFromGenerator(input) {
  const stackInput = {
    generator: input.generator,
    period: input.period,
    count: input.count,
    ...input.includeUnison !== undefined ? { includeUnison: input.includeUnison } : {},
    ...input.order !== undefined ? { order: input.order } : {}
  };
  const stack = buildGeneratorStack({
    ...stackInput
  });
  return {
    periodClass: stack.periodClass,
    members: stack.members
  };
}
// src/scales/build/fromIntervals.ts
function compareRepresentativeNumeric2(a, b) {
  const left = evaluateIntervalExprExactly(a);
  const right = evaluateIntervalExprExactly(b);
  const ratioOrder = left.cmp(right);
  if (ratioOrder !== 0) {
    return ratioOrder;
  }
  return compareIntervalExprStructural(a, b);
}
function buildScaleFromIntervals(input) {
  const includeUnison = input.includeUnison ?? true;
  const order = input.order ?? "structural";
  const dedup = new Map;
  const periodClass = reduceExactIntervalExprToPeriodClass(makeRationalExpr(BigRational.from(1n, 1n)), input.period);
  if (includeUnison) {
    const unison = reduceExactIntervalExprToPeriodClass(makeRationalExpr(BigRational.from(1n, 1n)), input.period);
    dedup.set(intervalExprStructuralKey(unison.representative), unison.representative);
  }
  for (const interval of input.intervals) {
    const reduced = reduceExactIntervalExprToPeriodClass(interval, input.period);
    const key = intervalExprStructuralKey(reduced.representative);
    if (!dedup.has(key)) {
      dedup.set(key, reduced.representative);
    }
  }
  const members = [...dedup.values()];
  if (members.length < 1) {
    throw new InvariantViolationError("Scale construction from intervals produced no members.");
  }
  members.sort((left, right) => {
    if (order === "numeric") {
      return compareRepresentativeNumeric2(left, right);
    }
    return compareIntervalExprStructural(left, right);
  });
  return {
    periodClass,
    members
  };
}
// src/scales/pattern/stepPattern.ts
function compareBigRationalAscending(a, b) {
  const order = a.cmp(b);
  if (order !== 0) {
    return order;
  }
  const left = a.toFractionString();
  const right = b.toFractionString();
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
function compareBigRationalDescending(a, b) {
  const order = b.cmp(a);
  if (order !== 0) {
    return order;
  }
  const left = a.toFractionString();
  const right = b.toFractionString();
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
function normalizeScaleMembersExact(scale) {
  if (scale.members.length < 1) {
    throw new InvariantViolationError("Scale step-pattern analysis requires at least one member.");
  }
  const dedup = new Map;
  for (const member of scale.members) {
    const ratio = evaluateIntervalExprExactly(member);
    dedup.set(ratio.toFractionString(), ratio);
  }
  const members = [...dedup.values()];
  if (members.length < 1) {
    throw new InvariantViolationError("Scale step-pattern analysis produced no exact members.");
  }
  members.sort((left, right) => compareBigRationalAscending(left, right));
  return members;
}
function buildExactScaleStepPattern(scale) {
  const period = evaluateIntervalExprExactly(scale.periodClass.period);
  if (period.cmp(BigRational.from(1n, 1n)) <= 0) {
    throw new InvariantViolationError("Scale step-pattern analysis requires a period strictly greater than 1/1.");
  }
  const membersAscending = normalizeScaleMembersExact(scale);
  const cyclicSteps = [];
  for (let index = 0;index < membersAscending.length; index += 1) {
    const left = membersAscending[index];
    if (left === undefined) {
      throw new InvariantViolationError("Scale step-pattern analysis encountered an undefined member.");
    }
    let stepSize;
    if (index + 1 < membersAscending.length) {
      const right = membersAscending[index + 1];
      if (right === undefined) {
        throw new InvariantViolationError("Scale step-pattern analysis encountered an undefined adjacent member.");
      }
      stepSize = right.div(left);
    } else {
      stepSize = period.div(left);
    }
    cyclicSteps.push({
      index: BigInt(index),
      size: stepSize
    });
  }
  const distinct = new Map;
  for (const step of cyclicSteps) {
    distinct.set(step.size.toFractionString(), step.size);
  }
  const distinctStepSizesDesc = [...distinct.values()].sort((left, right) => compareBigRationalDescending(left, right));
  return {
    period,
    membersAscending,
    cyclicSteps,
    distinctStepSizesDesc
  };
}
function countStepSizes(pattern) {
  const counts = new Map;
  for (const stepSize of pattern.distinctStepSizesDesc) {
    counts.set(stepSize.toFractionString(), 0n);
  }
  for (const step of pattern.cyclicSteps) {
    const key = step.size.toFractionString();
    const current = counts.get(key) ?? 0n;
    counts.set(key, current + 1n);
  }
  return counts;
}
function formatCanonicalMv2Notation(largeCount, smallCount) {
  if (largeCount < 0n || smallCount < 0n) {
    throw new InvariantViolationError("MV2 notation counts must be >= 0.");
  }
  if (largeCount === 0n && smallCount === 0n) {
    throw new InvariantViolationError("MV2 notation requires at least one non-zero step count.");
  }
  return `${largeCount.toString()}L ${smallCount.toString()}s`;
}
// src/scales/pattern/canonicalize.ts
function parseNotationToken(token) {
  const match = /^([+-]?\d+)([a-zA-Z])$/.exec(token);
  if (match === null) {
    throw new InvariantViolationError("MV2 notation token must be an integer count followed by L or s.");
  }
  const countRaw = match[1];
  const labelRaw = match[2];
  if (countRaw === undefined || labelRaw === undefined) {
    throw new InvariantViolationError("MV2 notation token parse failed.");
  }
  let count;
  try {
    count = BigInt(countRaw);
  } catch {
    throw new InvariantViolationError("MV2 notation count must be an integer.");
  }
  const lowered = labelRaw.toLowerCase();
  if (lowered !== "l" && lowered !== "s") {
    throw new InvariantViolationError("MV2 notation supports only L and s labels.");
  }
  return {
    label: lowered,
    count
  };
}
function canonicalizeMv2StepCounts(input) {
  if (input.largeCount < 0n || input.smallCount < 0n) {
    throw new InvariantViolationError("MV2 step counts must be >= 0.");
  }
  if (input.largeCount === 0n && input.smallCount === 0n) {
    throw new InvariantViolationError("MV2 step counts cannot both be zero.");
  }
  return {
    largeCount: input.largeCount,
    smallCount: input.smallCount
  };
}
function canonicalizeMv2NotationString(input) {
  const tokens = input.trim().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length !== 2) {
    throw new InvariantViolationError("MV2 notation must contain exactly two tokens.");
  }
  let largeCount = null;
  let smallCount = null;
  for (const token of tokens) {
    const parsed = parseNotationToken(token);
    if (parsed.label === "l") {
      if (largeCount !== null) {
        throw new InvariantViolationError("MV2 notation must include exactly one L token.");
      }
      largeCount = parsed.count;
    } else {
      if (smallCount !== null) {
        throw new InvariantViolationError("MV2 notation must include exactly one s token.");
      }
      smallCount = parsed.count;
    }
  }
  if (largeCount === null || smallCount === null) {
    throw new InvariantViolationError("MV2 notation must include both L and s tokens.");
  }
  const canonical = canonicalizeMv2StepCounts({
    largeCount,
    smallCount
  });
  return formatCanonicalMv2Notation(canonical.largeCount, canonical.smallCount);
}
// src/scales/pattern/parse.ts
function parseMv2Notation(input) {
  const canonical = canonicalizeMv2NotationString(input);
  const match = /^(\d+)L (\d+)s$/.exec(canonical);
  if (match === null) {
    throw new InvariantViolationError("Canonical MV2 notation parse failed.");
  }
  const largeRaw = match[1];
  const smallRaw = match[2];
  if (largeRaw === undefined || smallRaw === undefined) {
    throw new InvariantViolationError("Canonical MV2 notation parse captured undefined groups.");
  }
  return {
    largeCount: BigInt(largeRaw),
    smallCount: BigInt(smallRaw),
    canonical
  };
}
// src/scales/analyze/mv2.ts
function requireStepCount(counts, step, label) {
  const count = counts.get(step.toFractionString());
  if (count === undefined) {
    throw new InvariantViolationError(`MV2 analysis failed to resolve ${label} step count.`);
  }
  return count;
}
function analyzeMv2(scale) {
  const pattern = buildExactScaleStepPattern(scale);
  const counts = countStepSizes(pattern);
  const classCount = counts.size;
  if (classCount < 1) {
    throw new InvariantViolationError("MV2 analysis requires at least one step class.");
  }
  const stepCount = BigInt(pattern.cyclicSteps.length);
  if (classCount === 1) {
    const largeStep = pattern.distinctStepSizesDesc[0];
    if (largeStep === undefined) {
      throw new InvariantViolationError("MV2 analysis failed to resolve the degenerate step class.");
    }
    const largeCount = requireStepCount(counts, largeStep, "large");
    return {
      isMv2: true,
      isMos: true,
      distinctStepClassCount: classCount,
      stepCount,
      isDegenerateEqualStep: true,
      notation: formatCanonicalMv2Notation(largeCount, 0n),
      largeStep,
      smallStep: null,
      largeCount,
      smallCount: 0n
    };
  }
  if (classCount === 2) {
    const largeStep = pattern.distinctStepSizesDesc[0];
    const smallStep = pattern.distinctStepSizesDesc[1];
    if (largeStep === undefined || smallStep === undefined) {
      throw new InvariantViolationError("MV2 analysis failed to resolve both step classes.");
    }
    const largeCount = requireStepCount(counts, largeStep, "large");
    const smallCount = requireStepCount(counts, smallStep, "small");
    return {
      isMv2: true,
      isMos: true,
      distinctStepClassCount: classCount,
      stepCount,
      isDegenerateEqualStep: false,
      notation: formatCanonicalMv2Notation(largeCount, smallCount),
      largeStep,
      smallStep,
      largeCount,
      smallCount
    };
  }
  return {
    isMv2: false,
    isMos: false,
    distinctStepClassCount: classCount,
    stepCount,
    isDegenerateEqualStep: false,
    notation: null,
    largeStep: null,
    smallStep: null,
    largeCount: null,
    smallCount: null
  };
}
function isMv2(scale) {
  return analyzeMv2(scale).isMv2;
}
// src/scales/analyze/mv3.ts
function analyzeMv3(scale) {
  const pattern = buildExactScaleStepPattern(scale);
  const counts = countStepSizes(pattern);
  const classCount = counts.size;
  const stepCount = BigInt(pattern.cyclicSteps.length);
  if (classCount !== 3) {
    return {
      isMv3: false,
      distinctStepClassCount: classCount,
      stepCount,
      classes: []
    };
  }
  const labels = ["L", "m", "s"];
  const classes = [];
  for (let index = 0;index < labels.length; index += 1) {
    const label = labels[index];
    if (label === undefined) {
      throw new InvariantViolationError("MV3 analysis failed to resolve an MV3 label.");
    }
    const size = pattern.distinctStepSizesDesc[index];
    if (size === undefined) {
      throw new InvariantViolationError("MV3 analysis failed to resolve all three step classes.");
    }
    const count = counts.get(size.toFractionString());
    if (count === undefined) {
      throw new InvariantViolationError("MV3 analysis failed to resolve a step-class count.");
    }
    classes.push({
      label,
      size,
      count
    });
  }
  return {
    isMv3: true,
    distinctStepClassCount: classCount,
    stepCount,
    classes
  };
}
function isMv3(scale) {
  return analyzeMv3(scale).isMv3;
}
// src/scales/analyze/constantStructure.ts
function compareBigRationalAscending2(a, b) {
  const order = a.cmp(b);
  if (order !== 0) {
    return order;
  }
  const left = a.toFractionString();
  const right = b.toFractionString();
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
function analyzeConstantStructure(scale) {
  const pattern = buildExactScaleStepPattern(scale);
  const period = pattern.period;
  const members = pattern.membersAscending;
  const cardinality = BigInt(members.length);
  const byDistance = [];
  for (let genericDistance = 1;genericDistance < members.length; genericDistance += 1) {
    const specific = new Map;
    for (let start = 0;start < members.length; start += 1) {
      const startValue = members[start];
      if (startValue === undefined) {
        throw new InvariantViolationError("Constant-structure analysis encountered an undefined scale member.");
      }
      const rawEndIndex = start + genericDistance;
      let interval;
      if (rawEndIndex < members.length) {
        const endValue = members[rawEndIndex];
        if (endValue === undefined) {
          throw new InvariantViolationError("Constant-structure analysis encountered an undefined target member.");
        }
        interval = endValue.div(startValue);
      } else {
        const wrappedIndex = rawEndIndex % members.length;
        const wrappedValue = members[wrappedIndex];
        if (wrappedValue === undefined) {
          throw new InvariantViolationError("Constant-structure analysis encountered an undefined wrapped member.");
        }
        interval = wrappedValue.mul(period).div(startValue);
      }
      specific.set(interval.toFractionString(), interval);
    }
    const specificIntervalsAsc = [...specific.values()].sort((left, right) => compareBigRationalAscending2(left, right));
    byDistance.push({
      genericDistance: BigInt(genericDistance),
      distinctSpecificIntervalCount: specific.size,
      specificIntervalsAsc
    });
  }
  const isConstantStructure = byDistance.every((summary) => summary.distinctSpecificIntervalCount === 1);
  return {
    isConstantStructure,
    cardinality,
    byDistance
  };
}
function isConstantStructure(scale) {
  return analyzeConstantStructure(scale).isConstantStructure;
}
export {
  BigRational,
  InvariantViolationError,
  NonExactOperationError,
  analyzeConstantStructure,
  analyzeMv2,
  analyzeMv3,
  applyPeriodShift,
  buildExactScaleStepPattern,
  buildGeneratorStack,
  buildScaleFromGenerator,
  buildScaleFromIntervals,
  canonicalizeExactIntervalSet,
  canonicalizeIntervalExpr,
  canonicalizeJiIntervalSet,
  canonicalizeMv2NotationString,
  canonicalizeMv2StepCounts,
  canonicalizeSymbolicPeriodClass,
  classifyJiInterval,
  classifyJiIntervalInSubgroup,
  compareApproxRatios,
  compareIntervalExprStructural,
  compareSymbolicPeriodClass,
  convertIntervalNotation,
  countStepSizes,
  createMonzo,
  createPrimeBasis,
  createSymbolicPeriodClass,
  edStepToRationalExact,
  equalIntervalExpr,
  evaluateIntervalExprApproximately,
  evaluateIntervalExprExactly,
  evaluateIntervalExprExactlyOrThrow,
  evaluateToCents,
  evaluateToDecimalRatio,
  exactComplexityOfBigRational,
  exactComplexityOfMonzo,
  extendPrimeBasis,
  factorInteger,
  fitNearestEdStep,
  fitRationalApproximation,
  formatApproxNumber,
  formatCanonicalMv2Notation,
  formatNotation,
  formatNotationDetailed,
  fromMonzoInBasis,
  fromSparseMonzo,
  generateJiIntervals,
  hasPrimeInBasis,
  hashMonzo,
  indexOfPrimeInBasis,
  intervalExprStructuralKey,
  intervalStructuralKey,
  isConstantStructure,
  isEdStepExactlyConvertible,
  isInPrimeSubgroup,
  isIntervalExpr,
  isIntervalExprExactlyEvaluable,
  isMv2,
  isMv3,
  isPrimeBigInt,
  iterateGenerator,
  jiIntervalStructuralKey,
  makeEdStepExpr,
  makeMulExpr,
  makePowExpr,
  makeRationalExpr,
  nextPrimeAfter,
  oddLimitOfBigRational,
  parseCents,
  parseDecimalRatio,
  parseFraction,
  parseMv2Notation,
  parseNotation,
  parseNotationAuto,
  primeLimitOfBigRational,
  primesUpTo,
  ratioToApproxNumber,
  reduceExactIntervalExprToPeriodClass,
  stableHashIntervalExpr,
  stableHashMonzoShape,
  stableHashString,
  toMonzoAutoBasis,
  toMonzoInBasis,
  toMonzoWithExtendedBasis,
  toSparseMonzo,
  validateUniversalFormatOptions
};
