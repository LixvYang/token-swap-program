use anchor_lang::prelude::*;

#[error_code]
pub enum TokenSwapError {
    #[msg("Only the group admin can perform this action")]
    Unauthorized,

    #[msg("swap_rate must be greater than zero")]
    InvalidSwapRate,

    #[msg("fee_basis_points must be <= 10000")]
    InvalidFee,

    #[msg("amount must be greater than zero")]
    InvalidAmount,

    #[msg("SwapGroup is not active")]
    GroupNotActive,

    #[msg("Vault has insufficient balance")]
    InsufficientVaultBalance,

    #[msg("new_admin must differ from current admin")]
    InvalidAdmin,

    #[msg("Arithmetic overflow in swap calculation")]
    ArithmeticOverflow,

    #[msg("Invalid status value")]
    InvalidStatus,
}
