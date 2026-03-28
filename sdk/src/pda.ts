import { PublicKey } from "@solana/web3.js";
import {
  INPUT_VAULT_SEED,
  OUTPUT_VAULT_SEED,
  SWAP_GROUP_SEED,
  TOKEN_SWAP_PROGRAM_ID,
} from "./constants.js";
import { toGroupIdBuffer } from "./group-id.js";
import type { AddressLike, GroupIdInput, VaultAddresses } from "./types.js";

function toPublicKey(value: AddressLike): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

export function deriveSwapGroupAddress(
  groupId: GroupIdInput,
  programId: AddressLike = TOKEN_SWAP_PROGRAM_ID,
): readonly [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SWAP_GROUP_SEED, toGroupIdBuffer(groupId)],
    toPublicKey(programId),
  );
}

export function deriveInputVaultAddress(
  swapGroup: AddressLike,
  programId: AddressLike = TOKEN_SWAP_PROGRAM_ID,
): readonly [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [INPUT_VAULT_SEED, toPublicKey(swapGroup).toBuffer()],
    toPublicKey(programId),
  );
}

export function deriveOutputVaultAddress(
  swapGroup: AddressLike,
  programId: AddressLike = TOKEN_SWAP_PROGRAM_ID,
): readonly [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [OUTPUT_VAULT_SEED, toPublicKey(swapGroup).toBuffer()],
    toPublicKey(programId),
  );
}

export function deriveVaultAddresses(
  groupId: GroupIdInput,
  programId: AddressLike = TOKEN_SWAP_PROGRAM_ID,
): VaultAddresses {
  const [swapGroup] = deriveSwapGroupAddress(groupId, programId);
  const [inputVault] = deriveInputVaultAddress(swapGroup, programId);
  const [outputVault] = deriveOutputVaultAddress(swapGroup, programId);
  return { swapGroup, inputVault, outputVault };
}
