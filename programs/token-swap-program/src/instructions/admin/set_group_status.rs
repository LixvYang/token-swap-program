use crate::error::TokenSwapError;
use crate::state::{SwapGroup, STATUS_ACTIVE, STATUS_PAUSED};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetGroupStatusAccountConstraints<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"swap_group".as_ref(), swap_group.load()?.group_id.as_ref()],
        bump = swap_group.load()?.bump,
    )]
    pub swap_group: AccountLoader<'info, SwapGroup>,
}

pub fn set_group_status(ctx: Context<SetGroupStatusAccountConstraints>, status: u8) -> Result<()> {
    // Validate status value
    require!(
        status == STATUS_ACTIVE || status == STATUS_PAUSED,
        TokenSwapError::InvalidStatus
    );

    let clock = Clock::get()?;
    let mut group = ctx.accounts.swap_group.load_mut()?;
    group.status = status;
    group.updated_at = clock.unix_timestamp;
    Ok(())
}
