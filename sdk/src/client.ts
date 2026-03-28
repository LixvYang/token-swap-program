import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type Commitment,
  type TransactionInstruction,
} from "@solana/web3.js";
import { SwapGroupStatus, TOKEN_SWAP_PROGRAM_ID } from "./constants.js";
import { toGroupIdBytes } from "./group-id.js";
import { TOKEN_SWAP_PROGRAM_IDL } from "./idl.js";
import { calculateForwardQuote, calculateReverseQuote, toBigInt } from "./math.js";
import {
  deriveInputVaultAddress,
  deriveOutputVaultAddress,
  deriveSwapGroupAddress,
  deriveVaultAddresses,
} from "./pda.js";
import type {
  AddressLike,
  CloseGroupInstructionParams,
  CreateGroupInstructionParams,
  DepositInstructionParams,
  GroupRef,
  MintMetadata,
  PreparedInstruction,
  SetGroupStatusInstructionParams,
  SwapGroupAccountData,
  SwapGroupFilters,
  SwapGroupSnapshot,
  SwapInstructionParams,
  SwapQuote,
  SwapReverseInstructionParams,
  TokenSwapClientOptions,
  TransferAdminInstructionParams,
  UpdateConfigInstructionParams,
  VaultBalances,
  WithdrawInstructionParams,
} from "./types.js";

function toPublicKey(value: AddressLike): PublicKey {
  return Boolean(
    value &&
      typeof value === "object" &&
      "toBase58" in value &&
      typeof (value as { toBase58?: unknown }).toBase58 === "function",
  )
    ? new PublicKey((value as { toBase58(): string }).toBase58())
    : new PublicKey(value);
}

function isPublicKeyLike(value: unknown): value is PublicKey {
  return Boolean(
    value &&
      typeof value === "object" &&
      "toBase58" in value &&
      typeof (value as { toBase58?: unknown }).toBase58 === "function",
  );
}

function createReadonlyWallet(): anchor.Wallet {
  const payer = anchor.web3.Keypair.generate();
  const publicKey = payer.publicKey;

  return {
    payer,
    publicKey,
    async signTransaction(transaction) {
      return transaction;
    },
    async signAllTransactions(transactions) {
      return transactions;
    },
  };
}

function isSwapGroupAccountData(value: unknown): value is SwapGroupAccountData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SwapGroupAccountData>;
  return isPublicKeyLike(candidate.address) && isPublicKeyLike(candidate.admin);
}

function toCommitment(value?: "processed" | "confirmed" | "finalized"): Commitment {
  return value ?? "confirmed";
}

function toAnchorBn(value: unknown): BN {
  return new BN(toBigInt(value as never).toString());
}

async function normalizeSwapGroup(
  address: PublicKey,
  raw: any,
  connection: Connection,
  commitment: Commitment,
): Promise<SwapGroupAccountData> {
  let normalizedGroupId: Uint8Array;
  try {
    normalizedGroupId = toGroupIdBytes(raw.groupId);
  } catch {
    const accountInfo = await connection.getAccountInfo(address, commitment);
    if (!accountInfo) {
      throw new Error(`swap group account not found: ${address.toBase58()}`);
    }

    normalizedGroupId = new Uint8Array(accountInfo.data.slice(128, 136));
  }

  return {
    address,
    admin: raw.admin,
    inputMint: raw.inputMint,
    outputMint: raw.outputMint,
    swapRate: BigInt(raw.swapRate.toString()),
    createdAt: BigInt(raw.createdAt.toString()),
    updatedAt: BigInt(raw.updatedAt.toString()),
    groupId: normalizedGroupId,
    feeBasisPoints: raw.feeBasisPoints,
    rateDecimals: raw.rateDecimals,
    status: raw.status,
    bump: raw.bump,
    inputVaultBump: raw.inputVaultBump,
    outputVaultBump: raw.outputVaultBump,
  };
}

export class TokenSwapClient {
  readonly connection: Connection;
  readonly commitment: Commitment;
  readonly programId: PublicKey;
  readonly provider: anchor.AnchorProvider;
  readonly program: anchor.Program;

  private readonly mintMetadataCache = new Map<string, Promise<MintMetadata>>();

