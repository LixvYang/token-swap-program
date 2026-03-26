# Token Swap Program Interface

This document describes the current Anchor program in `programs/token-swap-program`.
It focuses on the on-chain interface that clients need to understand:

- program ID
- PDA derivation rules
- persistent state
- instruction discriminators
- instruction arguments
- required accounts
- runtime behavior and validations

## Program

- Program crate: `programs/token-swap-program`
- Program ID: `5tVSCoxYwSjewDXGZyN5rnvj8ovjAoxvRpzVY8SwQ8b1`
- Framework: Anchor
- Token CPI style: `anchor_spl::token_interface`, so the program can work with classic SPL Token and Token-2022 accounts

## PDA Model

The program uses one `SwapGroup` PDA plus two vault PDAs per group.

### `swap_group`

- Seeds: `["swap_group", group_id]`
- `group_id` type: `[u8; 8]`
- Uniqueness scope: global inside this program

That means the current design allows many groups, but the same `group_id` cannot be reused anywhere in the program, even by a different admin.

### `input_vault`

- Seeds: `["vault_input", swap_group_pubkey]`
- Mint: `input_mint`
- Authority: `swap_group`

### `output_vault`

- Seeds: `["vault_output", swap_group_pubkey]`
- Mint: `output_mint`
- Authority: `swap_group`

## Persistent State

### `SwapGroup`

`SwapGroup` is a zero-copy account.

- Account type: `#[account(zero_copy)]`
- Struct layout: `#[repr(C)]`
- Allocated space: `8 + size_of::<SwapGroup>() = 144` bytes
- Struct body size: `136` bytes
- The leading `8` bytes are the Anchor account discriminator

Field definition:

| Field | Type | Meaning |
| --- | --- | --- |
| `admin` | `Pubkey` | Current admin authority for privileged instructions |
| `input_mint` | `Pubkey` | Mint received by the program in forward swaps |
| `output_mint` | `Pubkey` | Mint paid out by the program in forward swaps |
| `swap_rate` | `u64` | Price ratio used by `swap` and `swap_reverse` |
| `created_at` | `i64` | Unix timestamp when the group was created |
| `updated_at` | `i64` | Unix timestamp of the last admin-side config/liquidity change |
| `group_id` | `[u8; 8]` | External group identifier and part of the PDA seeds |
| `fee_basis_points` | `u16` | Fee in basis points, valid range `0..=10000` |
| `rate_decimals` | `u8` | Decimal precision applied to `swap_rate` |
| `status` | `u8` | Group lifecycle state |
| `bump` | `u8` | `swap_group` PDA bump |
| `input_vault_bump` | `u8` | `input_vault` PDA bump |
| `output_vault_bump` | `u8` | `output_vault` PDA bump |
| `_padding` | `u8` | Explicit padding byte |

## Status Values

| Name | Value | Meaning |
| --- | ---: | --- |
| `STATUS_ACTIVE` | `0` | Swaps are allowed |
| `STATUS_PAUSED` | `1` | Swaps are blocked |
| `STATUS_CLOSED` | `2` | Group has been closed by admin |

Notes:

- `set_group_status` only allows `ACTIVE` and `PAUSED`
- `CLOSED` is only set by `close_group`
- `close_group` marks the group closed but does not deallocate the `SwapGroup` account

## Error Codes

| Error | Meaning |
| --- | --- |
| `Unauthorized` | Caller is not the group admin |
| `InvalidSwapRate` | `swap_rate == 0` |
| `InvalidFee` | `fee_basis_points > 10000` |
| `InvalidAmount` | Amount is zero where zero is disallowed |
| `GroupNotActive` | Swap attempted while group is not active |
| `InsufficientVaultBalance` | Vault cannot cover requested payout |
| `InvalidAdmin` | New admin equals current admin |
| `ArithmeticOverflow` | Overflow or invalid arithmetic during price calculation |
| `InvalidStatus` | Status is not one of the allowed values |

## Custom Instruction Discriminators

The current Anchor 0.32.1 program uses explicit custom instruction discriminators starting from `0`.

| Discriminator | Instruction |
| ---: | --- |
| `0` | `create_group` |
| `1` | `deposit` |
| `2` | `withdraw` |
| `3` | `set_group_status` |
| `4` | `close_group` |
| `5` | `transfer_admin` |
| `6` | `update_config` |
| `7` | `swap` |
| `8` | `swap_reverse` |

This is instruction-level encoding only. `SwapGroup` still uses the normal Anchor account discriminator.

## Swap Math

### Forward swap: `swap`

Direction:

- user sends `input_mint`
- program pays `output_mint`

Formula:

```text
amount_out_raw = amount_in * swap_rate * 10^output_decimals
                 / (10^rate_decimals * 10^input_decimals)
fee            = amount_out_raw * fee_basis_points / 10000
net_out        = amount_out_raw - fee
```

