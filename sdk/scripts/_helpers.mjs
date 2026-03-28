import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";

import {
  TokenSwapClient,
  TOKEN_SWAP_PROGRAM_ID,
  SwapGroupStatus,
  groupIdFromU64LE,
} from "../dist/index.js";

export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_SWAP_PROGRAM_ID, SwapGroupStatus };

export function resolveRpcUrl() {
  return process.env.SDK_RPC_URL ?? "http://127.0.0.1:8899";
}

export function loadKeypairFromFile(filePath) {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function loadDefaultAdmin() {
  const defaultPath = process.env.SDK_ADMIN_KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
  return loadKeypairFromFile(defaultPath);
}

export function createConnection() {
  return new Connection(resolveRpcUrl(), "confirmed");
}

export function createClient(connection) {
  return TokenSwapClient.initialize(connection, {
    programId: TOKEN_SWAP_PROGRAM_ID,
    commitment: "confirmed",
  });
}

export async function assertProgramDeployed(connection) {
  const programInfo = await connection.getAccountInfo(TOKEN_SWAP_PROGRAM_ID, "confirmed");
  assert(programInfo, `program ${TOKEN_SWAP_PROGRAM_ID.toBase58()} is not deployed on ${resolveRpcUrl()}`);
}

export async function airdropIfNeeded(connection, publicKey, minimumLamports = 5n * BigInt(LAMPORTS_PER_SOL)) {
  const balance = BigInt(await connection.getBalance(publicKey, "confirmed"));
  if (balance >= minimumLamports) {
    return balance;
  }

  const shortfall = minimumLamports - balance;
  const requestedLamports = Number(shortfall + BigInt(LAMPORTS_PER_SOL));
  const signature = await connection.requestAirdrop(publicKey, requestedLamports);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      ...latestBlockhash,
    },
    "confirmed",
  );

  return BigInt(await connection.getBalance(publicKey, "confirmed"));
}

export async function createTestMint({
  connection,
  payer,
  authority,
  decimals = 6,
  programId = TOKEN_PROGRAM_ID,
}) {
  return createMint(
    connection,
    payer,
    authority.publicKey,
    null,
    decimals,
    undefined,
    undefined,
    programId,
  );
}

export async function getOrCreateAta({
  connection,
  payer,
  mint,
  owner,
  tokenProgram = TOKEN_PROGRAM_ID,
}) {
  return getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
    false,
    "confirmed",
    undefined,
    tokenProgram,
  );
}

export async function mintToAccount({
  connection,
  payer,
  mint,
  destination,
  authority,
  amount,
  tokenProgram = TOKEN_PROGRAM_ID,
}) {
  return mintTo(
    connection,
    payer,
    mint,
    destination,
    authority,
    amount,
    [],
    undefined,
    tokenProgram,
  );
}

export async function sendInstruction({ connection, payer, instruction, signers = [] }) {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(instruction);

  transaction.sign(payer, ...signers);
  return sendAndConfirmTransaction(connection, transaction, [payer, ...signers], {
    commitment: "confirmed",
  });
}

export async function readTokenAmount(connection, tokenAccountAddress, tokenProgram = TOKEN_PROGRAM_ID) {
  const account = await getAccount(connection, tokenAccountAddress, "confirmed", tokenProgram);
  return BigInt(account.amount.toString());
}

export async function createActors(connection) {
  const admin = loadDefaultAdmin();
  const user = Keypair.generate();
  const newAdmin = Keypair.generate();

  await assertProgramDeployed(connection);
  await Promise.all([
    airdropIfNeeded(connection, admin.publicKey, 20n * BigInt(LAMPORTS_PER_SOL)),
    airdropIfNeeded(connection, user.publicKey, 20n * BigInt(LAMPORTS_PER_SOL)),
    airdropIfNeeded(connection, newAdmin.publicKey, 20n * BigInt(LAMPORTS_PER_SOL)),
  ]);

  return { admin, user, newAdmin };
}

export function uniqueGroupId(seedOffset = 0n) {
  const timestamp = BigInt(Date.now()) + seedOffset;
  return groupIdFromU64LE(timestamp);
}

export function formatPk(publicKey) {
  return publicKey instanceof PublicKey ? publicKey.toBase58() : String(publicKey);
}

export async function logSnapshot(label, client, group) {
  const snapshot = await client.getGroupSnapshot(group);
  console.log(`\n[${label}]`);
  console.log({
    group: snapshot.address.toBase58(),
    admin: snapshot.admin.toBase58(),
    inputMint: snapshot.inputMint.toBase58(),
    outputMint: snapshot.outputMint.toBase58(),
    status: snapshot.status,
    inputVault: snapshot.vaults.inputVault.toBase58(),
    outputVault: snapshot.vaults.outputVault.toBase58(),
    inputVaultBalance: snapshot.balances.inputVault?.toString() ?? null,
    outputVaultBalance: snapshot.balances.outputVault?.toString() ?? null,
  });
}

export function expectEq(actual, expected, message) {
  assert.equal(actual.toString(), expected.toString(), message);
}

export function deriveDefaultAta(owner, mint, tokenProgram = TOKEN_PROGRAM_ID) {
  return getAssociatedTokenAddressSync(mint, owner, false, tokenProgram);
}
