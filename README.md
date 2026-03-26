# Token Swap Program

Solana token swap program with two implementations in the same workspace:

- `programs/token-swap-program`: the original Anchor implementation
- `pinocchio-example`: the migrated Pinocchio implementation

The repository is set up to compare ergonomics, binary size, and migration tradeoffs between Anchor and a lower-level Pinocchio program while preserving the same core swap behavior.

## What The Program Does

The program manages swap groups between an input mint and an output mint. Each group stores swap configuration and two vault PDAs, and supports:

- `create_group`
- `deposit`
- `withdraw`
- `swap`
- `swap_reverse`
- `set_group_status`
- `update_config`
- `transfer_admin`
- `close_group`

## Repository Layout

```text
.
├── programs/token-swap-program/   # Anchor program
├── pinocchio-example/             # Pinocchio port
├── tests/                         # Anchor TypeScript integration tests
├── migrations/                    # Anchor deploy script
├── Anchor.toml
└── Cargo.toml                     # Workspace root
```

## Status

- The Anchor program is the reference implementation.
- The Pinocchio program has been migrated far enough to compile, run its Rust tests, and produce an SBF artifact.
- The Pinocchio entrypoint currently supports both Anchor-style 8-byte discriminators and a legacy 1-byte discriminator path to make migration experiments easier.

## Binary Size Snapshot

Current local `target/deploy` artifacts:

| Program | File | Size |
| --- | --- | ---: |
| Anchor | `token_swap_program.so` | 367,632 bytes |
| Pinocchio | `token_swap_pinocchio.so` | 76,280 bytes |

In the current build, the Pinocchio artifact is about `79.25%` smaller than the Anchor artifact.

## Prerequisites

- Rust toolchain compatible with Solana 2.x
- Solana CLI with SBF toolchain installed
- Anchor CLI
- Node.js and npm

## Build

Build the Anchor program:

```bash
cargo build-sbf --manifest-path programs/token-swap-program/Cargo.toml
```

Build the Pinocchio program:

```bash
cargo build-sbf --manifest-path pinocchio-example/Cargo.toml
```

Build the whole workspace:

```bash
cargo build
```

## Test

Run the Anchor TypeScript integration tests:

```bash
anchor test
```

Run Anchor Rust tests only:

```bash
cargo test --manifest-path programs/token-swap-program/Cargo.toml
```

Run Pinocchio Rust tests:

```bash
cargo test -p token-swap-pinocchio --lib
```

## Notes On The Two Implementations

### Anchor

- Uses `#[program]`, `Context`, and account constraints from `anchor-lang`
- Easier client integration through IDL and standard Anchor tooling
- Larger generated binary and higher runtime overhead from framework abstractions

### Pinocchio

- Uses a manual `process_instruction` entrypoint
- Performs explicit account parsing, PDA verification, and CPI construction
- Smaller binary and better room for compute-unit optimization
- Requires more care around ABI compatibility, account layout, and client encoding

## Useful Documents

- [ANCHOR_VS_PINOCCHIO.md](./ANCHOR_VS_PINOCCHIO.md): implementation-level comparison
- [PINOCCHIO_MIGRATION.md](./PINOCCHIO_MIGRATION.md): migration notes
- [CU_BENCHMARK.md](./CU_BENCHMARK.md): compute-unit benchmark notes
- [TESTING_GUIDE.md](./TESTING_GUIDE.md): test layout and scenarios
- [ADVANCED_TEST_SCENARIOS.md](./ADVANCED_TEST_SCENARIOS.md): additional edge cases

## Local Configuration

Anchor is configured in [Anchor.toml](./Anchor.toml) for `localnet`, with:

- program name: `token_swap_program`
- local program id: `5tVSCoxYwSjewDXGZyN5rnvj8ovjAoxvRpzVY8SwQ8b1`

## License

This repository currently inherits the default `ISC` value from `package.json`. Add a top-level license file if you want the repository licensing to be explicit.
