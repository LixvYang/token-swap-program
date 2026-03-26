use crate::error::TokenSwapError;
use crate::state::SwapGroup;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct TransferAdminAccountConstraints<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"swap_group", admin.key().as_ref(), &swap_group.load()?.group_id],
        bump = swap_group.load()?.bump,
    )]
    pub swap_group: AccountLoader<'info, SwapGroup>,
}

pub fn transfer_admin(
    ctx: Context<TransferAdminAccountConstraints>,
    new_admin: Pubkey,
) -> Result<()> {
    require!(
        new_admin != ctx.accounts.admin.key(),
        TokenSwapError::InvalidAdmin
    );

    let clock = Clock::get()?;
    let mut group = ctx.accounts.swap_group.load_mut()?;
    group.admin = new_admin;
    group.updated_at = clock.unix_timestamp;

    Ok(())
}
