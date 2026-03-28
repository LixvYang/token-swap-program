## Why

The project now has an on-chain program and a frontend-friendly SDK, but it still lacks a user-facing application that can discover groups on a selected Solana network, display group configuration and liquidity, let users swap through a chosen group, and let any connected wallet create and manage the groups it owns. A frontend is the missing product layer that makes the protocol usable without requiring users to inspect raw RPC data or assemble instructions by hand.

## What Changes

- Build a Next.js frontend that can switch between localnet and devnet and rebind all reads and writes to the selected cluster.
- Add read-only group discovery so users can browse every on-chain `SwapGroup`, inspect vault balances, and view pricing configuration.
- Add group detail pages that support forward and reverse swap flows using the SDK.
- Add a create-group flow so any connected wallet can create a group and become that group's admin.
- Add admin management actions on groups owned by the connected wallet: deposit, withdraw, pause/resume, update config, transfer admin, and close group.
- Automatically load the connected user's and current admin's relevant token accounts and balances for the selected group and mint pair so users do not have to paste their own token account addresses.
- Add inline help text and supporting frontend documentation that explains network selection, swap direction, liquidity behavior, admin-only actions, and current protocol limitations.
- Add network-aware empty states and error handling for cases where the program is not deployed or a selected network has no groups.

## Capabilities

### New Capabilities
- `token-swap-frontend`: A Next.js application for network selection, group discovery, swapping, group creation, and admin management on top of the token swap SDK.

### Modified Capabilities

## Impact

- Adds a new frontend application layer, likely under `app/`.
- Depends on the new `sdk/` package as the primary protocol integration surface.
- Introduces wallet connection, network selection, and client-side transaction submission UX.
- Requires token account discovery logic for wallet-owned and admin-owned mint accounts on the selected cluster.
- Defines the product-level interaction model for localnet and devnet environments.
