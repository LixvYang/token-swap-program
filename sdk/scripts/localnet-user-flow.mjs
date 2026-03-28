import assert from "node:assert/strict";

import {
  createActors,
  createClient,
  createConnection,
  createTestMint,
  deriveDefaultAta,
  expectEq,
  formatPk,
  getOrCreateAta,
  logSnapshot,
  mintToAccount,
  readTokenAmount,
  sendInstruction,
  TOKEN_PROGRAM_ID,
  uniqueGroupId,
} from "./_helpers.mjs";

async function main() {
  const connection = createConnection();
  const client = createClient(connection);
  const { admin, user } = await createActors(connection);

  const inputMint = await createTestMint({
    connection,
    payer: admin,
    authority: admin,
    decimals: 6,
    programId: TOKEN_PROGRAM_ID,
  });

  const outputMint = await createTestMint({
    connection,
    payer: admin,
    authority: admin,
    decimals: 6,
    programId: TOKEN_PROGRAM_ID,
  });

  const groupId = uniqueGroupId(101n);
  const createGroup = await client.buildCreateGroupInstruction({
    admin: admin.publicKey,
    groupId,
    inputMint,
    outputMint,
    swapRate: 2n,
    rateDecimals: 0,
    feeBasisPoints: 100,
  });

  const createSig = await sendInstruction({
    connection,
    payer: admin,
    instruction: createGroup.instruction,
  });
  console.log("createGroup:", createSig);

  const group = await client.getGroupById(groupId);
  assert(group, "group should exist");

  const adminOutputAta = await getOrCreateAta({
    connection,
    payer: admin,
    mint: outputMint,
    owner: admin.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const userInputAta = await getOrCreateAta({
    connection,
    payer: admin,
    mint: inputMint,
    owner: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const userOutputAta = await getOrCreateAta({
    connection,
    payer: admin,
    mint: outputMint,
    owner: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  await mintToAccount({
    connection,
    payer: admin,
    mint: outputMint,
    destination: adminOutputAta.address,
    authority: admin,
    amount: 10_000_000n,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  await mintToAccount({
    connection,
    payer: admin,
    mint: inputMint,
    destination: userInputAta.address,
    authority: admin,
    amount: 3_000_000n,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const deposit = await client.buildDepositInstruction({
    admin: admin.publicKey,
    group: group.address,
    amount: 8_000_000n,
    adminOutputTokenAccount: adminOutputAta.address,
  });
  const depositSig = await sendInstruction({ connection, payer: admin, instruction: deposit.instruction });
  console.log("deposit:", depositSig);

  const allGroups = await client.getAllGroups({ inputMint, outputMint });
  assert(
    allGroups.some((candidate) => candidate.address.equals(group.address)),
    "getAllGroups should include the new group",
  );

  const derivedVaults = client.deriveVaultAddresses(group.groupId);
  expectEq(derivedVaults.swapGroup, group.address, "derived swap group mismatch");

  const quote = await client.quoteForward(group.address, 1_000_000n);
  expectEq(quote.amountOutRaw, 2_000_000n, "forward quote raw output mismatch");
  expectEq(quote.netAmountOut, 1_980_000n, "forward quote net output mismatch");

  const swap = await client.buildSwapInstruction({
    user: user.publicKey,
    group: group.address,
    amountIn: 1_000_000n,
    userInputTokenAccount: userInputAta.address,
    userOutputTokenAccount: userOutputAta.address,
  });
  const swapSig = await sendInstruction({ connection, payer: user, instruction: swap.instruction });
  console.log("swap:", swapSig);

  const userOutputBalanceAfterSwap = await readTokenAmount(connection, userOutputAta.address, TOKEN_PROGRAM_ID);
  expectEq(userOutputBalanceAfterSwap, 1_980_000n, "user should receive net output from swap");

  const snapshotAfterSwap = await client.getGroupSnapshot(group.address);
  expectEq(snapshotAfterSwap.balances.inputVault, 1_000_000n, "input vault should collect swap input");

  const reverseQuote = await client.quoteReverse(group.address, 990_000n);
  expectEq(reverseQuote.netAmountOut, 490_050n, "reverse quote net output mismatch");

  const swapReverse = await client.buildSwapReverseInstruction({
    user: user.publicKey,
    group: group.address,
    amountIn: 990_000n,
    userInputTokenAccount: userInputAta.address,
    userOutputTokenAccount: userOutputAta.address,
  });
  const reverseSig = await sendInstruction({ connection, payer: user, instruction: swapReverse.instruction });
  console.log("swapReverse:", reverseSig);

  const userInputBalanceAfterReverse = await readTokenAmount(connection, userInputAta.address, TOKEN_PROGRAM_ID);
  expectEq(
    userInputBalanceAfterReverse,
    2_490_050n,
    "user input ATA should reflect forward swap debit plus reverse swap credit",
  );

  const userOutputBalanceAfterReverse = await readTokenAmount(connection, userOutputAta.address, TOKEN_PROGRAM_ID);
  expectEq(userOutputBalanceAfterReverse, 990_000n, "user output ATA should reflect reverse input transfer");

  const autoDerivedUserInputAta = deriveDefaultAta(user.publicKey, inputMint, TOKEN_PROGRAM_ID);
  const autoDerivedUserOutputAta = deriveDefaultAta(user.publicKey, outputMint, TOKEN_PROGRAM_ID);
  expectEq(autoDerivedUserInputAta, userInputAta.address, "default input ATA derivation mismatch");
  expectEq(autoDerivedUserOutputAta, userOutputAta.address, "default output ATA derivation mismatch");

  await logSnapshot("after user flow", client, group.address);
  console.log("user flow completed successfully", formatPk(group.address));
}

main().catch((error) => {
  console.error("user flow failed");
  console.error(error);
  process.exitCode = 1;
});
