# Progress

## 2026-03-27

- Confirmed the repository has no existing sdk package implementation to extend.
- Inspected the root package, TypeScript config, IDL, generated types, and PDA usage in tests.
- Confirmed the minimal useful SDK surface should include:
  - program constants and IDL export
  - group ID conversion helpers
  - PDA derivation helpers
  - quote math mirroring on-chain logic
  - group discovery/fetch methods
  - instruction builders for core flows
- Ran `openspec init` and created the `add-token-swap-sdk` change with proposal, design, spec, and tasks artifacts.
- Added a standalone `sdk/` package with:
  - bundled IDL export
  - group ID conversion helpers
  - PDA derivation helpers
  - local quote math
  - group discovery and snapshot APIs
  - instruction builders for all current program entrypoints
  - transaction assembly helper
- Verified `./node_modules/.bin/tsc -p sdk/tsconfig.json`
- Verified `openspec validate add-token-swap-sdk`
- Added localnet SDK validation scripts under `sdk/scripts/`:
  - admin lifecycle
  - user swap/reverse flow
  - Token-2022 mixed flow
  - all-in-one runner
- Verified on the user's local validator and deployed program:
  - `npm --prefix sdk run test:localnet:admin`
  - `npm --prefix sdk run test:localnet:user`
  - `npm --prefix sdk run test:localnet:token2022`
  - `npm --prefix sdk run test:localnet:all`
