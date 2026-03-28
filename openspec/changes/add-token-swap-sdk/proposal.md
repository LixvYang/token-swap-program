## Why

External integrators currently need to read the raw Anchor IDL, manually derive PDAs, detect token program variants, and reconstruct swap math from the Rust source. That makes frontend integration fragile and repetitive, especially now that the program supports custom instruction discriminators and mixed SPL Token / Token-2022 flows.

## What Changes

- Add a standalone `sdk/` TypeScript package in this repository.
- Bundle the current Anchor IDL into the SDK so consumers do not depend on `target/`.
- Expose ergonomic group discovery, PDA derivation, and vault balance queries.
- Expose local quote helpers that mirror the on-chain forward and reverse swap math.
- Expose instruction builders for all current program entrypoints, with automatic token program detection and default ATA derivation.
- Add package-level documentation that shows external consumers how to initialize the client and build instructions.

## Capabilities

### New Capabilities
- `token-swap-sdk`: A frontend-usable TypeScript SDK for discovering groups, computing quotes, and building program instructions from the current Anchor IDL.

### Modified Capabilities

## Impact

- Adds a new `sdk/` package under the repository root.
- Reuses the current program IDL and PDA conventions as the stable client contract.
- Makes the current Anchor program easier to integrate from web apps and scripts without exposing raw on-chain details at every call site.
