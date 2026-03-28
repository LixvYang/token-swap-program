import type { Idl } from "@coral-xyz/anchor";
import tokenSwapProgramIdl from "./idl/token_swap_program.json" with { type: "json" };

export const TOKEN_SWAP_PROGRAM_IDL = tokenSwapProgramIdl as Idl & {
  address: string;
};
