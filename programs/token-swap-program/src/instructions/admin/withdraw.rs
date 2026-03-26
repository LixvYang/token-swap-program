use crate::error::TokenSwapError;
use crate::state::SwapGroup;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct WithdrawAccountConstraints<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"swap_group".as_ref(), swap_group.load()?.group_id.as_ref()],
        bump = swap_group.load()?.bump,
    )]
    pub swap_group: AccountLoader<'info, SwapGroup>,

    #[account(
        mut,
        seeds = [b"vault_output", swap_group.key().as_ref()],
        bump = swap_group.load()?.output_vault_bump,
        token::mint = output_mint,
        token::authority = swap_group,
    )]
    pub output_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = output_mint,
        token::authority = admin,
    )]
    pub admin_output_ata: InterfaceAccount<'info, TokenAccount>,

    pub output_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn withdraw(ctx: Context<WithdrawAccountConstraints>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.output_vault.amount >= amount,
        TokenSwapError::InsufficientVaultBalance
    );

    let (group_id, bump) = {
        let group = ctx.accounts.swap_group.load()?;
        (group.group_id, group.bump)
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"swap_group", &group_id, &[bump]]];

    let decimals = ctx.accounts.output_mint.decimals;

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.output_vault.to_account_info(),
                mint: ctx.accounts.output_mint.to_account_info(),
                to: ctx.accounts.admin_output_ata.to_account_info(),
                authority: ctx.accounts.swap_group.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )?;

    let clock = Clock::get()?;
    ctx.accounts.swap_group.load_mut()?.updated_at = clock.unix_timestamp;

    Ok(())
}
