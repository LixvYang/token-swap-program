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

/**
 * 参数化测试：完整的 decimals 组合矩阵
 * 
 * 自动测试所有常见的 decimals 组合，验证：
 * 1. 兑换计算正确性
 * 2. 往返一致性
 * 3. 精度损失在可接受范围内
 */

describe("Decimals Matrix Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TokenSwapProgram as Program<TokenSwapProgram>;
  const payer = provider.wallet as anchor.Wallet;

  let admin: Keypair;
  let user: Keypair;

  // Common decimals in Solana ecosystem
  const COMMON_DECIMALS = [0, 2, 6, 8, 9];

  before(async () => {
    admin = Keypair.generate();
    user = Keypair.generate();

    await provider.connection.requestAirdrop(admin.publicKey, 50 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 50 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1500));
  });

  /**
   * 生成所有 decimals 组合的测试
   */
  COMMON_DECIMALS.forEach((inputDecimals) => {
    COMMON_DECIMALS.forEach((outputDecimals) => {
      describe(`${inputDecimals} → ${outputDecimals} decimals`, () => {
        let inputMint: PublicKey;
        let outputMint: PublicKey;
        let swapGroupPda: PublicKey;
        let inputVaultPda: PublicKey;
        let outputVaultPda: PublicKey;
        const groupId = Buffer.from([inputDecimals, outputDecimals, 0, 0, 0, 0, 0, 0]);

        before(async () => {
          inputMint = await createMint(
            provider.connection,
            payer.payer,
            admin.publicKey,
            null,
            inputDecimals
          );

          outputMint = await createMint(
            provider.connection,
            payer.payer,
            admin.publicKey,
            null,
            outputDecimals
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

          // Create swap group with 1:1 rate, no fee for simplicity
          await program.methods
            .createGroup(Array.from(groupId), new BN(1), 0, 0)
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

          // Deposit large amount to vault
          const adminOutputAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            payer.payer,
            outputMint,
            admin.publicKey
          );

          // Calculate appropriate mint amount based on decimals
          const mintAmount = BigInt(10 ** (outputDecimals + 6)); // 1M tokens in base unit
          await mintTo(
            provider.connection,
            payer.payer,
            outputMint,
            adminOutputAta.address,
            admin,
            mintAmount
          );

          await program.methods
            .deposit(new BN(mintAmount.toString()))
            .accounts({
              admin: admin.publicKey,
              swapGroup: swapGroupPda,
              outputVault: outputVaultPda,
              adminOutputAta: adminOutputAta.address,
              outputMint: outputMint,
            })
            .signers([admin])
            .rpc();

          // Also deposit to input vault for reverse swaps
          const adminInputAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            payer.payer,
            inputMint,
            admin.publicKey
          );

          const inputMintAmount = BigInt(10 ** (inputDecimals + 6));
          await mintTo(
            provider.connection,
            payer.payer,
            inputMint,
            adminInputAta.address,
            admin,
            inputMintAmount
          );
        });

        it("should perform forward swap correctly", async () => {
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

          // Swap 1 token (in base unit)
          const swapAmount = BigInt(10 ** inputDecimals);
          await mintTo(
            provider.connection,
            payer.payer,
            inputMint,
            userInputAta.address,
            admin,
            swapAmount * BigInt(10)
          );

          await program.methods
            .swap(new BN(swapAmount.toString()))
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

          const balance = (await getAccount(provider.connection, userOutputAta.address)).amount;
          const expectedOutput = BigInt(10 ** outputDecimals);
          
          console.log(`${inputDecimals}→${outputDecimals}: input=${swapAmount}, output=${balance}, expected=${expectedOutput}`);
          
          // For 1:1 rate, output should equal input adjusted for decimals
          assert.equal(balance.toString(), expectedOutput.toString());
        });

        it("should handle round-trip swap", async () => {
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

          const initialAmount = BigInt(10 ** inputDecimals);
          const initialBalance = (await getAccount(provider.connection, userInputAta.address)).amount;

          // Forward swap
          await program.methods
            .swap(new BN(initialAmount.toString()))
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

          const intermediateBalance = (await getAccount(provider.connection, userOutputAta.address)).amount;

          // Reverse swap
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
            })
            .signers([user])
            .rpc();

          const finalBalance = (await getAccount(provider.connection, userInputAta.address)).amount;
          const recovered = finalBalance - initialBalance;

          console.log(`Round-trip ${inputDecimals}→${outputDecimals}→${inputDecimals}: initial=${initialAmount}, recovered=${recovered}`);

          // Allow small rounding error (< 0.1%)
          const difference = initialAmount > recovered 
            ? initialAmount - recovered 
            : recovered - initialAmount;
          
          const errorRate = Number(difference) / Number(initialAmount);
          assert.isTrue(errorRate < 0.001, `Error rate ${errorRate} too high`);
        });
      });
    });
  });
});
