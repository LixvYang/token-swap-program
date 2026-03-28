## Context

The repository currently contains the on-chain program, tests, and documentation, but no frontend-oriented SDK package. External consumers must manually handle `group_id: [u8; 8]`, derive `swap_group`, `input_vault`, and `output_vault` PDAs, discover groups from RPC, and map mint owners to either SPL Token or Token-2022. The package should remain aligned with the current Anchor/web3.js stack because the program is exposed through Anchor IDL and the surrounding repo already uses `@coral-xyz/anchor`.

## Goals / Non-Goals

**Goals:**
- Create a self-contained `sdk/` package that bundles the current IDL.
- Provide read APIs for group discovery, vault inspection, and quote generation.
- Provide instruction builders for all current program entrypoints.
- Hide raw `group_id` byte handling behind ergonomic helpers.
- Make default account derivation predictable for frontend consumers.

**Non-Goals:**
- Introduce a new protocol abstraction beyond the current IDL.
- Add sending, signing, or wallet-connection UX.
- Add off-chain indexing or caching services.
- Change on-chain program behavior.

## Decisions

### Use a standalone `sdk/` package
The SDK will live under `sdk/` with its own `package.json`, `tsconfig.json`, and source tree. This keeps packaging concerns separate from the on-chain program and test harness.

Alternative considered:
- Reuse the repository root package. Rejected because the root package is test-oriented and not shaped like a publishable SDK.

### Bundle a local copy of the IDL
The SDK will carry its own copy of `token_swap_program.json` under `sdk/src/idl/` instead of importing from `target/`.

Alternative considered:
- Import from `target/idl/` at runtime. Rejected because external consumers should not depend on build artifacts existing outside the package.

### Wrap raw Anchor calls behind a typed client
The SDK will expose a `TokenSwapClient` that handles Program initialization, group discovery, mint metadata loading, token program detection, PDA derivation, and instruction building.

Alternative considered:
- Export only the raw IDL and helper constants. Rejected because it would leave the hardest integration work to consumers.

### Keep the current Anchor + web3.js boundary
The SDK will use Anchor and `@solana/web3.js` internally because the current repo already depends on them and they match the IDL-driven integration path.

Alternative considered:
- Introduce `@solana/kit` as the primary SDK abstraction. Rejected for this first version because the current program and surrounding tests are Anchor/web3-oriented, and a Kit-first client would add an unnecessary adapter layer.

## Risks / Trade-offs

- [IDL drift] → The SDK bundles a local IDL copy, so future program changes must update the SDK copy in the same change.
- [Token account assumptions] → Default ATA derivation is convenient, but some integrators may use non-ATA token accounts. The builders therefore allow explicit account overrides.
- [Read-side RPC cost] → Group discovery loads all `SwapGroup` accounts through Anchor account queries. This is acceptable for the current program scale and can be optimized later if account counts grow.
- [Opaque group IDs] → Numeric conversion helpers need a fixed endianness choice. The SDK will make that choice explicit through helper naming rather than hiding it silently.
