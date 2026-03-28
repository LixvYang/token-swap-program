# Token Swap SDK

TypeScript SDK for the Anchor program at `programs/token-swap-program`.

## Features

- bundles the current Anchor IDL inside the package
- derives `swap_group`, `input_vault`, and `output_vault` PDAs
- hides raw `[u8; 8]` group ID handling behind helper functions
- mirrors on-chain swap math for local quote computation
- discovers on-chain groups and fetches vault balances
- builds Anchor instructions for all current program entrypoints

## Admin API

The SDK already exposes admin-side instruction builders:

- `buildCreateGroupInstruction`
- `buildDepositInstruction`
- `buildWithdrawInstruction`
- `buildSetGroupStatusInstruction`
- `buildTransferAdminInstruction`
- `buildUpdateConfigInstruction`
- `buildCloseGroupInstruction`

Each builder derives the expected PDA accounts and returns a ready-to-send Anchor instruction. The SDK does not auto-send transactions, so callers keep full control over fee payer, signers, batching, and wallet UX.

## Quick Start

```ts
import { Connection, Keypair } from "@solana/web3.js";
import { TokenSwapClient, groupIdFromU64LE } from "@rebetxin/token-swap-sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const client = TokenSwapClient.initialize(connection);

const groupId = groupIdFromU64LE(1n);
const group = await client.getGroupById(groupId);

if (group) {
  const quote = await client.quoteForward(group, 1_000_000n);
  console.log(quote.netAmountOut.toString());
}

const admin = Keypair.generate().publicKey;
const createGroupIx = await client.buildCreateGroupInstruction({
  admin,
  groupId,
  inputMint: "INPUT_MINT_PUBKEY",
  outputMint: "OUTPUT_MINT_PUBKEY",
  swapRate: 1n,
  rateDecimals: 0,
  feeBasisPoints: 30,
});
```

## Notes

- `swap` always transfers `input_mint -> input_vault` and pays out from `output_vault`
- `swapReverse` always transfers `output_mint -> output_vault` and pays out from `input_vault`
- the current program only provides admin `deposit` and `withdraw` instructions for `output_vault`

## Localnet Scripts

These scripts assume:

- `solana-test-validator` is running on `http://127.0.0.1:8899`
- the program is already deployed
- the default admin keypair is `~/.config/solana/id.json`, or override with `SDK_ADMIN_KEYPAIR`

Commands:

```bash
cd sdk
npm run test:localnet:admin
npm run test:localnet:user
npm run test:localnet:token2022
npm run test:localnet:all
```

Coverage:

- `test:localnet:admin`: create group, deposit, set status, update config, transfer admin, withdraw, close group
- `test:localnet:user`: getAllGroups, getGroupById, getGroupSnapshot, vault discovery, quote, swap, swapReverse
- `test:localnet:token2022`: mixed Token-2022 and classic SPL Token flow through the SDK
