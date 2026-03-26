use crate::error::TokenSwapError;
use crate::state::SwapGroup;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateConfigAccountConstraints<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"swap_group".as_ref(), swap_group.load()?.group_id.as_ref()],
        bump = swap_group.load()?.bump,
    )]
    pub swap_group: AccountLoader<'info, SwapGroup>,
}

pub fn update_config(
    ctx: Context<UpdateConfigAccountConstraints>,
    swap_rate: u64,
    rate_decimals: u8,
    fee_basis_points: u16,
) -> Result<()> {
    require!(swap_rate > 0, TokenSwapError::InvalidSwapRate);
    require!(fee_basis_points <= 10000, TokenSwapError::InvalidFee);

    let clock = Clock::get()?;
    let mut group = ctx.accounts.swap_group.load_mut()?;
    group.swap_rate = swap_rate;
    group.rate_decimals = rate_decimals;
    group.fee_basis_points = fee_basis_points;
    group.updated_at = clock.unix_timestamp;

    Ok(())
}