  private constructor(connection: Connection, options: TokenSwapClientOptions = {}) {
    this.connection = connection;
    this.commitment = toCommitment(options.commitment);
    this.programId = options.programId ? toPublicKey(options.programId) : TOKEN_SWAP_PROGRAM_ID;

    this.provider = new anchor.AnchorProvider(
      connection,
      createReadonlyWallet(),
      { commitment: this.commitment },
    );

    const idl = {
      ...TOKEN_SWAP_PROGRAM_IDL,
      address: this.programId.toBase58(),
    } as anchor.Idl;

    this.program = new anchor.Program(idl, this.provider);
  }

  static initialize(connection: Connection, options: TokenSwapClientOptions = {}): TokenSwapClient {
    return new TokenSwapClient(connection, options);
  }

  deriveSwapGroupAddress(groupId: Parameters<typeof toGroupIdBytes>[0]) {
    return deriveSwapGroupAddress(groupId, this.programId);
  }

  deriveVaultAddresses(groupId: Parameters<typeof deriveVaultAddresses>[0]) {
    return deriveVaultAddresses(groupId, this.programId);
  }

  async getMintMetadata(mint: AddressLike): Promise<MintMetadata> {
    const mintAddress = toPublicKey(mint);
    const cacheKey = mintAddress.toBase58();

    if (!this.mintMetadataCache.has(cacheKey)) {
      this.mintMetadataCache.set(
        cacheKey,
        (async () => {
          const accountInfo = await this.connection.getAccountInfo(mintAddress, this.commitment);
          if (!accountInfo) {
            throw new Error(`mint account not found: ${mintAddress.toBase58()}`);
          }

          const tokenProgram = accountInfo.owner;
          if (!tokenProgram.equals(TOKEN_PROGRAM_ID) && !tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
            throw new Error(
              `unsupported token program owner for mint ${mintAddress.toBase58()}: ${tokenProgram.toBase58()}`,
            );
          }

          const mintInfo = await getMint(
            this.connection,
            mintAddress,
            this.commitment,
            tokenProgram,
          );

          return {
            address: mintAddress,
            decimals: mintInfo.decimals,
            tokenProgram,
          };
        })(),
      );
    }

    return this.mintMetadataCache.get(cacheKey)!;
  }

  async getGroup(address: AddressLike): Promise<SwapGroupAccountData | null> {
    const groupAddress = toPublicKey(address);
    const raw = await ((this.program.account as any).swapGroup.fetchNullable(groupAddress) as Promise<any | null>);
    return raw ? normalizeSwapGroup(groupAddress, raw, this.connection, this.commitment) : null;
  }

  async getGroupById(groupId: Parameters<typeof toGroupIdBytes>[0]): Promise<SwapGroupAccountData | null> {
    const [groupAddress] = deriveSwapGroupAddress(groupId, this.programId);
    return this.getGroup(groupAddress);
  }

  async getAllGroups(filters: SwapGroupFilters = {}): Promise<SwapGroupAccountData[]> {
    const rawGroups = await (((this.program.account as any).swapGroup.all()) as Promise<Array<{ publicKey: PublicKey; account: any }>>);
    const groups = await Promise.all(
      rawGroups.map(({ publicKey, account }) =>
        normalizeSwapGroup(publicKey, account, this.connection, this.commitment),
      ),
    );

    return groups.filter((group) => {
      if (filters.admin && !group.admin.equals(toPublicKey(filters.admin))) {
        return false;
      }
      if (filters.inputMint && !group.inputMint.equals(toPublicKey(filters.inputMint))) {
        return false;
      }
      if (filters.outputMint && !group.outputMint.equals(toPublicKey(filters.outputMint))) {
        return false;
      }
      if (typeof filters.status === "number" && group.status !== filters.status) {
        return false;
      }
      return true;
    });
  }

  async getVaultBalances(group: GroupRef): Promise<VaultBalances> {
    const resolvedGroup = await this.resolveGroup(group);
    const [inputVaultAddress] = deriveInputVaultAddress(resolvedGroup.address, this.programId);
    const [outputVaultAddress] = deriveOutputVaultAddress(resolvedGroup.address, this.programId);

    const [inputVault, outputVault] = await Promise.all([
      this.safeGetTokenAccountBalance(inputVaultAddress),
      this.safeGetTokenAccountBalance(outputVaultAddress),
    ]);

    return {
      inputVault,
      outputVault,
    };
  }

