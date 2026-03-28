import assert from "node:assert/strict";

import {
  createActors,
  createClient,
  createConnection,
  createTestMint,
  expectEq,
  getOrCreateAta,
  logSnapshot,
  mintToAccount,
  readTokenAmount,
  sendInstruction,
  TOKEN_2022_PROGRAM_ID,
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
    programId: TOKEN_2022_PROGRAM_ID,
  });

  const outputMint = await createTestMint({
    connection,
    payer: admin,
    authority: admin,
    decimals: 6,
    programId: TOKEN_PROGRAM_ID,
  });

  const groupId = uniqueGroupId(202n);
  const createGroup = await client.buildCreateGroupInstruction({
    admin: admin.publicKey,
    groupId,
    inputMint,
    outputMint,
    swapRate: 1n,
    rateDecimals: 0,
    feeBasisPoints: 0,
  });
  await sendInstruction({ connection, payer: admin, instruction: createGroup.instruction });

  const group = await client.getGroupById(groupId);
  assert(group, "token2022 group should exist");

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
    tokenProgram: TOKEN_2022_PROGRAM_ID,
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
    amount: 5_000_000n,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  await mintToAccount({
    connection,
    payer: admin,
    mint: inputMint,
    destination: userInputAta.address,
    authority: admin,
    amount: 2_000_000n,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });

  const deposit = await client.buildDepositInstruction({
    admin: admin.publicKey,
    group: group.address,
    amount: 5_000_000n,
    adminOutputTokenAccount: adminOutputAta.address,
  });
  await sendInstruction({ connection, payer: admin, instruction: deposit.instruction });

  const swap = await client.buildSwapInstruction({
    user: user.publicKey,
    group: group.address,
    amountIn: 1_000_000n,
    userInputTokenAccount: userInputAta.address,
    userOutputTokenAccount: userOutputAta.address,
  });
  await sendInstruction({ connection, payer: user, instruction: swap.instruction });

  const userOutputBalance = await readTokenAmount(connection, userOutputAta.address, TOKEN_PROGRAM_ID);
  expectEq(userOutputBalance, 1_000_000n, "token2022->token forward swap mismatch");

  const reverse = await client.buildSwapReverseInstruction({
    user: user.publicKey,
    group: group.address,
    amountIn: 500_000n,
    userInputTokenAccount: userInputAta.address,
    userOutputTokenAccount: userOutputAta.address,
  });
  await sendInstruction({ connection, payer: user, instruction: reverse.instruction });

  const userInputBalance = await readTokenAmount(connection, userInputAta.address, TOKEN_2022_PROGRAM_ID);
  expectEq(userInputBalance, 1_500_000n, "token2022 reverse swap should restore part of input");

  await logSnapshot("after token2022 flow", client, group.address);
  console.log("token2022 mixed flow completed successfully");
}

main().catch((error) => {
  console.error("token2022 flow failed");
  console.error(error);
  process.exitCode = 1;
});