### Reverse swap: `swap_reverse`

Direction:

- user sends `output_mint`
- program pays `input_mint`

Formula:

```text
amount_out_raw = amount_in * 10^rate_decimals * 10^input_decimals
                 / (swap_rate * 10^output_decimals)
fee            = amount_out_raw * fee_basis_points / 10000
net_out        = amount_out_raw - fee
```

Implementation details:

- intermediate multiplication uses `u128`
- overflow and invalid division paths return `ArithmeticOverflow`
- fees are implicit: the user receives `net_out`, and the vault pays less than `amount_out_raw`

## Instruction Reference

### `create_group`

Purpose:

- creates a new `SwapGroup`
- initializes both vault PDAs
- stores swap config and bumps

Discriminator:

- `0`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `group_id` | `[u8; 8]` | Global group identifier used in PDA derivation |
| `swap_rate` | `u64` | Initial price ratio |
| `rate_decimals` | `u8` | Decimal precision for `swap_rate` |
| `fee_basis_points` | `u16` | Fee bps, max `10000` |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `admin` | yes | yes | payer and initial admin |
| `swap_group` | yes | no | PDA init with seeds `["swap_group", group_id]` |
| `input_vault` | yes | no | PDA token account init with seeds `["vault_input", swap_group]` |
| `output_vault` | yes | no | PDA token account init with seeds `["vault_output", swap_group]` |
| `input_mint` | no | no | input token mint |
| `output_mint` | no | no | output token mint |
| `input_token_program` | no | no | token program for `input_mint` |
| `output_token_program` | no | no | token program for `output_mint` |
| `system_program` | no | no | system program |

Behavior:

- validates `swap_rate > 0`
- validates `fee_basis_points <= 10000`
- sets `status = STATUS_ACTIVE`
- stores all PDA bumps
- sets both timestamps to current unix time

### `deposit`

Purpose:

- deposits `output_mint` liquidity from the admin into `output_vault`

Discriminator:

- `1`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `amount` | `u64` | Amount of `output_mint` to move into `output_vault` |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `admin` | no | yes | must equal `swap_group.admin` |
| `swap_group` | yes | no | PDA validated by `group_id` seed |
| `output_vault` | yes | no | must be the group's output vault |
| `admin_output_ata` | yes | no | admin-owned token account for `output_mint` |
| `output_mint` | no | no | output mint |
| `token_program` | no | no | token program for `output_mint` |

Behavior:

- transfers `amount` from `admin_output_ata` to `output_vault`
- updates `swap_group.updated_at`

Notes:

- this instruction only touches the output vault
- there is currently no symmetric admin deposit instruction for the input vault
- the source code does not explicitly reject `amount = 0`; behavior is delegated to the token program

### `withdraw`

Purpose:

- withdraws `output_mint` liquidity from `output_vault` back to the admin

Discriminator:

- `2`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `amount` | `u64` | Amount of `output_mint` to withdraw |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `admin` | no | yes | must equal `swap_group.admin` |
| `swap_group` | yes | no | PDA signer authority |
| `output_vault` | yes | no | must be the group's output vault |
| `admin_output_ata` | yes | no | admin-owned token account for `output_mint` |
| `output_mint` | no | no | output mint |
| `token_program` | no | no | token program for `output_mint` |

Behavior:

- checks `output_vault.amount >= amount`
- signs as `swap_group`
- transfers `amount` from `output_vault` to `admin_output_ata`
- updates `swap_group.updated_at`

Notes:

- this instruction only withdraws from the output vault
- the source code does not explicitly reject `amount = 0`

### `set_group_status`

Purpose:

- toggles whether swaps are allowed

Discriminator:

- `3`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `status` | `u8` | Must be `0` or `1` |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `admin` | no | yes | must equal `swap_group.admin` |
| `swap_group` | yes | no | target group |

Behavior:

- accepts only `STATUS_ACTIVE` or `STATUS_PAUSED`
- rejects any other value with `InvalidStatus`
- updates `swap_group.status`
- updates `swap_group.updated_at`

### `close_group`

Purpose:

- refunds all remaining vault balances to the admin
- marks the group as closed

Discriminator:

- `4`

Arguments:

- none

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `admin` | yes | yes | must equal `swap_group.admin` |
| `swap_group` | yes | no | PDA signer authority |
| `input_vault` | yes | no | input vault |
| `output_vault` | yes | no | output vault |
| `admin_input_ata` | yes | no | admin-owned token account for `input_mint` |
| `admin_output_ata` | yes | no | admin-owned token account for `output_mint` |
| `input_mint` | no | no | input mint |
| `output_mint` | no | no | output mint |
| `input_token_program` | no | no | token program for `input_mint` |
| `output_token_program` | no | no | token program for `output_mint` |