  async getGroupSnapshot(group: GroupRef): Promise<SwapGroupSnapshot> {
    const resolvedGroup = await this.resolveGroup(group);
    const [inputMintInfo, outputMintInfo, balances] = await Promise.all([
      this.getMintMetadata(resolvedGroup.inputMint),
      this.getMintMetadata(resolvedGroup.outputMint),
      this.getVaultBalances(resolvedGroup),
    ]);

    return {
      ...resolvedGroup,
      inputMintInfo,
      outputMintInfo,
      vaults: deriveVaultAddresses(resolvedGroup.groupId, this.programId),
      balances,
    };
  }

  async quoteForward(group: GroupRef, amountIn: bigint | number | string): Promise<SwapQuote> {
    const snapshot = await this.getGroupSnapshot(group);
    return calculateForwardQuote({
      amountIn,
      swapRate: snapshot.swapRate,
      rateDecimals: snapshot.rateDecimals,
      feeBasisPoints: snapshot.feeBasisPoints,
      inputDecimals: snapshot.inputMintInfo.decimals,
      outputDecimals: snapshot.outputMintInfo.decimals,
    });
  }

  async quoteReverse(group: GroupRef, amountIn: bigint | number | string): Promise<SwapQuote> {
    const snapshot = await this.getGroupSnapshot(group);
    return calculateReverseQuote({
      amountIn,
      swapRate: snapshot.swapRate,
      rateDecimals: snapshot.rateDecimals,
      feeBasisPoints: snapshot.feeBasisPoints,
      inputDecimals: snapshot.inputMintInfo.decimals,
      outputDecimals: snapshot.outputMintInfo.decimals,
    });
  }

  buildTransaction(instructions: TransactionInstruction[], feePayer?: AddressLike): Transaction {
    const transaction = new Transaction();
    if (feePayer) {
      transaction.feePayer = toPublicKey(feePayer);
    }
    for (const instruction of instructions) {
      transaction.add(instruction);
    }
    return transaction;
  }

