import assert from "node:assert/strict";

import {
  createActors,
  createClient,
  createConnection,
  createTestMint,
  expectEq,
  formatPk,
  getOrCreateAta,
  logSnapshot,
  mintToAccount,
  readTokenAmount,
  sendInstruction,
  SwapGroupStatus,
  TOKEN_PROGRAM_ID,
  uniqueGroupId,
} from "./_helpers.mjs";

async function main() {
  const connection = createConnection();
  const client = createClient(connection);
  const { admin, newAdmin } = await createActors(connection);

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

  const groupId = uniqueGroupId(11n);
  const createGroup = await client.buildCreateGroupInstruction({
    admin: admin.publicKey,
    groupId,
    inputMint,
    outputMint,
    swapRate: 1n,
    rateDecimals: 0,
    feeBasisPoints: 50,
  });

  const createSig = await sendInstruction({
    connection,
    payer: admin,
    instruction: createGroup.instruction,
  });

  const group = await client.getGroupById(groupId);
  assert(group, "group should exist after createGroup");
  expectEq(group.admin, admin.publicKey, "initial admin mismatch");
  expectEq(group.swapRate, 1n, "initial swap rate mismatch");
  assert.equal(group.status, SwapGroupStatus.Active, "group should start active");

  console.log("createGroup:", createSig, formatPk(group.address));
  await logSnapshot("after createGroup", client, group);

  const adminInputAta = await getOrCreateAta({
    connection,
    payer: admin,
    mint: inputMint,
    owner: admin.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const adminOutputAta = await getOrCreateAta({
    connection,
    payer: admin,
    mint: outputMint,
    owner: admin.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const newAdminInputAta = await getOrCreateAta({
    connection,
    payer: admin,
    mint: inputMint,
    owner: newAdmin.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const newAdminOutputAta = await getOrCreateAta({
    connection,
    payer: admin,
    mint: outputMint,
    owner: newAdmin.publicKey,
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

  const deposit = await client.buildDepositInstruction({
    admin: admin.publicKey,
    group,
    amount: 4_000_000n,
    adminOutputTokenAccount: adminOutputAta.address,
  });

  const depositSig = await sendInstruction({
    connection,
    payer: admin,
    instruction: deposit.instruction,
  });
  console.log("deposit:", depositSig);

  let snapshot = await client.getGroupSnapshot(group.address);
  expectEq(snapshot.balances.outputVault, 4_000_000n, "output vault should contain deposited liquidity");

  const pause = await client.buildSetGroupStatusInstruction({
    admin: admin.publicKey,
    group: group.address,
    status: SwapGroupStatus.Paused,
  });
  const pauseSig = await sendInstruction({ connection, payer: admin, instruction: pause.instruction });
  console.log("pause:", pauseSig);

  snapshot = await client.getGroupSnapshot(group.address);
  assert.equal(snapshot.status, SwapGroupStatus.Paused, "group should be paused");

  const resume = await client.buildSetGroupStatusInstruction({
    admin: admin.publicKey,
    group: group.address,
    status: SwapGroupStatus.Active,
  });
  const resumeSig = await sendInstruction({ connection, payer: admin, instruction: resume.instruction });
  console.log("resume:", resumeSig);

  const updateConfig = await client.buildUpdateConfigInstruction({
    admin: admin.publicKey,
    group: group.address,
    swapRate: 2n,
    rateDecimals: 0,
    feeBasisPoints: 125,
  });
  const updateSig = await sendInstruction({ connection, payer: admin, instruction: updateConfig.instruction });
  console.log("updateConfig:", updateSig);

  snapshot = await client.getGroupSnapshot(group.address);
  expectEq(snapshot.swapRate, 2n, "updated swap rate mismatch");
  assert.equal(snapshot.feeBasisPoints, 125, "updated fee mismatch");

  await mintToAccount({
    connection,
    payer: admin,
    mint: inputMint,
    destination: adminInputAta.address,
    authority: admin,
    amount: 500_000n,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const seedInputVault = await client.buildSwapInstruction({
    user: admin.publicKey,
    group: group.address,
    amountIn: 500_000n,
    userInputTokenAccount: adminInputAta.address,
    userOutputTokenAccount: adminOutputAta.address,
  });
  const seedSwapSig = await sendInstruction({
    connection,
    payer: admin,
    instruction: seedInputVault.instruction,
  });
  console.log("seed swap for closeGroup coverage:", seedSwapSig);

  snapshot = await client.getGroupSnapshot(group.address);
  expectEq(snapshot.balances.inputVault, 500_000n, "input vault should contain seeded liquidity");

  const transferAdmin = await client.buildTransferAdminInstruction({
    admin: admin.publicKey,
    group: group.address,
    newAdmin: newAdmin.publicKey,
  });
  const transferSig = await sendInstruction({ connection, payer: admin, instruction: transferAdmin.instruction });
  console.log("transferAdmin:", transferSig);

  snapshot = await client.getGroupSnapshot(group.address);
  expectEq(snapshot.admin, newAdmin.publicKey, "new admin should own the group");

  const withdraw = await client.buildWithdrawInstruction({
    admin: newAdmin.publicKey,
    group: group.address,
    amount: 1_500_000n,
    adminOutputTokenAccount: newAdminOutputAta.address,
  });
  const withdrawSig = await sendInstruction({
    connection,
    payer: newAdmin,
    instruction: withdraw.instruction,
  });
  console.log("withdraw:", withdrawSig);

  const newAdminOutputBalance = await readTokenAmount(connection, newAdminOutputAta.address, TOKEN_PROGRAM_ID);
  expectEq(newAdminOutputBalance, 1_500_000n, "new admin output ATA should receive withdrawn tokens");

  const closeGroup = await client.buildCloseGroupInstruction({
    admin: newAdmin.publicKey,
    group: group.address,
    adminInputTokenAccount: newAdminInputAta.address,
    adminOutputTokenAccount: newAdminOutputAta.address,
  });

  const closeSig = await sendInstruction({
    connection,
    payer: newAdmin,
    instruction: closeGroup.instruction,
  });
  console.log("closeGroup:", closeSig);

  snapshot = await client.getGroupSnapshot(group.address);
  assert.equal(snapshot.status, SwapGroupStatus.Closed, "closed group should have CLOSED status");

  const finalNewAdminInputBalance = await readTokenAmount(connection, newAdminInputAta.address, TOKEN_PROGRAM_ID);
  const finalNewAdminOutputBalance = await readTokenAmount(connection, newAdminOutputAta.address, TOKEN_PROGRAM_ID);
  expectEq(finalNewAdminInputBalance, 500_000n, "closeGroup should refund input vault balance to the admin");
  expectEq(finalNewAdminOutputBalance, 3_012_500n, "closeGroup should refund remaining output vault balance");

  await logSnapshot("after admin lifecycle", client, group.address);
  console.log("admin lifecycle completed successfully");
}

main().catch((error) => {
  console.error("admin lifecycle failed");
  console.error(error);
  process.exitCode = 1;
});
