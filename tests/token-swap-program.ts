import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TokenSwapProgram } from "../target/types/token_swap_program";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("token-swap-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TokenSwapProgram as Program<TokenSwapProgram>;
  const payer = provider.wallet as anchor.Wallet;

  // Test accounts
  let admin: Keypair;
  let user: Keypair;
  let inputMint: PublicKey;
  let outputMint: PublicKey;
  let swapGroupPda: PublicKey;
  let inputVaultPda: PublicKey;
  let outputVaultPda: PublicKey;
  const groupId = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

  // Swap configuration
  const swapRate = new BN(2); // 2:1 ratio
  const rateDecimals = 0;
  const feeBasisPoints = 100; // 1% fee

  before(async () => {
    admin = Keypair.generate();
    user = Keypair.generate();

    // Airdrop SOL to admin and user
    await provider.connection.requestAirdrop(admin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create mints
    inputMint = await createMint(
      provider.connection,
      payer.payer,
      admin.publicKey,
      null,
      6
    );

    outputMint = await createMint(
      provider.connection,
      payer.payer,
      admin.publicKey,
      null,
      6
    );

    // Derive PDAs
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
  });

  describe("1. create_group", () => {
    it("should create a swap group successfully", async () => {
      const tx = await program.methods
        .createGroup(
          Array.from(groupId),
          swapRate,
          rateDecimals,
          feeBasisPoints
        )
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          inputVault: inputVaultPda,
          outputVault: outputVaultPda,
          inputMint: inputMint,
          outputMint: outputMint,
        })
        .signers([admin])
        .rpc();

      console.log("create_group tx:", tx);

      // Verify swap group was created
      const swapGroup = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(swapGroup.admin.toString(), admin.publicKey.toString());
      assert.equal(swapGroup.swapRate.toString(), swapRate.toString());
      assert.equal(swapGroup.status, 0); // STATUS_ACTIVE
    });

    it("should reject zero swap_rate", async () => {
      const badGroupId = Buffer.from([9, 9, 9, 9, 9, 9, 9, 9]);
      const [badSwapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), admin.publicKey.toBuffer(), badGroupId],
        program.programId
      );
      const [badInputVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_input"), badSwapGroupPda.toBuffer()],
        program.programId
      );
      const [badOutputVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_output"), badSwapGroupPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createGroup(Array.from(badGroupId), new BN(0), 0, 100)
          .accounts({
            admin: admin.publicKey,
            swapGroup: badSwapGroupPda,
            inputVault: badInputVault,
            outputVault: badOutputVault,
            inputMint: inputMint,
            outputMint: outputMint,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown InvalidSwapRate error");
      } catch (err) {
        assert.include(err.toString(), "InvalidSwapRate");
      }
    });

    it("should reject fee > 10000", async () => {
      const badGroupId = Buffer.from([8, 8, 8, 8, 8, 8, 8, 8]);
      const [badSwapGroupPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swap_group"), admin.publicKey.toBuffer(), badGroupId],
        program.programId
      );
      const [badInputVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_input"), badSwapGroupPda.toBuffer()],
        program.programId
      );
      const [badOutputVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_output"), badSwapGroupPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createGroup(Array.from(badGroupId), new BN(1), 0, 10001)
          .accounts({
            admin: admin.publicKey,
            swapGroup: badSwapGroupPda,
            inputVault: badInputVault,
            outputVault: badOutputVault,
            inputMint: inputMint,
            outputMint: outputMint,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown InvalidFee error");
      } catch (err) {
        assert.include(err.toString(), "InvalidFee");
      }
    });
  });

  describe("2. deposit", () => {
    it("should allow admin to deposit tokens to vault", async () => {
      // Mint tokens to admin
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );

      await mintTo(
        provider.connection,
        payer.payer,
        outputMint,
        adminOutputAta.address,
        admin,
        10_000_000
      );

      const depositAmount = new BN(5_000_000);

      const tx = await program.methods
        .deposit(depositAmount)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          outputVault: outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint: outputMint,
        })
        .signers([admin])
        .rpc();

      console.log("deposit tx:", tx);

      // Verify vault balance
      const vaultAccount = await getAccount(provider.connection, outputVaultPda);
      assert.equal(vaultAccount.amount.toString(), depositAmount.toString());
    });

    it("should reject deposit from non-admin", async () => {
      const userOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        user.publicKey
      );

      try {
        await program.methods
          .deposit(new BN(1000))
          .accounts({
            admin: user.publicKey,
            swapGroup: swapGroupPda,
            outputVault: outputVaultPda,
            adminOutputAta: userOutputAta.address,
            outputMint: outputMint,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown Unauthorized error");
      } catch (err) {
        assert.include(err.toString(), "ConstraintHasOne");
      }
    });
  });

  describe("3. swap (forward)", () => {
    before(async () => {
      // Mint input tokens to user
      const userInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        user.publicKey
      );

      await mintTo(
        provider.connection,
        payer.payer,
        inputMint,
        userInputAta.address,
        admin,
        10_000_000
      );
    });

    it("should swap InputToken for OutputToken", async () => {
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

      const amountIn = new BN(1_000_000);

      const tx = await program.methods
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
        })
        .signers([user])
        .rpc();

      console.log("swap tx:", tx);

      // Verify balances
      const userOutputAccount = await getAccount(provider.connection, userOutputAta.address);
      // Expected: 1_000_000 * 2 = 2_000_000, minus 1% fee = 1_980_000
      assert.equal(userOutputAccount.amount.toString(), "1980000");
    });

    it("should reject swap with amount_in = 0", async () => {
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

      try {
        await program.methods
          .swap(new BN(0))
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: inputMint,
            outputMint: outputMint,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown InvalidAmount error");
      } catch (err) {
        assert.include(err.toString(), "InvalidAmount");
      }
    });
  });

  describe("4. swap_reverse", () => {
    it("should swap OutputToken for InputToken", async () => {
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

      const beforeInputBalance = (await getAccount(provider.connection, userInputAta.address)).amount;
      const amountIn = new BN(1_000_000);

      const tx = await program.methods
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
        })
        .signers([user])
        .rpc();

      console.log("swap_reverse tx:", tx);

      // Verify input token increased
      const afterInputBalance = (await getAccount(provider.connection, userInputAta.address)).amount;
      assert.isTrue(afterInputBalance > beforeInputBalance);
    });
  });

  describe("5. set_group_status", () => {
    it("should pause the swap group", async () => {
      const STATUS_PAUSED = 1;

      const tx = await program.methods
        .setGroupStatus(STATUS_PAUSED)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
        })
        .signers([admin])
        .rpc();

      console.log("set_group_status (pause) tx:", tx);

      const swapGroup = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(swapGroup.status, STATUS_PAUSED);
    });

    it("should reject swap when paused", async () => {
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

      try {
        await program.methods
          .swap(new BN(100_000))
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: inputMint,
            outputMint: outputMint,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown GroupNotActive error");
      } catch (err) {
        assert.include(err.toString(), "GroupNotActive");
      }
    });

    it("should resume the swap group", async () => {
      const STATUS_ACTIVE = 0;

      const tx = await program.methods
        .setGroupStatus(STATUS_ACTIVE)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
        })
        .signers([admin])
        .rpc();

      console.log("set_group_status (resume) tx:", tx);

      const swapGroup = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(swapGroup.status, STATUS_ACTIVE);
    });

    it("should reject invalid status value", async () => {
      const INVALID_STATUS = 99;

      try {
        await program.methods
          .setGroupStatus(INVALID_STATUS)
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown InvalidStatus error");
      } catch (err) {
        assert.include(err.toString(), "InvalidStatus");
      }
    });
  });

  describe("6. withdraw", () => {
    it("should allow admin to withdraw tokens from vault", async () => {
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );

      const beforeBalance = (await getAccount(provider.connection, adminOutputAta.address)).amount;
      const withdrawAmount = new BN(1_000_000);

      const tx = await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
          outputVault: outputVaultPda,
          adminOutputAta: adminOutputAta.address,
          outputMint: outputMint,
        })
        .signers([admin])
        .rpc();

      console.log("withdraw tx:", tx);

      const afterBalance = (await getAccount(provider.connection, adminOutputAta.address)).amount;
      assert.equal((afterBalance - beforeBalance).toString(), withdrawAmount.toString());
    });

    it("should reject withdraw exceeding vault balance", async () => {
      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );

      try {
        await program.methods
          .withdraw(new BN(100_000_000))
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
            outputVault: outputVaultPda,
            adminOutputAta: adminOutputAta.address,
            outputMint: outputMint,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown InsufficientVaultBalance error");
      } catch (err) {
        assert.include(err.toString(), "InsufficientVaultBalance");
      }
    });
  });

  describe("7. update_config", () => {
    it("should update swap rate and fee", async () => {
      const newSwapRate = new BN(3);
      const newRateDecimals = 0;
      const newFeeBasisPoints = 200; // 2%

      const tx = await program.methods
        .updateConfig(newSwapRate, newRateDecimals, newFeeBasisPoints)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
        })
        .signers([admin])
        .rpc();

      console.log("update_config tx:", tx);

      const swapGroup = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(swapGroup.swapRate.toString(), newSwapRate.toString());
      assert.equal(swapGroup.feeBasisPoints, newFeeBasisPoints);
    });

    it("should reject zero swap_rate", async () => {
      try {
        await program.methods
          .updateConfig(new BN(0), 0, 100)
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown InvalidSwapRate error");
      } catch (err) {
        assert.include(err.toString(), "InvalidSwapRate");
      }
    });

    it("should reject fee > 10000", async () => {
      try {
        await program.methods
          .updateConfig(new BN(1), 0, 10001)
          .accounts({
            admin: admin.publicKey,
            swapGroup: swapGroupPda,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown InvalidFee error");
      } catch (err) {
        assert.include(err.toString(), "InvalidFee");
      }
    });
  });

  describe("8. transfer_admin", () => {
    let newAdmin: Keypair;

    before(() => {
      newAdmin = Keypair.generate();
    });

    it("should transfer admin rights", async () => {
      const tx = await program.methods
        .transferAdmin(newAdmin.publicKey)
        .accounts({
          admin: admin.publicKey,
          swapGroup: swapGroupPda,
        })
        .signers([admin])
        .rpc();

      console.log("transfer_admin tx:", tx);

      const swapGroup = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(swapGroup.admin.toString(), newAdmin.publicKey.toString());
    });

    it("should reject same admin transfer", async () => {
      try {
        await program.methods
          .transferAdmin(newAdmin.publicKey)
          .accounts({
            admin: newAdmin.publicKey,
            swapGroup: swapGroupPda,
          })
          .signers([newAdmin])
          .rpc();
        assert.fail("Should have thrown InvalidAdmin error");
      } catch (err) {
        assert.include(err.toString(), "InvalidAdmin");
      }
    });

    // Transfer back to original admin for close_group test
    after(async () => {
      await program.methods
        .transferAdmin(admin.publicKey)
        .accounts({
          admin: newAdmin.publicKey,
          swapGroup: swapGroupPda,
        })
        .signers([newAdmin])
        .rpc();
    });
  });

  describe("9. close_group", () => {
    it("should close group and return vault balances to admin", async () => {
      const adminInputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        inputMint,
        admin.publicKey
      );

      const adminOutputAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outputMint,
        admin.publicKey
      );

      const beforeInputBalance = (await getAccount(provider.connection, adminInputAta.address)).amount;
      const beforeOutputBalance = (await getAccount(provider.connection, adminOutputAta.address)).amount;

      const tx = await program.methods
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
        })
        .signers([admin])
        .rpc();

      console.log("close_group tx:", tx);

      // Verify status is CLOSED
      const swapGroup = await program.account.swapGroup.fetch(swapGroupPda);
      assert.equal(swapGroup.status, 2); // STATUS_CLOSED

      // Verify balances returned to admin
      const afterInputBalance = (await getAccount(provider.connection, adminInputAta.address)).amount;
      const afterOutputBalance = (await getAccount(provider.connection, adminOutputAta.address)).amount;

      assert.isTrue(afterInputBalance > beforeInputBalance);
      assert.isTrue(afterOutputBalance > beforeOutputBalance);
    });

    it("should reject swap after group is closed", async () => {
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

      try {
        await program.methods
          .swap(new BN(100_000))
          .accounts({
            user: user.publicKey,
            swapGroup: swapGroupPda,
            inputVault: inputVaultPda,
            outputVault: outputVaultPda,
            userInputAta: userInputAta.address,
            userOutputAta: userOutputAta.address,
            inputMint: inputMint,
            outputMint: outputMint,
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown GroupNotActive error");
      } catch (err) {
        assert.include(err.toString(), "GroupNotActive");
      }
    });
  });
});
