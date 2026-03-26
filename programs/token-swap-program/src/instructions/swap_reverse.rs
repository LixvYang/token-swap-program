use crate::error::TokenSwapError;
use crate::state::{SwapGroup, STATUS_ACTIVE};
use crate::utils::calculate_swap_reverse_amount;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct SwapReverseAccountConstraints<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [
            b"swap_group",
            swap_group.load()?.admin.as_ref(),
            &swap_group.load()?.group_id,
        ],
        bump = swap_group.load()?.bump,
        constraint = swap_group.load()?.input_mint == input_mint.key(),
        constraint = swap_group.load()?.output_mint == output_mint.key(),
    )]
    pub swap_group: AccountLoader<'info, SwapGroup>,

    #[account(
        mut,
        seeds = [b"vault_input", swap_group.key().as_ref()],
        bump = swap_group.load()?.input_vault_bump,
        token::mint = input_mint,
        token::authority = swap_group,
    )]
    pub input_vault: InterfaceAccount<'info, TokenAccount>,

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
        token::mint = input_mint,
        token::authority = user,
    )]
    pub user_input_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = output_mint,
        token::authority = user,
    )]
    pub user_output_ata: InterfaceAccount<'info, TokenAccount>,

    pub input_mint: Box<InterfaceAccount<'info, Mint>>,
    pub output_mint: Box<InterfaceAccount<'info, Mint>>,
    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,
}

pub fn swap_reverse(ctx: Context<SwapReverseAccountConstraints>, amount_in: u64) -> Result<()> {
    require!(amount_in > 0, TokenSwapError::InvalidAmount);

    let (swap_rate, rate_decimals, fee_basis_points, status) = {
        let group = ctx.accounts.swap_group.load()?;
        (
            group.swap_rate,
            group.rate_decimals,
            group.fee_basis_points,
            group.status,
        )
    };

    require!(status == STATUS_ACTIVE, TokenSwapError::GroupNotActive);

    let net_out = calculate_swap_reverse_amount(
        amount_in,
        swap_rate,
        rate_decimals,
        fee_basis_points,
        ctx.accounts.input_mint.decimals,
        ctx.accounts.output_mint.decimals,
    )?;

    require!(
        ctx.accounts.input_vault.amount >= net_out,
        TokenSwapError::InsufficientVaultBalance
    );

    // Transfer OutputToken from user to output_vault
    transfer_checked(
        CpiContext::new(
            ctx.accounts.output_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_output_ata.to_account_info(),
                mint: ctx.accounts.output_mint.to_account_info(),
                to: ctx.accounts.output_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount_in,
        ctx.accounts.output_mint.decimals,
    )?;

    // Transfer InputToken from input_vault to user (PDA-signed)
    let group_key = ctx.accounts.swap_group.key();
    let input_vault_bump = ctx.accounts.swap_group.load()?.input_vault_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"vault_input", group_key.as_ref(), &[input_vault_bump]]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.input_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.input_vault.to_account_info(),
                mint: ctx.accounts.input_mint.to_account_info(),
                to: ctx.accounts.user_input_ata.to_account_info(),
                authority: ctx.accounts.input_vault.to_account_info(),
            },
            signer_seeds,
        ),
        net_out,
        ctx.accounts.input_mint.decimals,
    )?;

    Ok(())
}
