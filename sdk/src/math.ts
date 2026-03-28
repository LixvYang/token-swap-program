import type { BigNumberish, SwapQuote } from "./types.js";

const U64_MAX = 0xffff_ffff_ffff_ffffn;

export function toBigInt(value: BigNumberish): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`expected integer-compatible number, received ${value}`);
    }
    return BigInt(value);
  }

  return BigInt(value.toString());
}

function pow10(value: number): bigint {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`decimal exponent must be a non-negative integer, received ${value}`);
  }
  return 10n ** BigInt(value);
}

function assertU64(value: bigint, label: string): void {
  if (value < 0n || value > U64_MAX) {
    throw new Error(`${label} must fit into u64, received ${value.toString()}`);
  }
}

function buildQuote(
  amountIn: bigint,
  amountOutRaw: bigint,
  feeAmount: bigint,
  netAmountOut: bigint,
  swapRate: bigint,
  rateDecimals: number,
  feeBasisPoints: number,
  inputDecimals: number,
  outputDecimals: number,
): SwapQuote {
  assertU64(amountIn, "amountIn");
  assertU64(amountOutRaw, "amountOutRaw");
  assertU64(feeAmount, "feeAmount");
  assertU64(netAmountOut, "netAmountOut");

  return {
    amountIn,
    amountOutRaw,
    feeAmount,
    netAmountOut,
    swapRate,
    rateDecimals,
    feeBasisPoints,
    inputDecimals,
    outputDecimals,
  };
}

export function calculateForwardQuote(params: {
  amountIn: BigNumberish;
  swapRate: BigNumberish;
  rateDecimals: number;
  feeBasisPoints: number;
  inputDecimals: number;
  outputDecimals: number;
}): SwapQuote {
  const amountIn = toBigInt(params.amountIn);
  const swapRate = toBigInt(params.swapRate);

  if (swapRate <= 0n) {
    throw new Error("swapRate must be greater than zero");
  }

  if (params.feeBasisPoints < 0 || params.feeBasisPoints > 10_000) {
    throw new Error("feeBasisPoints must be in [0, 10000]");
  }

  const numerator =
    amountIn * swapRate * pow10(params.outputDecimals);
  const denominator = pow10(params.rateDecimals) * pow10(params.inputDecimals);

  const amountOutRaw = numerator / denominator;
  const feeAmount = (amountOutRaw * BigInt(params.feeBasisPoints)) / 10_000n;
  const netAmountOut = amountOutRaw - feeAmount;

  return buildQuote(
    amountIn,
    amountOutRaw,
    feeAmount,
    netAmountOut,
    swapRate,
    params.rateDecimals,
    params.feeBasisPoints,
    params.inputDecimals,
    params.outputDecimals,
  );
}

export function calculateReverseQuote(params: {
  amountIn: BigNumberish;
  swapRate: BigNumberish;
  rateDecimals: number;
  feeBasisPoints: number;
  inputDecimals: number;
  outputDecimals: number;
}): SwapQuote {
  const amountIn = toBigInt(params.amountIn);
  const swapRate = toBigInt(params.swapRate);

  if (swapRate <= 0n) {
    throw new Error("swapRate must be greater than zero");
  }

  if (params.feeBasisPoints < 0 || params.feeBasisPoints > 10_000) {
    throw new Error("feeBasisPoints must be in [0, 10000]");
  }

  const numerator =
    amountIn * pow10(params.rateDecimals) * pow10(params.inputDecimals);
  const denominator = swapRate * pow10(params.outputDecimals);

  const amountOutRaw = numerator / denominator;
  const feeAmount = (amountOutRaw * BigInt(params.feeBasisPoints)) / 10_000n;
  const netAmountOut = amountOutRaw - feeAmount;

  return buildQuote(
    amountIn,
    amountOutRaw,
    feeAmount,
    netAmountOut,
    swapRate,
    params.rateDecimals,
    params.feeBasisPoints,
    params.inputDecimals,
    params.outputDecimals,
  );
}
