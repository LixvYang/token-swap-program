# Findings

## Repository

- The repo root is the active git repository.
- There is no pre-existing `sdk/` package content despite the intended destination.
- Root TypeScript setup is minimal and test-focused.

## Program Interface

- Program ID: `5tVSCoxYwSjewDXGZyN5rnvj8ovjAoxvRpzVY8SwQ8b1`
- Anchor IDL is available at `target/idl/token_swap_program.json`
- Anchor TS type is available at `target/types/token_swap_program.ts`

## Important Integration Constraints

- `group_id` is `[u8; 8]`, so the SDK should provide ergonomic conversion helpers.
- `swap_group` PDA is derived from `["swap_group", group_id]`.
- `input_vault` PDA is derived from `["vault_input", swap_group]`.
- `output_vault` PDA is derived from `["vault_output", swap_group]`.
- Read-side group discovery can be built on `getProgramAccounts` or Anchor account queries.
- Token program selection must handle both SPL Token and Token-2022 by mint owner.
