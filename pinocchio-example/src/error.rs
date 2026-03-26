use pinocchio::program_error::ProgramError;

pub const ANCHOR_INSTRUCTION_MISSING: u32 = 100;
pub const ANCHOR_FALLBACK_NOT_FOUND: u32 = 101;
pub const ANCHOR_CONSTRAINT_HAS_ONE: u32 = 2001;
pub const ANCHOR_CONSTRAINT_SEEDS: u32 = 2006;
pub const ANCHOR_CONSTRAINT_TOKEN_MINT: u32 = 2014;
pub const ANCHOR_CONSTRAINT_TOKEN_OWNER: u32 = 2015;

#[inline(always)]
pub const fn anchor_error(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}

/// 与 Anchor IDL 保持一致的自定义错误码。
#[repr(u32)]
pub enum TokenSwapError {
    Unauthorized = 6000,
    InvalidSwapRate = 6001,
    InvalidFee = 6002,
    InvalidAmount = 6003,
    GroupNotActive = 6004,
    InsufficientVaultBalance = 6005,
    InvalidAdmin = 6006,
    ArithmeticOverflow = 6007,
    InvalidStatus = 6008,
}

impl From<TokenSwapError> for ProgramError {
    fn from(e: TokenSwapError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl From<TokenSwapError> for u64 {
    fn from(e: TokenSwapError) -> Self {
        e as u64
    }
}
