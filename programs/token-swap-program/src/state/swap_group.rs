use anchor_lang::prelude::*;

pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_PAUSED: u8 = 1;
pub const STATUS_CLOSED: u8 = 2;

/// Zero-copy account for a swap group.
/// Fields are ordered to satisfy #[repr(C)] natural alignment with no implicit padding.
/// Layout (total 144 bytes):
///   admin:             32  (offset   0)
///   input_mint:        32  (offset  32)
///   output_mint:       32  (offset  64)
///   swap_rate:          8  (offset  96)
///   created_at:         8  (offset 104)
///   updated_at:         8  (offset 112)
///   group_id:           8  (offset 120)
///   fee_basis_points:   2  (offset 128)
///   rate_decimals:      1  (offset 130)
///   status:             1  (offset 131)
///   bump:               1  (offset 132)
///   input_vault_bump:   1  (offset 133)
///   output_vault_bump:  1  (offset 134)
///   _padding:           1  (offset 135) — pad to 8-byte boundary (136 total)
#[account(zero_copy)]
#[repr(C)]
pub struct SwapGroup {
    pub admin: Pubkey,         // 32
    pub input_mint: Pubkey,    // 32
    pub output_mint: Pubkey,   // 32
    pub swap_rate: u64,        // 8
    pub created_at: i64,       // 8
    pub updated_at: i64,       // 8
    pub group_id: [u8; 8],     // 8
    pub fee_basis_points: u16, // 2
    pub rate_decimals: u8,     // 1
    pub status: u8,            // 1
    pub bump: u8,              // 1
    pub input_vault_bump: u8,  // 1
    pub output_vault_bump: u8, // 1
    pub _padding: u8,          // 1 — explicit pad to reach 136 bytes (8-byte aligned)
}