  async buildCreateGroupInstruction(
    params: CreateGroupInstructionParams,
  ): Promise<PreparedInstruction<CreateGroupInstructionParams>> {
    const admin = toPublicKey(params.admin);
    const inputMint = toPublicKey(params.inputMint);
    const outputMint = toPublicKey(params.outputMint);
    const groupId = toGroupIdBytes(params.groupId);
    const { swapGroup, inputVault, outputVault } = deriveVaultAddresses(groupId, this.programId);

    const [inputMintInfo, outputMintInfo] = await Promise.all([
      params.inputTokenProgram
        ? Promise.resolve({
            address: inputMint,
            decimals: 0,
            tokenProgram: toPublicKey(params.inputTokenProgram),
          })
        : this.getMintMetadata(inputMint),
      params.outputTokenProgram
        ? Promise.resolve({
            address: outputMint,
            decimals: 0,
            tokenProgram: toPublicKey(params.outputTokenProgram),
          })
        : this.getMintMetadata(outputMint),
    ]);

    const instruction = await (this.program.methods as any)
      .createGroup(
        Array.from(groupId),
        toAnchorBn(params.swapRate),
        params.rateDecimals,
        params.feeBasisPoints,
      )
      .accounts({
        admin,
        swapGroup,
        inputVault,
        outputVault,
        inputMint,
        outputMint,
        inputTokenProgram: inputMintInfo.tokenProgram,
        outputTokenProgram: outputMintInfo.tokenProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    return { instruction, params };
  }

  async buildDepositInstruction(
    params: DepositInstructionParams,
  ): Promise<PreparedInstruction<DepositInstructionParams>> {
    const admin = toPublicKey(params.admin);
    const group = await this.resolveGroup(params.group);
    const outputMintInfo = await this.getMintMetadata(group.outputMint);
    const [outputVault] = deriveOutputVaultAddress(group.address, this.programId);
    const adminOutputAta =
      params.adminOutputTokenAccount
        ? toPublicKey(params.adminOutputTokenAccount)
        : getAssociatedTokenAddressSync(group.outputMint, admin, false, outputMintInfo.tokenProgram);

    const instruction = await (this.program.methods as any)
      .deposit(toAnchorBn(params.amount))
      .accounts({
        admin,
        swapGroup: group.address,
        outputVault,
        adminOutputAta,
        outputMint: group.outputMint,
        tokenProgram: outputMintInfo.tokenProgram,
      })
      .instruction();

    return { instruction, params };
  }

  async buildWithdrawInstruction(
    params: WithdrawInstructionParams,
  ): Promise<PreparedInstruction<WithdrawInstructionParams>> {
    const admin = toPublicKey(params.admin);
    const group = await this.resolveGroup(params.group);
    const outputMintInfo = await this.getMintMetadata(group.outputMint);
    const [outputVault] = deriveOutputVaultAddress(group.address, this.programId);
    const adminOutputAta =
      params.adminOutputTokenAccount
        ? toPublicKey(params.adminOutputTokenAccount)
        : getAssociatedTokenAddressSync(group.outputMint, admin, false, outputMintInfo.tokenProgram);

    const instruction = await (this.program.methods as any)
      .withdraw(toAnchorBn(params.amount))
      .accounts({
        admin,
        swapGroup: group.address,
        outputVault,
        adminOutputAta,
        outputMint: group.outputMint,
        tokenProgram: outputMintInfo.tokenProgram,
      })
      .instruction();

    return { instruction, params };
  }

  async buildSetGroupStatusInstruction(
    params: SetGroupStatusInstructionParams,
  ): Promise<PreparedInstruction<SetGroupStatusInstructionParams>> {
    const admin = toPublicKey(params.admin);
    const group = await this.resolveGroup(params.group);

    const instruction = await (this.program.methods as any)
      .setGroupStatus(params.status)
      .accounts({
        admin,
        swapGroup: group.address,
      })
      .instruction();

    return { instruction, params };
  }

  async buildTransferAdminInstruction(
    params: TransferAdminInstructionParams,
  ): Promise<PreparedInstruction<TransferAdminInstructionParams>> {
    const admin = toPublicKey(params.admin);
    const group = await this.resolveGroup(params.group);
    const newAdmin = toPublicKey(params.newAdmin);

    const instruction = await (this.program.methods as any)
      .transferAdmin(newAdmin)
      .accounts({
        admin,
        swapGroup: group.address,
      })
      .instruction();

    return { instruction, params };
  }

  async buildUpdateConfigInstruction(
    params: UpdateConfigInstructionParams,
  ): Promise<PreparedInstruction<UpdateConfigInstructionParams>> {
    const admin = toPublicKey(params.admin);
    const group = await this.resolveGroup(params.group);

    const instruction = await (this.program.methods as any)
      .updateConfig(
        toAnchorBn(params.swapRate),
        params.rateDecimals,
        params.feeBasisPoints,
      )
      .accounts({
        admin,
        swapGroup: group.address,
      })
      .instruction();

    return { instruction, params };
  }

  async buildCloseGroupInstruction(
    params: CloseGroupInstructionParams,
  ): Promise<PreparedInstruction<CloseGroupInstructionParams>> {
    const admin = toPublicKey(params.admin);
    const group = await this.resolveGroup(params.group);
    const [inputMintInfo, outputMintInfo] = await Promise.all([
      this.getMintMetadata(group.inputMint),
      this.getMintMetadata(group.outputMint),
    ]);

    const [inputVault] = deriveInputVaultAddress(group.address, this.programId);
    const [outputVault] = deriveOutputVaultAddress(group.address, this.programId);

    const adminInputAta =
      params.adminInputTokenAccount
        ? toPublicKey(params.adminInputTokenAccount)
        : getAssociatedTokenAddressSync(group.inputMint, admin, false, inputMintInfo.tokenProgram);

    const adminOutputAta =
      params.adminOutputTokenAccount
        ? toPublicKey(params.adminOutputTokenAccount)
        : getAssociatedTokenAddressSync(group.outputMint, admin, false, outputMintInfo.tokenProgram);

    const instruction = await (this.program.methods as any)
      .closeGroup()
      .accounts({
        admin,
        swapGroup: group.address,
        inputVault,
        outputVault,
        adminInputAta,
        adminOutputAta,
        inputMint: group.inputMint,
        outputMint: group.outputMint,
        inputTokenProgram: inputMintInfo.tokenProgram,
        outputTokenProgram: outputMintInfo.tokenProgram,
      })
      .instruction();

    return { instruction, params };
  }

  async buildSwapInstruction(
    params: SwapInstructionParams,
  ): Promise<PreparedInstruction<SwapInstructionParams>> {
    const user = toPublicKey(params.user);
    const group = await this.resolveGroup(params.group);
    const [inputMintInfo, outputMintInfo] = await Promise.all([
      this.getMintMetadata(group.inputMint),
      this.getMintMetadata(group.outputMint),
    ]);

    const [inputVault] = deriveInputVaultAddress(group.address, this.programId);
    const [outputVault] = deriveOutputVaultAddress(group.address, this.programId);

    const userInputAta =
      params.userInputTokenAccount
        ? toPublicKey(params.userInputTokenAccount)
        : getAssociatedTokenAddressSync(group.inputMint, user, false, inputMintInfo.tokenProgram);

    const userOutputAta =
      params.userOutputTokenAccount
        ? toPublicKey(params.userOutputTokenAccount)
        : getAssociatedTokenAddressSync(group.outputMint, user, false, outputMintInfo.tokenProgram);

    const instruction = await (this.program.methods as any)
      .swap(toAnchorBn(params.amountIn))
      .accounts({
        user,
        swapGroup: group.address,
        inputVault,
        outputVault,
        userInputAta,
        userOutputAta,
        inputMint: group.inputMint,
        outputMint: group.outputMint,
        inputTokenProgram: inputMintInfo.tokenProgram,
        outputTokenProgram: outputMintInfo.tokenProgram,
      })
      .instruction();

    return { instruction, params };
  }

  async buildSwapReverseInstruction(
    params: SwapReverseInstructionParams,
  ): Promise<PreparedInstruction<SwapReverseInstructionParams>> {
    const user = toPublicKey(params.user);
    const group = await this.resolveGroup(params.group);
    const [inputMintInfo, outputMintInfo] = await Promise.all([
      this.getMintMetadata(group.inputMint),
      this.getMintMetadata(group.outputMint),
    ]);

    const [inputVault] = deriveInputVaultAddress(group.address, this.programId);
    const [outputVault] = deriveOutputVaultAddress(group.address, this.programId);

    const userInputAta =
      params.userInputTokenAccount
        ? toPublicKey(params.userInputTokenAccount)
        : getAssociatedTokenAddressSync(group.inputMint, user, false, inputMintInfo.tokenProgram);

    const userOutputAta =
      params.userOutputTokenAccount
        ? toPublicKey(params.userOutputTokenAccount)
        : getAssociatedTokenAddressSync(group.outputMint, user, false, outputMintInfo.tokenProgram);

    const instruction = await (this.program.methods as any)
      .swapReverse(toAnchorBn(params.amountIn))
      .accounts({
        user,
        swapGroup: group.address,
        inputVault,
        outputVault,
        userInputAta,
        userOutputAta,
        inputMint: group.inputMint,
        outputMint: group.outputMint,
        inputTokenProgram: inputMintInfo.tokenProgram,
        outputTokenProgram: outputMintInfo.tokenProgram,
      })
      .instruction();

    return { instruction, params };
  }

  private async resolveGroup(group: GroupRef): Promise<SwapGroupAccountData> {
    if (isSwapGroupAccountData(group)) {
      return group;
    }

    if (isPublicKeyLike(group) || typeof group === "string") {
      const resolved = await this.getGroup(group);
      if (!resolved) {
        throw new Error(`swap group not found: ${toPublicKey(group).toBase58()}`);
      }
      return resolved;
    }

    const resolved = await this.getGroupById(group);
    if (!resolved) {
      throw new Error("swap group not found for groupId");
    }
    return resolved;
  }

  private async safeGetTokenAccountBalance(address: PublicKey): Promise<bigint | null> {
    try {
      const balance = await this.connection.getTokenAccountBalance(address, this.commitment);
      return BigInt(balance.value.amount);
    } catch {
      return null;
    }
  }
}

export { SwapGroupStatus };
