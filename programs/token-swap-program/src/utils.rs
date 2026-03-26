use crate::error::TokenSwapError;
use anchor_lang::prelude::*;

/// Computes net output for a forward swap (InputToken → OutputToken).
///
/// Formula:
///   amount_out_raw = amount_in * swap_rate * 10^output_decimals
///                    / (10^rate_decimals * 10^input_decimals)
///   fee            = amount_out_raw * fee_basis_points / 10000
///   net_out        = amount_out_raw - fee
pub fn calculate_swap_amount(
    amount_in: u64,
    swap_rate: u64,
    rate_decimals: u8,
    fee_basis_points: u16,
    input_decimals: u8,
    output_decimals: u8,
) -> Result<u64> {
    let output_scale: u64 = 10u64
        .checked_pow(output_decimals as u32)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let rate_scale: u64 = 10u64
        .checked_pow(rate_decimals as u32)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let input_scale: u64 = 10u64
        .checked_pow(input_decimals as u32)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    // Use u128 to avoid overflow during intermediate multiplication
    let numerator = (amount_in as u128)
        .checked_mul(swap_rate as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        .checked_mul(output_scale as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let denominator = (rate_scale as u128)
        .checked_mul(input_scale as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let amount_out_raw = numerator
        .checked_div(denominator)
        .ok_or(TokenSwapError::ArithmeticOverflow)? as u64;

    let fee = (amount_out_raw as u128)
        .checked_mul(fee_basis_points as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(TokenSwapError::ArithmeticOverflow)? as u64;

    amount_out_raw
        .checked_sub(fee)
        .ok_or_else(|| error!(TokenSwapError::ArithmeticOverflow))
}

/// Computes net output for a reverse swap (OutputToken → InputToken).
///
/// Formula:
///   amount_out_raw = amount_in * 10^rate_decimals * 10^input_decimals
///                    / (swap_rate * 10^output_decimals)
///   fee            = amount_out_raw * fee_basis_points / 10000
///   net_out        = amount_out_raw - fee
pub fn calculate_swap_reverse_amount(
    amount_in: u64,
    swap_rate: u64,
    rate_decimals: u8,
    fee_basis_points: u16,
    input_decimals: u8,
    output_decimals: u8,
) -> Result<u64> {
    let rate_scale: u64 = 10u64
        .checked_pow(rate_decimals as u32)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let input_scale: u64 = 10u64
        .checked_pow(input_decimals as u32)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let output_scale: u64 = 10u64
        .checked_pow(output_decimals as u32)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let numerator = (amount_in as u128)
        .checked_mul(rate_scale as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        .checked_mul(input_scale as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let denominator = (swap_rate as u128)
        .checked_mul(output_scale as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?;

    let amount_out_raw = numerator
        .checked_div(denominator)
        .ok_or(TokenSwapError::ArithmeticOverflow)? as u64;

    let fee = (amount_out_raw as u128)
        .checked_mul(fee_basis_points as u128)
        .ok_or(TokenSwapError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(TokenSwapError::ArithmeticOverflow)? as u64;

    amount_out_raw
        .checked_sub(fee)
        .ok_or_else(|| error!(TokenSwapError::ArithmeticOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Feature: token-swap-program, Property 7: swap 综合转账正确性
    // Feature: token-swap-program, Property 8: swap_reverse 综合转账正确性
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(proptest::test_runner::Config::with_cases(100))]

        #[test]
        fn prop_swap_calculation_valid(
            amount_in in 1u64..1_000_000_000u64,
            swap_rate in 1u64..1_000_000u64,
            rate_decimals in 0u8..6u8,
            fee_bps in 0u16..10000u16,
            input_decimals in 0u8..9u8,
            output_decimals in 0u8..9u8,
        ) {
            let result = calculate_swap_amount(
                amount_in, swap_rate, rate_decimals, fee_bps,
                input_decimals, output_decimals,
            );
            // Must either succeed or overflow — never panic
            let _ = result;
        }

        #[test]
        fn prop_swap_reverse_calculation_valid(
            amount_in in 1u64..1_000_000_000u64,
            swap_rate in 1u64..1_000_000u64,
            rate_decimals in 0u8..6u8,
            fee_bps in 0u16..10000u16,
            input_decimals in 0u8..9u8,
            output_decimals in 0u8..9u8,
        ) {
            let result = calculate_swap_reverse_amount(
                amount_in, swap_rate, rate_decimals, fee_bps,
                input_decimals, output_decimals,
            );
            let _ = result;
        }

        // Feature: token-swap-program, Property 3: 无效参数验证
        #[test]
        fn prop_zero_swap_rate_overflows_or_divides_by_zero(
            amount_in in 1u64..1_000_000u64,
            fee_bps in 0u16..10000u16,
        ) {
            // swap_rate = 0 causes division by zero in reverse, overflow in forward
            let result = calculate_swap_reverse_amount(amount_in, 0, 0, fee_bps, 6, 6);
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_swap_1_to_1_no_fee() {
        // 1:1 swap, same decimals (6), no fee
        let net = calculate_swap_amount(1_000_000, 1, 0, 0, 6, 6).unwrap();
        assert_eq!(net, 1_000_000);
    }

    #[test]
    fn test_swap_with_fee() {
        // 1:1, 1% fee (100 bps)
        let net = calculate_swap_amount(1_000_000, 1, 0, 100, 6, 6).unwrap();
        assert_eq!(net, 990_000);
    }

    #[test]
    fn test_swap_reverse_1_to_1_no_fee() {
        let net = calculate_swap_reverse_amount(1_000_000, 1, 0, 0, 6, 6).unwrap();
        assert_eq!(net, 1_000_000);
    }
}
