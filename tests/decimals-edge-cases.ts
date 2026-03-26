import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TokenSwapProgram } from "../target/types/token_swap_program";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

/**
 * 测试不同 decimals 组合的代币兑换
 * 
 * 关键测试场景：
 * 1. 高精度 → 低精度（9 decimals → 2 decimals，如 SOL → USDC）
 * 2. 低精度 → 高精度（2 decimals → 9 decimals）
 * 3. 相同精度（6 decimals → 6 decimals）
 * 4. 极端精度差异（0 decimals → 9 decimals）
 * 5. 精度损失和舍入问题
 * 6. 大数值兑换（接近 u64::MAX）
 * 7. 小数值兑换（1 lamport）
 * 8. 不同 rate_decimals 的影响
 */

describe("Decimals Edge Cases", () => {
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
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  /**
   * 场景 1: 高精度 → 低精度（9 decimals → 2 decimals）
   * 模拟: SOL (9) → USDC (2)
   * 测试点: 精度损失、舍入行为
   */
  describe("Scenario 1: High → Low Decimals (9 → 2)", () => {
    let inputMint: PublicKey;  // 9 decimals
    let outputMint: PublicKey; // 2 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      // Create mints with different decimals
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 9);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 2);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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

      // Create swap group: 1 SOL = 100 USDC (rate=100, rate_decimals=0)
      await program.methods
        .createGroup(Array.from(groupId), new BN(100), 0, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      // Deposit USDC to vault
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1_000_000_00); // 1M USDC

      await program.methods
        .deposit(new BN(1_000_000_00))
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

    it("should swap 1 SOL → 100 USDC correctly", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      // Mint 1 SOL to user
      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 1_000_000_000);

      await program.methods
        .swap(new BN(1_000_000_000)) // 1 SOL
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // Expected: 1 SOL * 100 = 100 USDC (10000 in raw units with 2 decimals)
      assert.equal(balance.toString(), "10000");
    });

    it("should handle fractional SOL amounts (0.5 SOL)", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      const beforeBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 500_000_000);

      await program.methods
        .swap(new BN(500_000_000)) // 0.5 SOL
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const received = afterBalance - beforeBalance;
      // Expected: 0.5 SOL * 100 = 50 USDC (5000 in raw units)
      assert.equal(received.toString(), "5000");
    });

    it("should handle precision loss correctly (0.001 SOL)", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      const beforeBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 1_000_000);

      await program.methods
        .swap(new BN(1_000_000)) // 0.001 SOL
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const received = afterBalance - beforeBalance;
      // Expected: 0.001 SOL * 100 = 0.1 USDC (10 in raw units)
      assert.equal(received.toString(), "10");
    });
  });

  /**
   * 场景 2: 低精度 → 高精度（2 decimals → 9 decimals）
   * 模拟: USDC (2) → SOL (9)
   * 测试点: 精度扩展、小数值放大
   */
  describe("Scenario 2: Low → High Decimals (2 → 9)", () => {
    let inputMint: PublicKey;  // 2 decimals
    let outputMint: PublicKey; // 9 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([2, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 2);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 9);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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

      // Create swap group: 100 USDC = 1 SOL (rate=1, rate_decimals=2)
      await program.methods
        .createGroup(Array.from(groupId), new BN(1), 2, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      // Deposit SOL to vault
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1000_000_000_000); // 1000 SOL

      await program.methods
        .deposit(new BN(1000_000_000_000))
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

    it("should swap 100 USDC → 1 SOL correctly", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 10000); // 100 USDC

      await program.methods
        .swap(new BN(10000)) // 100 USDC
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // Expected: 100 USDC * 1 / 100 = 1 SOL (1_000_000_000 lamports)
      assert.equal(balance.toString(), "1000000000");
    });

    it("should handle 1 USDC → 0.01 SOL", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      const beforeBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 100);

      await program.methods
        .swap(new BN(100)) // 1 USDC
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const received = afterBalance - beforeBalance;
      // Expected: 1 USDC * 1 / 100 = 0.01 SOL (10_000_000 lamports)
      assert.equal(received.toString(), "10000000");
    });
  });

  /**
   * 场景 3: 极端精度差异（0 decimals → 9 decimals）
   * 模拟: NFT (0) → Token (9)
   * 测试点: 最大精度差异、整数兑换
   */
  describe("Scenario 3: Zero → High Decimals (0 → 9)", () => {
    let inputMint: PublicKey;  // 0 decimals
    let outputMint: PublicKey; // 9 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 0);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 9);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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

      // Create swap group: 1 NFT = 1000 tokens (rate=1000, rate_decimals=0)
      await program.methods
        .createGroup(Array.from(groupId), new BN(1000), 0, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1_000_000_000_000_000);

      await program.methods
        .deposit(new BN(1_000_000_000_000_000))
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

    it("should swap 1 NFT → 1000 tokens", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 10); // 10 NFTs

      await program.methods
        .swap(new BN(1)) // 1 NFT
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // Expected: 1 NFT * 1000 = 1000 tokens (1000_000_000_000 in raw units)
      assert.equal(balance.toString(), "1000000000000");
    });
  });

  /**
   * 场景 4: 使用 rate_decimals 实现小数比例
   * 测试点: rate_decimals 的正确性、复杂比例计算
   */
  describe("Scenario 4: Fractional Rates with rate_decimals", () => {
    let inputMint: PublicKey;  // 6 decimals
    let outputMint: PublicKey; // 6 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([4, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 6);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 6);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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

      // Create swap group: rate = 1.5 (rate=15, rate_decimals=1)
      await program.methods
        .createGroup(Array.from(groupId), new BN(15), 1, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1_000_000_000_000);

      await program.methods
        .deposit(new BN(1_000_000_000_000))
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

    it("should swap with 1.5x rate correctly", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 10_000_000);

      await program.methods
        .swap(new BN(1_000_000)) // 1 token
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // Expected: 1 * 15 / 10 = 1.5 tokens (1_500_000 in raw units)
      assert.equal(balance.toString(), "1500000");
    });

    it("should handle complex rate: 0.123 (rate=123, rate_decimals=3)", async () => {
      // Update config to rate = 0.123
      await program.methods
        .updateConfig(new BN(123), 3, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
        })
        .signers([admin])
        .rpc();

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      const beforeBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;

      await program.methods
        .swap(new BN(1_000_000)) // 1 token
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const received = afterBalance - beforeBalance;
      // Expected: 1 * 123 / 1000 = 0.123 tokens (123_000 in raw units)
      assert.equal(received.toString(), "123000");
    });
  });

  /**
   * 场景 5: 精度损失和舍入测试
   * 测试点: 除法舍入、最小单位兑换
   */
  describe("Scenario 5: Precision Loss & Rounding", () => {
    let inputMint: PublicKey;  // 9 decimals
    let outputMint: PublicKey; // 2 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([5, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 9);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 2);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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

      // Create swap group: rate = 3 (odd number to test rounding)
      await program.methods
        .createGroup(Array.from(groupId), new BN(3), 0, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1_000_000_00);

      await program.methods
        .deposit(new BN(1_000_000_00))
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

    it("should handle 1 lamport swap (minimum unit)", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 1_000_000_000);

      await program.methods
        .swap(new BN(1)) // 1 lamport
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // Expected: 1 lamport * 3 / 10^7 = 0 (rounds down to 0)
      // This tests precision loss behavior
      console.log("1 lamport swap result:", balance.toString());
    });

    it("should handle odd division (1_000_000_000 / 3)", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      const beforeBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;

      await program.methods
        .swap(new BN(333_333_333)) // 0.333333333 tokens
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const received = afterBalance - beforeBalance;
      console.log("Odd division result:", received.toString());
      // Verify no overflow and result is reasonable
      assert.isTrue(received > BigInt(0));
    });
  });

  /**
   * 场景 6: 手续费与不同 decimals 的交互
   * 测试点: 手续费计算在不同精度下的正确性
   */
  describe("Scenario 6: Fees with Different Decimals", () => {
    let inputMint: PublicKey;  // 9 decimals
    let outputMint: PublicKey; // 6 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([6, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 9);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 6);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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

      // Create swap group: 1:1 rate with 5% fee (500 bps)
      await program.methods
        .createGroup(Array.from(groupId), new BN(1), 0, 500)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1_000_000_000_000);

      await program.methods
        .deposit(new BN(1_000_000_000_000))
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

    it("should apply 5% fee correctly with decimal conversion", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 10_000_000_000);

      await program.methods
        .swap(new BN(1_000_000_000)) // 1 token (9 decimals)
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // Expected: 1 token → 1 token (1_000_000 in 6 decimals)
      // After 5% fee: 1_000_000 * 0.95 = 950_000
      assert.equal(balance.toString(), "950000");
    });

    it("should handle small amount with fee (precision test)", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      const beforeBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;

      await program.methods
        .swap(new BN(10_000_000)) // 0.01 token
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const received = afterBalance - beforeBalance;
      // Expected: 0.01 token → 0.01 token (10_000 in 6 decimals)
      // After 5% fee: 10_000 * 0.95 = 9_500
      assert.equal(received.toString(), "9500");
    });
  });

  /**
   * 场景 7: 反向兑换的 decimals 测试
   * 测试点: swap_reverse 在不同精度下的正确性
   */
  describe("Scenario 7: Reverse Swap with Different Decimals", () => {
    let inputMint: PublicKey;  // 6 decimals
    let outputMint: PublicKey; // 9 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([7, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 6);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 9);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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

      // Create swap group: 1 USDC = 0.01 SOL (rate=1, rate_decimals=2)
      await program.methods
        .createGroup(Array.from(groupId), new BN(1), 2, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      // Seed both vaults so forward and reverse swaps can run independently.
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );

      await mintTo(provider.connection, payer.payer, inputMint, inputVaultPda, admin, 1_000_000_000_000);
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1_000_000_000_000_000);

      await program.methods
        .deposit(new BN(1_000_000_000_000_000))
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

    it("should reverse swap 0.01 SOL → 1 USDC", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      await mintTo(provider.connection, payer.payer, outputMint, userOutputAta.address, admin, 100_000_000_000);

      await program.methods
        .swapReverse(new BN(10_000_000)) // 0.01 SOL
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userInputAta.address)).amount;
      // Expected: 0.01 SOL * 100 = 1 USDC (1_000_000 in raw units)
      assert.equal(balance.toString(), "1000000");
    });

    it("should verify round-trip consistency", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, 1_000_000);

      const initialInputBalance = (await getAccount(provider.connection, userInputAta.address)).amount;
      const initialOutputBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;

      // Forward swap: USDC → SOL
      await program.methods
        .swap(new BN(1_000_000)) // 1 USDC
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterForwardOutputBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const solReceived = afterForwardOutputBalance - initialOutputBalance;

      // Reverse swap: SOL → USDC
      await program.methods
        .swapReverse(new BN(solReceived.toString()))
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const finalInputBalance = (await getAccount(provider.connection, userInputAta.address)).amount;
      
      // Should get back approximately the same amount (may have small rounding difference)
      const difference = initialInputBalance > finalInputBalance 
        ? initialInputBalance - finalInputBalance 
        : finalInputBalance - initialInputBalance;
      
      console.log("Round-trip difference:", difference.toString());
      // Allow small rounding error (< 0.01%)
      assert.isTrue(difference < BigInt(100));
    });
  });

  /**
   * 场景 8: 极端数值测试
   * 测试点: 大数值、溢出保护
   */
  describe("Scenario 8: Large Amount Swaps", () => {
    let inputMint: PublicKey;  // 6 decimals
    let outputMint: PublicKey; // 6 decimals
    let swapGroupPda: PublicKey;
    let inputVaultPda: PublicKey;
    let outputVaultPda: PublicKey;
    const groupId = Buffer.from([8, 0, 0, 0, 0, 0, 0, 0]);

    before(async () => {
      inputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 6);
      outputMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 6);

      [swapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), groupId],
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
        .createGroup(Array.from(groupId), new BN(1), 0, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );
      // Mint large amount
      await mintTo(provider.connection, payer.payer, outputMint, adminOutputAta.address, admin, 1_000_000_000_000_000);

      await program.methods
        .deposit(new BN(1_000_000_000_000_000))
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

    it("should handle large swap (1 billion tokens)", async () => {
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      const largeAmount = new BN(1_000_000_000_000_000); // 1 billion tokens
      await mintTo(provider.connection, payer.payer, inputMint, userInputAta.address, admin, largeAmount.toNumber());

      await program.methods
        .swap(largeAmount)
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
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      assert.equal(balance.toString(), largeAmount.toString());
    });
  });

  /**
   * 场景 9: 真实世界的代币对
   * 测试点: 模拟真实的代币兑换场景
   */
  describe("Scenario 9: Real-World Token Pairs", () => {
    describe("SOL/USDC (9/6 decimals)", () => {
      let solMint: PublicKey;
      let usdcMint: PublicKey;
      let swapGroupPda: PublicKey;
      let inputVaultPda: PublicKey;
      let outputVaultPda: PublicKey;
      const groupId = Buffer.from([9, 1, 0, 0, 0, 0, 0, 0]);

      before(async () => {
        solMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 9);
        usdcMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 6);

        [swapGroupPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("swap_group"), groupId],
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

        // 1 SOL = 150 USDC (rate=150, rate_decimals=0)
        await program.methods
          .createGroup(Array.from(groupId), new BN(150), 0, 30) // 0.3% fee
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            inputMint: solMint,
            outputMint: usdcMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc();

        const adminOutputAta = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          payer.payer,
          usdcMint,
          admin.publicKey
        );
        await mintTo(provider.connection, payer.payer, usdcMint, adminOutputAta.address, admin, 1_000_000_000_000);

        await program.methods
          .deposit(new BN(1_000_000_000_000))
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
            outputVault: outputVaultPda,
            adminOutputAta: adminOutputAta.address,
            outputMint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc();
      });

      it("should swap 1 SOL → 150 USDC with 0.3% fee", async () => {
        const userInputAta = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          payer.payer,
          solMint,
          user.publicKey
        );
        const userOutputAta = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          payer.payer,
          usdcMint,
          user.publicKey
        );

        await mintTo(provider.connection, payer.payer, solMint, userInputAta.address, admin, 10_000_000_000);

        await program.methods
          .swap(new BN(1_000_000_000)) // 1 SOL
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: solMint,
            outputMint: usdcMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
        // Expected: 1 SOL * 150 = 150 USDC (150_000_000 raw)
        // After 0.3% fee: 150_000_000 * 0.997 = 149_550_000
        assert.equal(balance.toString(), "149550000");
      });
    });

    describe("BTC/ETH (8/18 decimals)", () => {
      let btcMint: PublicKey;
      let ethMint: PublicKey;
      let swapGroupPda: PublicKey;
      let inputVaultPda: PublicKey;
      let outputVaultPda: PublicKey;
      const groupId = Buffer.from([9, 2, 0, 0, 0, 0, 0, 0]);

      before(async () => {
        btcMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 8);
        ethMint = await createMint(provider.connection, payer.payer, admin.publicKey, null, 18);

        [swapGroupPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("swap_group"), groupId],
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

        // 1 BTC = 15 ETH (rate=15, rate_decimals=0)
        await program.methods
          .createGroup(Array.from(groupId), new BN(15), 0, 0)
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            inputMint: btcMint,
            outputMint: ethMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc();

        const adminOutputAta = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          payer.payer,
          ethMint,
          admin.publicKey
        );
        // Keep the deposit within u64 while still covering the test swap.
        await mintTo(provider.connection, payer.payer, ethMint, adminOutputAta.address, admin, BigInt("10000000000000000000"));

        await program.methods
          .deposit(new BN("10000000000000000000"))
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
            outputVault: outputVaultPda,
            adminOutputAta: adminOutputAta.address,
            outputMint: ethMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc();
      });

      it("should swap 0.1 BTC → 1.5 ETH", async () => {
        const userInputAta = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          payer.payer,
          btcMint,
          user.publicKey
        );
        const userOutputAta = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          payer.payer,
          ethMint,
          user.publicKey
        );

        await mintTo(provider.connection, payer.payer, btcMint, userInputAta.address, admin, 100_000_000);

        await program.methods
          .swap(new BN(10_000_000)) // 0.1 BTC
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: btcMint,
            outputMint: ethMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
        // Expected: 0.1 BTC * 15 = 1.5 ETH (1.5 * 10^18)
        assert.equal(balance.toString(), "1500000000000000000");
      });
    });
  });
});