Behavior:

- signs as `swap_group`
- if `input_vault` is non-empty, transfers its full balance to `admin_input_ata`
- if `output_vault` is non-empty, transfers its full balance to `admin_output_ata`
- sets `status = STATUS_CLOSED`
- updates `swap_group.updated_at`

Important:

- this does not close or deallocate the `SwapGroup` account
- after closing, the account still exists on chain with status `CLOSED`

### `transfer_admin`

Purpose:

- changes the current group admin

Discriminator:

- `5`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `new_admin` | `Pubkey` | Replacement admin |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `admin` | no | yes | current admin |
| `swap_group` | yes | no | target group |

Behavior:

- rejects `new_admin == admin` with `InvalidAdmin`
- updates `swap_group.admin`
- updates `swap_group.updated_at`

Note:

- PDA seeds do not include `admin`
- admin transfer therefore does not invalidate the existing PDA

### `update_config`

Purpose:

- updates the pricing and fee configuration of a group

Discriminator:

- `6`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `swap_rate` | `u64` | New price ratio |
| `rate_decimals` | `u8` | New decimal precision |
| `fee_basis_points` | `u16` | New fee bps |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `admin` | no | yes | must equal `swap_group.admin` |
| `swap_group` | yes | no | target group |

Behavior:

- validates `swap_rate > 0`
- validates `fee_basis_points <= 10000`
- updates `swap_rate`
- updates `rate_decimals`
- updates `fee_basis_points`
- updates `swap_group.updated_at`

### `swap`

Purpose:

- forward swap from `input_mint` into `output_mint`

Discriminator:

- `7`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `amount_in` | `u64` | User input amount in `input_mint` units |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `user` | no | yes | swap initiator |
| `swap_group` | no | no | PDA validated by `group_id` seed |
| `input_vault` | yes | no | receives user input |
| `output_vault` | yes | no | pays user output |
| `user_input_ata` | yes | no | user-owned token account for `input_mint` |
| `user_output_ata` | yes | no | user-owned token account for `output_mint` |
| `input_mint` | no | no | must match `swap_group.input_mint` |
| `output_mint` | no | no | must match `swap_group.output_mint` |
| `input_token_program` | no | no | token program for `input_mint` |
| `output_token_program` | no | no | token program for `output_mint` |

Behavior:

- requires `amount_in > 0`
- requires `swap_group.status == STATUS_ACTIVE`
- computes `net_out` with `calculate_swap_amount`
- requires `output_vault.amount >= net_out`
- transfers `amount_in` from `user_input_ata` to `input_vault`
- signs as `swap_group` and transfers `net_out` from `output_vault` to `user_output_ata`

Notes:

- this instruction does not update `swap_group.updated_at`
- the fee is implicit because the user receives less than `amount_out_raw`

### `swap_reverse`

Purpose:

- reverse swap from `output_mint` into `input_mint`

Discriminator:

- `8`

Arguments:

| Name | Type | Meaning |
| --- | --- | --- |
| `amount_in` | `u64` | User input amount in `output_mint` units |

Accounts:

| Name | Mut | Signer | Notes |
| --- | --- | --- | --- |
| `user` | no | yes | swap initiator |
| `swap_group` | no | no | PDA validated by `group_id` seed |
| `input_vault` | yes | no | pays user output |
| `output_vault` | yes | no | receives user input |
| `user_input_ata` | yes | no | user-owned token account for `input_mint` |
| `user_output_ata` | yes | no | user-owned token account for `output_mint` |
| `input_mint` | no | no | must match `swap_group.input_mint` |
| `output_mint` | no | no | must match `swap_group.output_mint` |
| `input_token_program` | no | no | token program for `input_mint` |
| `output_token_program` | no | no | token program for `output_mint` |

Behavior:

- requires `amount_in > 0`
- requires `swap_group.status == STATUS_ACTIVE`
- computes `net_out` with `calculate_swap_reverse_amount`
- requires `input_vault.amount >= net_out`
- transfers `amount_in` from `user_output_ata` to `output_vault`
- signs as `swap_group` and transfers `net_out` from `input_vault` to `user_input_ata`

Notes:

- this instruction does not update `swap_group.updated_at`
- reverse swap retains the fee implicitly because `input_vault` sends less than `amount_out_raw`

## Operational Notes

- Admin-side liquidity management currently exists only for `output_vault` through `deposit` and `withdraw`
- `input_vault` grows during forward swaps and shrinks during reverse swaps
- `close_group` is the only admin instruction that explicitly drains both vaults
- Because `group_id` is part of the `swap_group` PDA seeds and `admin` is not, `group_id` must be globally unique while admin rotation remains safe
