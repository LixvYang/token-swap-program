import { groupIdToHex, groupIdToU64LE, type SwapGroupAccountData, type SwapGroupSnapshot } from "@rebetxin/token-swap-sdk";

const DECIMAL_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US");

export function shortAddress(address: string | { toBase58(): string }, chars = 4): string {
  const value = typeof address === "string" ? address : address.toBase58();
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

export function formatInteger(value: bigint | number | string): string {
  const normalized = typeof value === "bigint" ? value.toString() : value;
  return INTEGER_FORMATTER.format(Number(normalized));
}

export function formatUiAmount(raw: bigint | null, decimals: number): string {
  if (raw === null) {
    return "Unavailable";
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;

  if (fraction === 0n) {
    return DECIMAL_FORMATTER.format(Number(whole));
  }

  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${INTEGER_FORMATTER.format(Number(whole))}.${fractionText}`;
}

export function parseUiAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Amount is required");
  }

  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Error("Amount must be a non-negative decimal number");
  }

  const whole = BigInt(match[1]);
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`Amount supports up to ${decimals} decimal places`);
  }

  const paddedFraction = `${fraction}${"0".repeat(decimals - fraction.length)}`;
  return whole * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");
}

export function parseFixedRate(value: string, decimals: number): bigint {
  return parseUiAmount(value, decimals);
}

export function formatTimestamp(value: bigint): string {
  if (value === 0n) {
    return "Not set";
  }

  return new Date(Number(value) * 1000).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStatus(status: number): string {
  switch (status) {
    case 0:
      return "Active";
    case 1:
      return "Paused";
    case 2:
      return "Closed";
    default:
      return `Unknown (${status})`;
  }
}

export function describeGroupId(group: Pick<SwapGroupAccountData, "groupId">): string {
  return `${groupIdToU64LE(group.groupId).toString()} / 0x${groupIdToHex(group.groupId)}`;
}

export { groupIdToHex };

export function formatRate(snapshot: Pick<SwapGroupSnapshot, "swapRate" | "rateDecimals">): string {
  return formatUiAmount(snapshot.swapRate, snapshot.rateDecimals);
}

export function formatFeeBps(basisPoints: number): string {
  return `${basisPoints} bps (${(basisPoints / 100).toFixed(2)}%)`;
}
