import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { SwapGroupStatus } from "./constants.js";

export type AddressLike = PublicKey | string;
export type BigNumberish = bigint | number | string | { toString(): string };
export type GroupIdInput = Uint8Array | Buffer | number[] | bigint | number;

export interface MintMetadata {
  address: PublicKey;
  decimals: number;
  tokenProgram: PublicKey;
}

export interface VaultAddresses {
  swapGroup: PublicKey;
  inputVault: PublicKey;
  outputVault: PublicKey;
}

export interface VaultBalances {
  inputVault: bigint | null;
  outputVault: bigint | null;
}

export interface SwapGroupAccountData {
  address: PublicKey;
  admin: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  swapRate: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  groupId: Uint8Array;
  feeBasisPoints: number;
  rateDecimals: number;
  status: SwapGroupStatus | number;
  bump: number;
  inputVaultBump: number;
  outputVaultBump: number;
}

export interface SwapGroupSnapshot extends SwapGroupAccountData {
  inputMintInfo: MintMetadata;
  outputMintInfo: MintMetadata;
  vaults: VaultAddresses;
  balances: VaultBalances;
}

export interface SwapGroupFilters {
  admin?: AddressLike;
  inputMint?: AddressLike;
  outputMint?: AddressLike;
  status?: SwapGroupStatus | number;
}

export interface SwapQuote {
  amountIn: bigint;
  amountOutRaw: bigint;
  feeAmount: bigint;
  netAmountOut: bigint;
  swapRate: bigint;
  rateDecimals: number;
  feeBasisPoints: number;
  inputDecimals: number;
  outputDecimals: number;
}

export interface TokenSwapClientOptions {
  programId?: AddressLike;
  commitment?: "processed" | "confirmed" | "finalized";
}

export type GroupRef = GroupIdInput | AddressLike | SwapGroupAccountData;

export interface CreateGroupInstructionParams {
  admin: AddressLike;
  groupId: GroupIdInput;
  inputMint: AddressLike;
  outputMint: AddressLike;
  swapRate: BigNumberish;
  rateDecimals: number;
  feeBasisPoints: number;
  inputTokenProgram?: AddressLike;
  outputTokenProgram?: AddressLike;
}

export interface DepositInstructionParams {
  admin: AddressLike;
  group: GroupRef;
  amount: BigNumberish;
  adminOutputTokenAccount?: AddressLike;
}

export interface WithdrawInstructionParams {
  admin: AddressLike;
  group: GroupRef;
  amount: BigNumberish;
  adminOutputTokenAccount?: AddressLike;
}

export interface SetGroupStatusInstructionParams {
  admin: AddressLike;
  group: GroupRef;
  status: SwapGroupStatus | number;
}

export interface TransferAdminInstructionParams {
  admin: AddressLike;
  group: GroupRef;
  newAdmin: AddressLike;
}

export interface UpdateConfigInstructionParams {
  admin: AddressLike;
  group: GroupRef;
  swapRate: BigNumberish;
  rateDecimals: number;
  feeBasisPoints: number;
}

export interface CloseGroupInstructionParams {
  admin: AddressLike;
  group: GroupRef;
  adminInputTokenAccount?: AddressLike;
  adminOutputTokenAccount?: AddressLike;
}

export interface SwapInstructionParams {
  user: AddressLike;
  group: GroupRef;
  amountIn: BigNumberish;
  userInputTokenAccount?: AddressLike;
  userOutputTokenAccount?: AddressLike;
}

export interface SwapReverseInstructionParams {
  user: AddressLike;
  group: GroupRef;
  amountIn: BigNumberish;
  userInputTokenAccount?: AddressLike;
  userOutputTokenAccount?: AddressLike;
}

export interface PreparedInstruction<TParams = unknown> {
  instruction: TransactionInstruction;
  params: TParams;
}
