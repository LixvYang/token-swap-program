import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TokenSwapProgram } from "../target/types/token_swap_program";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

/**
 * Token <-> Token-2022 Cross-Program Swap Tests
 *
 * Tests all combinations:
 * 1. Token (input) <-> Token-2022 (output) - forward & reverse swap
 * 2. Token-2022 (input) <-> Token (output) - forward & reverse swap
 * 3. Token-2022 (input) <-> Token-2022 (output) - both Token-2022
 * 4. Full lifecycle with cross-program tokens (create, deposit, swap, close)
 */

describe("Token <-> Token-2022 Cross-Program Swaps", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TokenSwapProgram as Program<TokenSwapProgram>;
  const payer = provider.wallet as anchor.Wallet;

  let admin: Keypair;
  let user: Keypair;

  before(async () => {
    admin = Keypair.generate();
    user = Keypair.generate();

    await provider.connection.requestAirdrop(admin.publicKey, 20 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 20 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1500));
  });

  // ============================================================
  // Scenario 1: Token (input) -> Token-2022 (output)
  // ============================================================
  describe("Scenario 1: Token input -> Token-2022 output", () => {
    let inputMint: PublicKey;   // Standard Token
    let outputMint: PublicKey;  // Token-2022
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([10, 1, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      // Create standard Token mint
      inputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        6,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Create Token-2022 mint
      outputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), admin.publicKey.toBuffer(), groupId],
        program.programId
      );
      [inputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_input"), swapGroupPda.toBuffer()],
        program.programId
      );
      [outputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_output"), swapGroupPda.toBuffer()],
        program.programId
      );

      // Create group with dual token programs
      await program.methods
        .createGroup(Array.from(groupId), new BN(2), 0, 100) // 2:1 rate, 1% fee
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      // Deposit Token-2022 output tokens
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await mintTo(
        provider.connection,
        payer.payer,
        outputMint,
        adminOutputAta.address,
        admin,
        100_000_000,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .deposit(new BN(50_000_000))
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          outputVault: outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint: outputMint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    });

    it("should create group with correct mints", async () => {
      const group = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(group.inputMint.toString(), inputMint.toString());
      assert.equal(group.outputMint.toString(), outputMint.toString());
      assert.equal(group.status, 0); // ACTIVE
    });

    it("should forward swap: Token -> Token-2022", async () => {
      // Create user ATAs for both token standards
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      // Mint standard tokens to user
      await mintTo(
        provider.connection,
        payer.payer,
        inputMint,
        userInputAta.address,
        admin,
        10_000_000,
        [],
        undefined,
        TOKEN_PROGRAM_ID
      );

      const amountIn = new BN(1_000_000);

      await program.methods
        .swap(amountIn)
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      // Expected: 1_000_000 * 2 = 2_000_000, minus 1% fee = 1_980_000
      const balance = (await getAccount(provider.connection, userOutputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;
      assert.equal(balance.toString(), "1980000");
    });

    it("should reverse swap: Token-2022 -> Token", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const beforeInputBalance = (await getAccount(provider.connection, userInputAta.address, undefined, TOKEN_PROGRAM_ID)).amount;
      const amountIn = new BN(500_000);

      await program.methods
        .swapReverse(amountIn)
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterInputBalance = (await getAccount(provider.connection, userInputAta.address, undefined, TOKEN_PROGRAM_ID)).amount;
      assert.isTrue(afterInputBalance > beforeInputBalance);
    });

    it("should close group and refund cross-program tokens", async () => {
      const adminInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        admin.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const beforeInputBalance = (await getAccount(provider.connection, adminInputAta.address, undefined, TOKEN_PROGRAM_ID)).amount;
      const beforeOutputBalance = (await getAccount(provider.connection, adminOutputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;

      await program.methods
        .closeGroup()
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          adminInputAta: adminInputAta.address,
          adminOutputAta: adminOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const group = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(group.status, 2); // CLOSED

      const afterInputBalance = (await getAccount(provider.connection, adminInputAta.address, undefined, TOKEN_PROGRAM_ID)).amount;
      const afterOutputBalance = (await getAccount(provider.connection, adminOutputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;

      // Input vault should have been refunded (had tokens from swaps)
      assert.isTrue(afterInputBalance >= beforeInputBalance);
      assert.isTrue(afterOutputBalance >= beforeOutputBalance);
    });
  });

  // ============================================================
  // Scenario 2: Token-2022 (input) -> Token (output)
  // ============================================================
  describe("Scenario 2: Token-2022 input -> Token output", () => {
    let inputMint: PublicKey;   // Token-2022
    let outputMint: PublicKey;  // Standard Token
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([10, 2, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      // Create Token-2022 mint (input)
      inputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        9, // 9 decimals like SOL
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      // Create standard Token mint (output)
      outputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        6, // 6 decimals like USDC
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), admin.publicKey.toBuffer(), groupId],
        program.programId
      );
      [inputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_input"), swapGroupPda.toBuffer()],
        program.programId
      );
      [outputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_output"), swapGroupPda.toBuffer()],
        program.programId
      );

      await program.methods
        .createGroup(Array.from(groupId), new BN(150), 0, 50) // 150:1 rate, 0.5% fee
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      // Deposit standard Token output tokens
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      await mintTo(
        provider.connection,
        payer.payer,
        outputMint,
        adminOutputAta.address,
        admin,
        1_000_000_000, // 1000 USDC
        [],
        undefined,
        TOKEN_PROGRAM_ID
      );

      await program.methods
        .deposit(new BN(500_000_000))
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          outputVault: outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint: outputMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    });

    it("should forward swap: Token-2022 -> Token", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Mint Token-2022 tokens to user (1 token = 1_000_000_000 lamports with 9 decimals)
      await mintTo(
        provider.connection,
        payer.payer,
        inputMint,
        userInputAta.address,
        admin,
        1_000_000_000, // 1 token
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const beforeOutputBalance = (await getAccount(provider.connection, userOutputAta.address, undefined, TOKEN_PROGRAM_ID)).amount;

      await program.methods
        .swap(new BN(1_000_000_000)) // 1 token
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterOutputBalance = (await getAccount(provider.connection, userOutputAta.address, undefined, TOKEN_PROGRAM_ID)).amount;
      const received = afterOutputBalance - beforeOutputBalance;

      // 1 token (9 decimals) * 150 rate / 1 rate_scale * (6 output decimals / 9 input decimals)
      // = 1_000_000_000 * 150 * 1_000_000 / (1 * 1_000_000_000) = 150_000_000
      // minus 0.5% fee = 150_000_000 - 750_000 = 149_250_000
      assert.equal(received.toString(), "149250000");
    });

    it("should reverse swap: Token -> Token-2022", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const beforeInputBalance = (await getAccount(provider.connection, userInputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;

      await program.methods
        .swapReverse(new BN(10_000_000)) // 10 USDC
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterInputBalance = (await getAccount(provider.connection, userInputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;
      assert.isTrue(afterInputBalance > beforeInputBalance);
    });
  });

  // ============================================================
  // Scenario 3: Token-2022 (input) -> Token-2022 (output)
  // ============================================================
  describe("Scenario 3: Token-2022 input -> Token-2022 output (both Token-2022)", () => {
    let inputMint: PublicKey;
    let outputMint: PublicKey;
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([10, 3, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      outputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), admin.publicKey.toBuffer(), groupId],
        program.programId
      );
      [inputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_input"), swapGroupPda.toBuffer()],
        program.programId
      );
      [outputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_output"), swapGroupPda.toBuffer()],
        program.programId
      );

      await program.methods
        .createGroup(Array.from(groupId), new BN(1), 0, 0) // 1:1, no fee
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await mintTo(
        provider.connection,
        payer.payer,
        outputMint,
        adminOutputAta.address,
        admin,
        100_000_000,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .deposit(new BN(50_000_000))
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          outputVault: outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint: outputMint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    });

    it("should swap Token-2022 -> Token-2022 (same program)", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await mintTo(
        provider.connection,
        payer.payer,
        inputMint,
        userInputAta.address,
        admin,
        10_000_000,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .swap(new BN(1_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      // 1:1 rate, no fee -> output should equal input
      const balance = (await getAccount(provider.connection, userOutputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;
      assert.equal(balance.toString(), "1000000");
    });

    it("should round-trip swap with Token-2022", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const beforeBalance = (await getAccount(provider.connection, userInputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;

      // Forward swap
      await program.methods
        .swap(new BN(1_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const intermediateBalance = (await getAccount(provider.connection, userOutputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;

      // Reverse swap with all output tokens
      await program.methods
        .swapReverse(new BN(intermediateBalance.toString()))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterBalance = (await getAccount(provider.connection, userInputAta.address, undefined, TOKEN_2022_PROGRAM_ID)).amount;

      // 1:1 rate, no fee -> should get back exactly what we swapped
      assert.equal(afterBalance.toString(), beforeBalance.toString());
    });
  });

  // ============================================================
  // Scenario 4: Different decimals with cross-program
  // ============================================================
  describe("Scenario 4: Cross-program with different decimals (9 -> 2)", () => {
    let inputMint: PublicKey;   // Token-2022, 9 decimals
    let outputMint: PublicKey;  // Standard Token, 2 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([10, 4, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        9,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      outputMint = await createMint(
        provider.connection,
        payer.payer,
        admin.publicKey,
        null,
        2,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), admin.publicKey.toBuffer(), groupId],
        program.programId
      );
      [inputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_input"), swapGroupPda.toBuffer()],
        program.programId
      );
      [outputVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_output"), swapGroupPda.toBuffer()],
        program.programId
      );

      // 1 token-2022 = 100 standard token (simulating SOL -> USDC)
      await program.methods
        .createGroup(Array.from(groupId), new BN(100), 0, 100) // rate=100, 1% fee
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      await mintTo(
        provider.connection,
        payer.payer,
        outputMint,
        adminOutputAta.address,
        admin,
        100_000_00, // 100,000 units (2 decimals)
        [],
        undefined,
        TOKEN_PROGRAM_ID
      );

      await program.methods
        .deposit(new BN(100_000_00))
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          outputVault: outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint: outputMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    });

    it("should handle decimal conversion across programs correctly", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Mint 1 token (9 decimals) to user
      await mintTo(
        provider.connection,
        payer.payer,
        inputMint,
        userInputAta.address,
        admin,
        1_000_000_000,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .swap(new BN(1_000_000_000)) // 1 token
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_2022_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address, undefined, TOKEN_PROGRAM_ID)).amount;
      // 1_000_000_000 * 100 * 100 / (1 * 1_000_000_000) = 10000 raw units
      // minus 1% fee = 10000 - 100 = 9900
      assert.equal(balance.toString(), "9900");
    });
  });
});
