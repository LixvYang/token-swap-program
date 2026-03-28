import type { MintMetadata } from "@rebetxin/token-swap-sdk";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { formatUiAmount } from "./format";

export interface DiscoveredTokenAccount {
  address: PublicKey;
  exists: boolean;
  owner: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  balanceRaw: bigint | null;
  balanceUi: string;
}

export function deriveAssociatedTokenAccount(owner: PublicKey, mint: MintMetadata): PublicKey {
  return getAssociatedTokenAddressSync(
    mint.address,
    owner,
    false,
    mint.tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

export async function discoverAssociatedTokenAccount(
  connection: Connection,
  owner: PublicKey,
  mint: MintMetadata,
): Promise<DiscoveredTokenAccount> {
  const address = deriveAssociatedTokenAccount(owner, mint);
  const accountInfo = await connection.getAccountInfo(address, "confirmed");

  if (!accountInfo) {
    return {
      address,
      exists: false,
      owner,
      mint: mint.address,
      tokenProgram: mint.tokenProgram,
      balanceRaw: null,
      balanceUi: "Missing",
    };
  }

  const balance = await connection.getTokenAccountBalance(address, "confirmed");
  const rawAmount = BigInt(balance.value.amount);

  return {
    address,
    exists: true,
    owner,
    mint: mint.address,
    tokenProgram: mint.tokenProgram,
    balanceRaw: rawAmount,
    balanceUi: formatUiAmount(rawAmount, mint.decimals),
  };
}

export function buildCreateAssociatedTokenAccountInstruction(params: {
  payer: PublicKey;
  owner: PublicKey;
  mint: MintMetadata;
}): TransactionInstruction {
  return createAssociatedTokenAccountInstruction(
    params.payer,
    deriveAssociatedTokenAccount(params.owner, params.mint),
    params.owner,
    params.mint.address,
    params.mint.tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}
