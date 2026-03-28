import type { GroupIdInput } from "./types.js";

const MAX_U64 = 0xffff_ffff_ffff_ffffn;

function assertByteLength(value: Uint8Array): void {
  if (value.length !== 8) {
    throw new Error(`groupId must be exactly 8 bytes, received ${value.length}`);
  }
}

function assertByteArray(values: number[]): void {
  if (values.length !== 8) {
    throw new Error(`groupId must contain exactly 8 bytes, received ${values.length}`);
  }

  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`groupId byte values must be integers in [0, 255], received ${value}`);
    }
  }
}

function tryNormalizeArrayLike(groupId: unknown): Uint8Array | null {
  if (!groupId || typeof groupId !== "object") {
    return null;
  }

  if ("toArray" in groupId && typeof (groupId as { toArray?: unknown }).toArray === "function") {
    const values = (groupId as { toArray(): unknown[] }).toArray().map((value) => Number(value));
    assertByteArray(values);
    return Uint8Array.from(values);
  }

  if (ArrayBuffer.isView(groupId)) {
    const view = groupId as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    assertByteLength(bytes);
    return new Uint8Array(bytes);
  }

  if (groupId instanceof ArrayBuffer) {
    const bytes = new Uint8Array(groupId);
    assertByteLength(bytes);
    return bytes;
  }

  if (
    Symbol.iterator in groupId &&
    typeof (groupId as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  ) {
    const values = Array.from(groupId as Iterable<unknown>).map((value) => Number(value));
    assertByteArray(values);
    return Uint8Array.from(values);
  }

  if (
    "length" in groupId &&
    typeof (groupId as { length?: unknown }).length === "number"
  ) {
    const values = Array.from(groupId as ArrayLike<unknown>).map((value) => Number(value));
    assertByteArray(values);
    return Uint8Array.from(values);
  }

  const numericKeys = Object.keys(groupId)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));

  if (numericKeys.length === 8) {
    const values = numericKeys.map((key) =>
      Number((groupId as Record<string, unknown>)[key]),
    );
    assertByteArray(values);
    return Uint8Array.from(values);
  }

  for (const nestedKey of ["data", "bytes", "array", "values", "items"]) {
    if (nestedKey in groupId) {
      const nestedValue = tryNormalizeArrayLike(
        (groupId as Record<string, unknown>)[nestedKey],
      );
      if (nestedValue) {
        return nestedValue;
      }
    }
  }

  const objectValues = Object.values(groupId as Record<string, unknown>);
  if (objectValues.length === 1) {
    const nestedValue = tryNormalizeArrayLike(objectValues[0]);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

export function groupIdFromU64LE(value: bigint | number): Uint8Array {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  if (bigintValue < 0n || bigintValue > MAX_U64) {
    throw new Error(`groupId numeric value must fit into u64, received ${bigintValue.toString()}`);
  }

  const bytes = new Uint8Array(8);
  let remaining = bigintValue;
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export function groupIdToU64LE(groupId: Uint8Array): bigint {
  assertByteLength(groupId);

  let result = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    result = (result << 8n) | BigInt(groupId[index]);
  }
  return result;
}

export function toGroupIdBytes(groupId: GroupIdInput): Uint8Array {
  if (groupId instanceof Uint8Array) {
    assertByteLength(groupId);
    return new Uint8Array(groupId);
  }

  if (Array.isArray(groupId)) {
    assertByteArray(groupId);
    return Uint8Array.from(groupId);
  }

  if (typeof groupId === "bigint") {
    return groupIdFromU64LE(groupId);
  }

  if (typeof groupId === "number") {
    if (!Number.isSafeInteger(groupId) || groupId < 0) {
      throw new Error(`numeric groupId must be a non-negative safe integer, received ${groupId}`);
    }
    return groupIdFromU64LE(groupId);
  }

  const normalizedArrayLike = tryNormalizeArrayLike(groupId);
  if (normalizedArrayLike) {
    return normalizedArrayLike;
  }

  throw new Error("unsupported groupId input");
}

export function toGroupIdBuffer(groupId: GroupIdInput): Buffer {
  return Buffer.from(toGroupIdBytes(groupId));
}

export function groupIdToHex(groupId: Uint8Array): string {
  assertByteLength(groupId);
  return Buffer.from(groupId).toString("hex");
}
