use crate::error::{
    anchor_error, TokenSwapError, ANCHOR_CONSTRAINT_SEEDS, ANCHOR_CONSTRAINT_TOKEN_MINT,
    ANCHOR_CONSTRAINT_TOKEN_OWNER,
};
use pinocchio::{
    account_info::{AccountInfo, Ref},
    program_error::ProgramError,
    pubkey::{create_program_address, try_find_program_address, Pubkey},
    ProgramResult,
};
use pinocchio_token::state::{Mint, TokenAccount};

/// 计算正向兑换输出（InputToken → OutputToken）
///
/// 公式: amount_out = amount_in * swap_rate * 10^output_decimals
///                   / (10^rate_decimals * 10^input_decimals)
/// 手续费: fee = amount_out * fee_basis_points / 10000
/// 净输出: net_out = amount_out - fee
#[inline]
pub fn calculate_swap_amount(
    amount_in: u64,
    swap_rate: u64,
    rate_decimals: u8,
    fee_basis_points: u16,
    input_decimals: u8,
    output_decimals: u8,
) -> Result<u64, ProgramError> {
    let output_scale = 10u128.pow(output_decimals as u32);
    let rate_scale = 10u128.pow(rate_decimals as u32);
    let input_scale = 10u128.pow(input_decimals as u32);

    let numerator = (amount_in as u128)
        .checked_mul(swap_rate as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        .checked_mul(output_scale)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let denominator = rate_scale
        .checked_mul(input_scale)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let amount_out_raw = numerator
        .checked_div(denominator)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let amount_out =
        u64::try_from(amount_out_raw).map_err(|_| TokenSwapError::ArithmeticOverflow)?;

    let fee = ((amount_out as u128)
        .checked_mul(fee_basis_points as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        / 10000) as u64;

    amount_out
        .checked_sub(fee)
        .ok_or_else(|| TokenSwapError::ArithmeticOverflow.into())
}

/// 计算反向兑换输出（OutputToken → InputToken）
///
/// 公式: amount_out = amount_in * 10^rate_decimals * 10^input_decimals
///                   / (swap_rate * 10^output_decimals)
#[inline]
pub fn calculate_swap_reverse_amount(
    amount_in: u64,
    swap_rate: u64,
    rate_decimals: u8,
    fee_basis_points: u16,
    input_decimals: u8,
    output_decimals: u8,
) -> Result<u64, ProgramError> {
    let rate_scale = 10u128.pow(rate_decimals as u32);
    let input_scale = 10u128.pow(input_decimals as u32);
    let output_scale = 10u128.pow(output_decimals as u32);

    let numerator = (amount_in as u128)
        .checked_mul(rate_scale)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        .checked_mul(input_scale)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let denominator = (swap_rate as u128)
        .checked_mul(output_scale)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let amount_out_raw = numerator
        .checked_div(denominator)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let amount_out =
        u64::try_from(amount_out_raw).map_err(|_| TokenSwapError::ArithmeticOverflow)?;

    let fee = ((amount_out as u128)
        .checked_mul(fee_basis_points as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        / 10000) as u64;

    amount_out
        .checked_sub(fee)
        .ok_or_else(|| TokenSwapError::ArithmeticOverflow.into())
}

#[inline]
pub fn find_program_address(
    seeds: &[&[u8]],
    program_id: &Pubkey,
) -> Result<(Pubkey, u8), ProgramError> {
    try_find_program_address(seeds, program_id).ok_or(ProgramError::InvalidSeeds)
}

#[inline]
pub fn verify_program_account(account: &AccountInfo, expected_program: &Pubkey) -> ProgramResult {
    if account.key() != expected_program {
        return Err(ProgramError::IncorrectProgramId);
    }

    Ok(())
}

#[inline]
pub fn load_mint<'a>(account: &'a AccountInfo) -> Result<Ref<'a, Mint>, ProgramError> {
    Mint::from_account_info(account)
}

#[inline]
pub fn load_token_account<'a>(
    account: &'a AccountInfo,
    expected_mint: &Pubkey,
    expected_authority: &Pubkey,
) -> Result<Ref<'a, TokenAccount>, ProgramError> {
    let token_account = TokenAccount::from_account_info(account)?;

    if token_account.mint() != *expected_mint {
        return Err(anchor_error(ANCHOR_CONSTRAINT_TOKEN_MINT));
    }

    if token_account.authority() != *expected_authority {
        return Err(anchor_error(ANCHOR_CONSTRAINT_TOKEN_OWNER));
    }

    Ok(token_account)
}

#[inline]
pub fn verify_pda(
    account: &AccountInfo,
    seeds: &[&[u8]],
    bump: u8,
    program_id: &Pubkey,
) -> ProgramResult {
    let bump_seed = [bump];
    let derived = match seeds {
        [seed_0] => create_program_address(&[*seed_0, &bump_seed], program_id),
        [seed_0, seed_1] => create_program_address(&[*seed_0, *seed_1, &bump_seed], program_id),
        [seed_0, seed_1, seed_2] => {
            create_program_address(&[*seed_0, *seed_1, *seed_2, &bump_seed], program_id)
        }
        _ => Err(ProgramError::MaxSeedLengthExceeded),
    }?;

    if derived != *account.key() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_SEEDS));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swap_1_to_1_no_fee() {
        let net = calculate_swap_amount(1_000_000, 1, 0, 0, 6, 6).unwrap();
        assert_eq!(net, 1_000_000);
    }

    #[test]
    fn test_swap_with_fee() {
        let net = calculate_swap_amount(1_000_000, 1, 0, 100, 6, 6).unwrap();
        assert_eq!(net, 990_000);
    }

    #[test]
    fn test_swap_reverse_1_to_1_no_fee() {
        let net = calculate_swap_reverse_amount(1_000_000, 1, 0, 0, 6, 6).unwrap();
        assert_eq!(net, 1_000_000);
    }
}
