use crate::state::{SwapGroup, STATUS_CLOSED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct CloseGroupAccountConstraints<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"swap_group", admin.key().as_ref(), &swap_group.load()?.group_id],
        bump = swap_group.load()?.bump,
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
        token::authority = admin,
    )]
    pub admin_input_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = output_mint,
        token::authority = admin,
    )]
    pub admin_output_ata: InterfaceAccount<'info, TokenAccount>,

    pub input_mint: Box<InterfaceAccount<'info, Mint>>,
    pub output_mint: Box<InterfaceAccount<'info, Mint>>,
    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,
}

pub fn close_group(ctx: Context<CloseGroupAccountConstraints>) -> Result<()> {
    let group_key = ctx.accounts.swap_group.key();
    let (input_vault_bump, output_vault_bump) = {
        let group = ctx.accounts.swap_group.load()?;
        (group.input_vault_bump, group.output_vault_bump)
    };

    // Refund input vault if non-empty
    let input_amount = ctx.accounts.input_vault.amount;
    if input_amount > 0 {
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"vault_input", group_key.as_ref(), &[input_vault_bump]]];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.input_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.input_vault.to_account_info(),
                    mint: ctx.accounts.input_mint.to_account_info(),
                    to: ctx.accounts.admin_input_ata.to_account_info(),
                    authority: ctx.accounts.input_vault.to_account_info(),
                },
                signer_seeds,
            ),
            input_amount,
            ctx.accounts.input_mint.decimals,
        )?;
    }

    // Refund output vault if non-empty
    let output_amount = ctx.accounts.output_vault.amount;
    if output_amount > 0 {
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"vault_output", group_key.as_ref(), &[output_vault_bump]]];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.output_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.output_vault.to_account_info(),
                    mint: ctx.accounts.output_mint.to_account_info(),
                    to: ctx.accounts.admin_output_ata.to_account_info(),
                    authority: ctx.accounts.output_vault.to_account_info(),
                },
                signer_seeds,
            ),
            output_amount,
            ctx.accounts.output_mint.decimals,
        )?;
    }

    let clock = Clock::get()?;
    let mut group = ctx.accounts.swap_group.load_mut()?;
    group.status = STATUS_CLOSED;
    group.updated_at = clock.unix_timestamp;

    Ok(())
}
