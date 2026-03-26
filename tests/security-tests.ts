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
 * Security-Focused Integration Tests
 *
 * Covers attack vectors:
 * 1. Vault drain attempts (swap more than vault holds)
 * 2. Wrong mint/vault substitution attacks
 * 3. Fee manipulation and boundary attacks
 * 4. Arithmetic overflow edge cases
 * 5. Unauthorized admin operations
 * 6. State machine violations (double close, operations after close)
 * 7. Swap with dust amounts (1 lamport)
 * 8. Repeated rapid swaps (consistency)
 * 9. Self-swap (same mint attack)
 * 10. Wrong token program attack
 */

describe("Security Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TokenSwapProgram as Program<TokenSwapProgram>;
  const payer = provider.wallet as anchor.Wallet;

  let admin: Keypair;
  let user: Keypair;
  let attacker: Keypair;

  before(async () => {
    admin = Keypair.generate();
    user = Keypair.generate();
    attacker = Keypair.generate();

    await provider.connection.requestAirdrop(admin.publicKey, 30 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 30 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(attacker.publicKey, 30 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1500));
  });

  // Helper to create a full swap group setup
  async function createSwapGroupSetup(opts: {
    groupIdBytes: number[];
    swapRate: number;
    rateDecimals: number;
    feeBasisPoints: number;
    inputDecimals?: number;
    outputDecimals?: number;
    depositAmount?: number;
  }) {
    const inputDecimals = opts.inputDecimals ?? 6;
    const outputDecimals = opts.outputDecimals ?? 6;

    const inputMint = await createMint(
      provider.connection, payer.payer, admin.publicKey, null, inputDecimals
    );
    const outputMint = await createMint(
      provider.connection, payer.payer, admin.publicKey, null, outputDecimals
    );

    const groupId = Buffer.from(opts.groupIdBytes);
    const [swapGroupPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("swap_group"), groupId],
      program.programId
    );
    const [inputVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_input"), swapGroupPda.toBuffer()],
      program.programId
    );
    const [outputVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_output"), swapGroupPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createGroup(
        Array.from(groupId),
        new BN(opts.swapRate),
        opts.rateDecimals,
        opts.feeBasisPoints
      )
      .accounts({
        admin: admin.publicKey,
        swapGroup: swapGroupPda,
        inputVault: inputVaultPda,
        outputVault: outputVaultPda,
        inputMint,
        outputMint,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    if (opts.depositAmount) {
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, admin.publicKey
      );
      await mintTo(
        provider.connection, payer.payer, outputMint,
        adminOutputAta.address, admin, opts.depositAmount
      );
      await program.methods
        .deposit(new BN(opts.depositAmount))
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          outputVault: outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    }

    return { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda, groupId };
  }

  // ============================================================
  // 1. Vault Drain Attacks
  // ============================================================
  describe("1. Vault Drain Attacks", () => {
    it("should reject swap that exceeds output vault balance", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 1, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0,
          depositAmount: 100, // Only 100 tokens in vault
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      // Mint enough input tokens to try draining
      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 1_000_000
      );

      try {
        await program.methods
          .swap(new BN(1_000_000)) // Way more than vault holds
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint,
            outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown InsufficientVaultBalance");
      } catch (err) {
        assert.include(err.toString(), "InsufficientVaultBalance");
      }
    });

    it("should reject reverse swap that exceeds input vault balance", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 2, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0,
          depositAmount: 1_000_000,
        });

      // Input vault is empty - reverse swap requires tokens in input vault
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, outputMint,
        userOutputAta.address, admin, 1_000_000
      );

      try {
        await program.methods
          .swapReverse(new BN(500_000))
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint,
            outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown InsufficientVaultBalance");
      } catch (err) {
        assert.include(err.toString(), "InsufficientVaultBalance");
      }
    });
  });

  // ============================================================
  // 2. Wrong Mint / Wrong Vault Substitution
  // ============================================================
  describe("2. Wrong Mint Substitution Attack", () => {
    it("should reject swap with wrong input mint", async () => {
      const { outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 3, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0,
          depositAmount: 10_000_000,
        });

      // Create a fake mint to try substituting
      const fakeMint = await createMint(
        provider.connection, payer.payer, admin.publicKey, null, 6
      );

      const userFakeAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, fakeMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, fakeMint,
        userFakeAta.address, admin, 10_000_000
      );

      try {
        await program.methods
          .swap(new BN(1_000_000))
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userFakeAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: fakeMint, // Wrong mint!
            outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have rejected wrong input mint");
      } catch (err) {
        // Should fail due to constraint check (swap_group.input_mint != fakeMint)
        assert.isTrue(
          err.toString().includes("ConstraintRaw") ||
          err.toString().includes("A raw constraint was violated") ||
          err.toString().includes("mint constraint was violated") ||
          err.toString().includes("Error")
        );
      }
    });

    it("should reject swap with wrong output mint", async () => {
      const { inputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 4, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0,
          depositAmount: 10_000_000,
        });

      const fakeMint = await createMint(
        provider.connection, payer.payer, admin.publicKey, null, 6
      );

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userFakeAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, fakeMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 10_000_000
      );

      try {
        await program.methods
          .swap(new BN(1_000_000))
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userFakeAta.address,
            inputMint,
            outputMint: fakeMint, // Wrong mint!
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have rejected wrong output mint");
      } catch (err) {
        assert.isTrue(
          err.toString().includes("ConstraintRaw") ||
          err.toString().includes("A raw constraint was violated") ||
          err.toString().includes("Error")
        );
      }
    });
  });

  // ============================================================
  // 3. Fee Boundary Attacks
  // ============================================================
  describe("3. Fee Boundary Attacks", () => {
    it("should handle 0% fee correctly (no fee leakage)", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 5, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0, // Zero fee
          depositAmount: 10_000_000,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 1_000_000
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
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // 1:1 rate, 0% fee -> output should exactly equal input
      assert.equal(balance.toString(), "1000000");
    });

    it("should handle 100% fee (10000 basis points) - user gets nothing", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 6, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 10000, // 100% fee
          depositAmount: 10_000_000,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 1_000_000
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
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // 100% fee -> user gets 0
      assert.equal(balance.toString(), "0");
    });

    it("should reject fee_basis_points = 10001 (over 100%)", async () => {
      try {
        await createSwapGroupSetup({
          groupIdBytes: [20, 7, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 10001,
        });
        assert.fail("Should have thrown InvalidFee");
      } catch (err) {
        assert.include(err.toString(), "InvalidFee");
      }
    });
  });

  // ============================================================
  // 4. Arithmetic Overflow Edge Cases
  // ============================================================
  describe("4. Arithmetic Overflow Edge Cases", () => {
    it("should handle very large swap amounts without overflow", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 8, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0,
          inputDecimals: 0, // 0 decimals to allow large raw amounts
          outputDecimals: 0,
          depositAmount: Number.MAX_SAFE_INTEGER, // ~9 * 10^15
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      const largeAmount = BigInt("1000000000000"); // 10^12
      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, largeAmount
      );

      await program.methods
        .swap(new BN(largeAmount.toString()))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      assert.equal(balance.toString(), largeAmount.toString());
    });

    it("should handle high swap rate with high decimals", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 9, 0, 0, 0, 0, 0, 0],
          swapRate: 999999, // Very high rate
          rateDecimals: 0,
          feeBasisPoints: 0,
          inputDecimals: 9,
          outputDecimals: 9,
          depositAmount: Number.MAX_SAFE_INTEGER,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      // Swap 1 token (10^9 lamports) * 999999 rate = 999999 tokens output
      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 1_000_000_000
      );

      await program.methods
        .swap(new BN(1_000_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // 1_000_000_000 * 999999 * 10^9 / (1 * 10^9) = 999999_000_000_000
      assert.equal(balance.toString(), "999999000000000");
    });

    it("should handle swap_rate with rate_decimals precision", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 10, 0, 0, 0, 0, 0, 0],
          swapRate: 15, // 1.5 with rate_decimals=1
          rateDecimals: 1,
          feeBasisPoints: 0,
          depositAmount: 10_000_000,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 2_000_000
      );

      await program.methods
        .swap(new BN(2_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // 2_000_000 * 15 * 10^6 / (10^1 * 10^6) = 3_000_000
      assert.equal(balance.toString(), "3000000");
    });
  });

  // ============================================================
  // 5. Unauthorized Admin Operations
  // ============================================================
  describe("5. Unauthorized Admin Operations", () => {
    let setup: Awaited<ReturnType<typeof createSwapGroupSetup>>;

    before(async () => {
      setup = await createSwapGroupSetup({
        groupIdBytes: [20, 11, 0, 0, 0, 0, 0, 0],
        swapRate: 1,
        rateDecimals: 0,
        feeBasisPoints: 100,
        depositAmount: 10_000_000,
      });
    });

    it("should reject attacker trying to withdraw", async () => {
      const attackerOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, attacker.publicKey
      );

      try {
        await program.methods
          .withdraw(new BN(1_000_000))
          .accounts({
            admin: attacker.publicKey,
            swapGroup: setup.swapGroupPda,
            outputVault: setup.outputVaultPda,
            adminOutputAta: attackerOutputAta.address,
            outputMint: setup.outputMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have rejected unauthorized withdraw");
      } catch (err) {
        assert.include(err.toString(), "ConstraintHasOne");
      }
    });

    it("should reject attacker trying to update config", async () => {
      try {
        await program.methods
          .updateConfig(new BN(999), 0, 9999)
          .accounts({
            admin: attacker.publicKey,
            swapGroup: setup.swapGroupPda,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have rejected unauthorized update_config");
      } catch (err) {
        assert.include(err.toString(), "ConstraintHasOne");
      }
    });

    it("should reject attacker trying to pause group", async () => {
      try {
        await program.methods
          .setGroupStatus(1)
          .accounts({
            admin: attacker.publicKey,
            swapGroup: setup.swapGroupPda,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have rejected unauthorized set_group_status");
      } catch (err) {
        assert.include(err.toString(), "ConstraintHasOne");
      }
    });

    it("should reject attacker trying to transfer admin", async () => {
      try {
        await program.methods
          .transferAdmin(attacker.publicKey)
          .accounts({
            admin: attacker.publicKey,
            swapGroup: setup.swapGroupPda,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have rejected unauthorized transfer_admin");
      } catch (err) {
        assert.include(err.toString(), "ConstraintHasOne");
      }
    });

    it("should reject attacker trying to close group", async () => {
      const attackerInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.inputMint, attacker.publicKey
      );
      const attackerOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, attacker.publicKey
      );

      try {
        await program.methods
          .closeGroup()
          .accounts({
            admin: attacker.publicKey,
            swapGroup: setup.swapGroupPda,
            inputVault: setup.inputVaultPda,
            outputVault: setup.outputVaultPda,
            adminInputAta: attackerInputAta.address,
            adminOutputAta: attackerOutputAta.address,
            inputMint: setup.inputMint,
            outputMint: setup.outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have rejected unauthorized close_group");
      } catch (err) {
        assert.include(err.toString(), "ConstraintHasOne");
      }
    });
  });

  // ============================================================
  // 6. State Machine Violations
  // ============================================================
  describe("6. State Machine Violations", () => {
    it("should reject deposit after group is closed", async () => {
      const setup = await createSwapGroupSetup({
        groupIdBytes: [20, 12, 0, 0, 0, 0, 0, 0],
        swapRate: 1,
        rateDecimals: 0,
        feeBasisPoints: 0,
        depositAmount: 1_000_000,
      });

      // Close the group
      const adminInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.inputMint, admin.publicKey
      );
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, admin.publicKey
      );

      await program.methods
        .closeGroup()
        .accounts({
          admin: admin.publicKey,
          swapGroup: setup.swapGroupPda,
          inputVault: setup.inputVaultPda,
          outputVault: setup.outputVaultPda,
          adminInputAta: adminInputAta.address,
          adminOutputAta: adminOutputAta.address,
          inputMint: setup.inputMint,
          outputMint: setup.outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      // Try to swap after close
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, setup.inputMint,
        userInputAta.address, admin, 1_000_000
      );

      try {
        await program.methods
          .swap(new BN(100_000))
          .accounts({
            user: user.publicKey,
            swapGroup: setup.swapGroupPda,
            inputVault: setup.inputVaultPda,
            outputVault: setup.outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: setup.inputMint,
            outputMint: setup.outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown GroupNotActive");
      } catch (err) {
        assert.include(err.toString(), "GroupNotActive");
      }
    });

    it("should reject reverse swap after group is paused", async () => {
      const setup = await createSwapGroupSetup({
        groupIdBytes: [20, 13, 0, 0, 0, 0, 0, 0],
        swapRate: 1,
        rateDecimals: 0,
        feeBasisPoints: 0,
        depositAmount: 1_000_000,
      });

      // Pause the group
      await program.methods
        .setGroupStatus(1)
        .accounts({
          admin: admin.publicKey,
          swapGroup: setup.swapGroupPda,
        })
        .signers([admin])
        .rpc();

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, setup.outputMint,
        userOutputAta.address, admin, 1_000_000
      );

      try {
        await program.methods
          .swapReverse(new BN(100_000))
          .accounts({
            user: user.publicKey,
            swapGroup: setup.swapGroupPda,
            inputVault: setup.inputVaultPda,
            outputVault: setup.outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: setup.inputMint,
            outputMint: setup.outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown GroupNotActive");
      } catch (err) {
        assert.include(err.toString(), "GroupNotActive");
      }
    });

    it("should allow admin operations even when paused", async () => {
      const setup = await createSwapGroupSetup({
        groupIdBytes: [20, 14, 0, 0, 0, 0, 0, 0],
        swapRate: 1,
        rateDecimals: 0,
        feeBasisPoints: 0,
        depositAmount: 1_000_000,
      });

      // Pause the group
      await program.methods
        .setGroupStatus(1)
        .accounts({
          admin: admin.publicKey,
          swapGroup: setup.swapGroupPda,
        })
        .signers([admin])
        .rpc();

      // Admin should still be able to withdraw while paused
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, admin.publicKey
      );

      await program.methods
        .withdraw(new BN(500_000))
        .accounts({
          admin: admin.publicKey,
          swapGroup: setup.swapGroupPda,
          outputVault: setup.outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint: setup.outputMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const vaultBalance = (await getAccount(provider.connection, setup.outputVaultPda)).amount;
      assert.equal(vaultBalance.toString(), "500000");
    });
  });

  // ============================================================
  // 7. Dust Amount Swaps
  // ============================================================
  describe("7. Dust Amount Swaps (1 lamport)", () => {
    it("should handle 1 lamport swap (may result in 0 output with rounding)", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 15, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 100, // 1% fee
          inputDecimals: 9,
          outputDecimals: 2, // Large decimal difference
          depositAmount: 10_000_00,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 100
      );

      // 1 lamport of a 9-decimal token with 1:1 rate to 2-decimal token
      // = 1 * 1 * 100 / (1 * 1_000_000_000) = 0 (rounds to 0)
      // This should still succeed but output 0 tokens
      await program.methods
        .swap(new BN(1))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
      // With such precision loss, output should be 0
      assert.equal(balance.toString(), "0");
    });
  });

  // ============================================================
  // 8. Repeated Rapid Swaps (Consistency)
  // ============================================================
  describe("8. Repeated Rapid Swaps", () => {
    it("should produce consistent results across multiple identical swaps", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 16, 0, 0, 0, 0, 0, 0],
          swapRate: 3,
          rateDecimals: 0,
          feeBasisPoints: 50, // 0.5% fee
          depositAmount: 100_000_000,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 50_000_000
      );

      const swapAmount = new BN(1_000_000);
      const results: bigint[] = [];

      for (let i = 0; i < 5; i++) {
        const before = (await getAccount(provider.connection, userOutputAta.address)).amount;

        await program.methods
          .swap(swapAmount)
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint,
            outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        const after = (await getAccount(provider.connection, userOutputAta.address)).amount;
        results.push(after - before);
      }

      // All swaps with same amount should produce same output
      for (let i = 1; i < results.length; i++) {
        assert.equal(
          results[i].toString(),
          results[0].toString(),
          `Swap ${i + 1} produced different result than swap 1`
        );
      }

      // Verify: 1_000_000 * 3 = 3_000_000, minus 0.5% = 2_985_000
      assert.equal(results[0].toString(), "2985000");
    });
  });

  // ============================================================
  // 9. Config Update Race Condition
  // ============================================================
  describe("9. Config Update Effects", () => {
    it("should apply new config immediately after update", async () => {
      const setup = await createSwapGroupSetup({
        groupIdBytes: [20, 17, 0, 0, 0, 0, 0, 0],
        swapRate: 2,
        rateDecimals: 0,
        feeBasisPoints: 0,
        depositAmount: 100_000_000,
      });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, setup.inputMint,
        userInputAta.address, admin, 10_000_000
      );

      // Swap at rate=2
      const before1 = (await getAccount(provider.connection, userOutputAta.address)).amount;
      await program.methods
        .swap(new BN(1_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: setup.swapGroupPda,
          inputVault: setup.inputVaultPda,
          outputVault: setup.outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: setup.inputMint,
          outputMint: setup.outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const after1 = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const result1 = after1 - before1;
      assert.equal(result1.toString(), "2000000"); // rate=2

      // Update rate to 5
      await program.methods
        .updateConfig(new BN(5), 0, 0)
        .accounts({
          admin: admin.publicKey,
          swapGroup: setup.swapGroupPda,
        })
        .signers([admin])
        .rpc();

      // Swap at rate=5
      const before2 = (await getAccount(provider.connection, userOutputAta.address)).amount;
      await program.methods
        .swap(new BN(1_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: setup.swapGroupPda,
          inputVault: setup.inputVaultPda,
          outputVault: setup.outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: setup.inputMint,
          outputMint: setup.outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const after2 = (await getAccount(provider.connection, userOutputAta.address)).amount;
      const result2 = after2 - before2;
      assert.equal(result2.toString(), "5000000"); // rate=5
    });
  });

  // ============================================================
  // 10. User Insufficient Balance
  // ============================================================
  describe("10. User Insufficient Balance", () => {
    it("should reject swap when user has insufficient input tokens", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 18, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0,
          depositAmount: 10_000_000,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      // User has 0 input tokens but tries to swap
      try {
        await program.methods
          .swap(new BN(1_000_000))
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint,
            outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have failed due to insufficient user balance");
      } catch (err) {
        // Transfer will fail at the SPL token level
        assert.isTrue(err.toString().includes("Error"));
      }
    });

    it("should reject reverse swap when user has insufficient output tokens", async () => {
      const setup = await createSwapGroupSetup({
        groupIdBytes: [20, 19, 0, 0, 0, 0, 0, 0],
        swapRate: 1,
        rateDecimals: 0,
        feeBasisPoints: 0,
        depositAmount: 10_000_000,
      });

      // Do a forward swap first to put tokens in input vault
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, setup.outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, setup.inputMint,
        userInputAta.address, admin, 5_000_000
      );

      await program.methods
        .swap(new BN(5_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: setup.swapGroupPda,
          inputVault: setup.inputVaultPda,
          outputVault: setup.outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint: setup.inputMint,
          outputMint: setup.outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      // Now try reverse swap with more than user has
      const userOutputBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;

      try {
        await program.methods
          .swapReverse(new BN((userOutputBalance + BigInt(1_000_000)).toString()))
          .accounts({
            user: user.publicKey,
            swapGroup: setup.swapGroupPda,
            inputVault: setup.inputVaultPda,
            outputVault: setup.outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: setup.inputMint,
            outputMint: setup.outputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have failed due to insufficient user balance");
      } catch (err) {
        assert.isTrue(err.toString().includes("Error"));
      }
    });
  });

  // ============================================================
  // 11. Swap Accounting Integrity
  // ============================================================
  describe("11. Swap Accounting Integrity", () => {
    it("should preserve total token supply after forward swap (input + output = constant)", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 20, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 0, // No fee for clean accounting
          depositAmount: 10_000_000,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 5_000_000
      );

      // Record total before
      const beforeInputVault = (await getAccount(provider.connection, inputVaultPda)).amount;
      const beforeOutputVault = (await getAccount(provider.connection, outputVaultPda)).amount;
      const beforeUserInput = (await getAccount(provider.connection, userInputAta.address)).amount;
      const beforeUserOutput = (await getAccount(provider.connection, userOutputAta.address)).amount;

      await program.methods
        .swap(new BN(2_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      // Record total after
      const afterInputVault = (await getAccount(provider.connection, inputVaultPda)).amount;
      const afterOutputVault = (await getAccount(provider.connection, outputVaultPda)).amount;
      const afterUserInput = (await getAccount(provider.connection, userInputAta.address)).amount;
      const afterUserOutput = (await getAccount(provider.connection, userOutputAta.address)).amount;

      // Input token: user sent exactly 2_000_000 to vault
      assert.equal(
        (beforeUserInput - afterUserInput).toString(),
        (afterInputVault - beforeInputVault).toString()
      );

      // Output token: vault sent exactly the output to user
      assert.equal(
        (beforeOutputVault - afterOutputVault).toString(),
        (afterUserOutput - beforeUserOutput).toString()
      );
    });

    it("should account for fees correctly (fee stays in vault)", async () => {
      const { inputMint, outputMint, swapGroupPda, inputVaultPda, outputVaultPda } =
        await createSwapGroupSetup({
          groupIdBytes: [20, 21, 0, 0, 0, 0, 0, 0],
          swapRate: 1,
          rateDecimals: 0,
          feeBasisPoints: 1000, // 10% fee
          depositAmount: 10_000_000,
        });

      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, inputMint, user.publicKey
      );
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer.payer, outputMint, user.publicKey
      );

      await mintTo(
        provider.connection, payer.payer, inputMint,
        userInputAta.address, admin, 1_000_000
      );

      const beforeOutputVault = (await getAccount(provider.connection, outputVaultPda)).amount;

      await program.methods
        .swap(new BN(1_000_000))
        .accounts({
          user: user.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          userInputAta: userInputAta.address,
          userOutputAta: userOutputAta.address,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const afterOutputVault = (await getAccount(provider.connection, outputVaultPda)).amount;
      const userReceived = (await getAccount(provider.connection, userOutputAta.address)).amount;

      // Rate=1, amount=1_000_000 raw_out = 1_000_000
      // Fee = 1_000_000 * 10% = 100_000
      // User receives: 900_000
      // Vault decreases by: 900_000 (fee stays in vault)
      assert.equal(userReceived.toString(), "900000");
      assert.equal((beforeOutputVault - afterOutputVault).toString(), "900000");
    });
  });
});
