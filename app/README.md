# Token Swap Frontend

Next.js frontend for browsing groups, quoting swaps, and administering the on-chain token swap program through the local SDK.

## Features

- switch between `localnet` and `devnet`
- browse all deployed groups on the selected network
- inspect group config, vault addresses, and vault balances
- auto-discover the connected wallet's associated token accounts for both group mints
- submit forward swaps and reverse swaps through the SDK
- create new groups from any connected wallet
- show admin controls only when the connected wallet matches the on-chain group admin
- perform admin deposit, withdraw, pause/resume, config update, admin transfer, and close-group flows
- inline help describing vault direction, liquidity constraints, and protocol limitations

## Install

```bash
cd app
npm install
```

## Run

```bash
npm run dev
```

## Build

```bash
npm run typecheck
npm run build
```

## Network configuration

The app ships with two built-in network profiles:

- `localnet`
  - RPC: `http://127.0.0.1:8899`
  - WS: `ws://127.0.0.1:8900`
- `devnet`
  - RPC: `https://api.devnet.solana.com`
  - WS: `wss://api.devnet.solana.com`

Optional environment overrides:

```bash
NEXT_PUBLIC_LOCALNET_RPC=http://127.0.0.1:8899
NEXT_PUBLIC_LOCALNET_WS=ws://127.0.0.1:8900
NEXT_PUBLIC_LOCALNET_PROGRAM_ID=5tVSCoxYwSjewDXGZyN5rnvj8ovjAoxvRpzVY8SwQ8b1

NEXT_PUBLIC_DEVNET_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_DEVNET_WS=wss://api.devnet.solana.com
NEXT_PUBLIC_DEVNET_PROGRAM_ID=5tVSCoxYwSjewDXGZyN5rnvj8ovjAoxvRpzVY8SwQ8b1
```

## Localnet expectations

Before using the localnet profile:

1. Start `solana-test-validator`
2. Deploy the program
3. Ensure your browser wallet is pointed at the local validator
4. Fund the connected wallet with SOL
5. Create at least one group, or use the SDK scripts under `../sdk/scripts`

## Protocol reminders

- forward swap:
  - user sends `input_mint`
  - `input_mint` lands in `input_vault`
  - program pays `output_mint` from `output_vault`
- reverse swap:
  - user sends `output_mint`
  - `output_mint` lands in `output_vault`
  - program pays `input_mint` from `input_vault`
- admin deposit and withdraw currently operate on the `output_vault` path
- `group_id` is globally unique for the current PDA scheme
- reverse swaps can be blocked even when output vault is funded, if the input vault has not accumulated enough inventory
