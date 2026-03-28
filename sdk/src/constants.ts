import { PublicKey } from "@solana/web3.js";

export const TOKEN_SWAP_PROGRAM_ADDRESS = "5tVSCoxYwSjewDXGZyN5rnvj8ovjAoxvRpzVY8SwQ8b1";
export const TOKEN_SWAP_PROGRAM_ID = new PublicKey(TOKEN_SWAP_PROGRAM_ADDRESS);

export const SWAP_GROUP_ACCOUNT_SIZE = 144;
export const SWAP_GROUP_ACCOUNT_DISCRIMINATOR = Uint8Array.from([
  52, 88, 74, 68, 102, 2, 69, 113,
]);

export const SWAP_GROUP_SEED = Buffer.from("swap_group", "utf8");
export const INPUT_VAULT_SEED = Buffer.from("vault_input", "utf8");
export const OUTPUT_VAULT_SEED = Buffer.from("vault_output", "utf8");

export enum SwapGroupStatus {
  Active = 0,
  Paused = 1,
  Closed = 2,
}
