use crate::error::TokenSwapError;
use crate::state::{SwapGroup, STATUS_ACTIVE};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
#[instruction(group_id: [u8; 8])]
pub struct CreateGroupAccountConstraints<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + std::mem::size_of::<SwapGroup>(),
        seeds = [b"swap_group", admin.key().as_ref(), &group_id],
        bump,
    )]
    pub swap_group: AccountLoader<'info, SwapGroup>,

    #[account(
        init,
        payer = admin,
        token::mint = input_mint,
        token::authority = swap_group,
        token::token_program = input_token_program,
        seeds = [b"vault_input", swap_group.key().as_ref()],
        bump,
    )]
    pub input_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        token::mint = output_mint,
        token::authority = swap_group,
        token::token_program = output_token_program,
        seeds = [b"vault_output", swap_group.key().as_ref()],
        bump,
    )]
    pub output_vault: InterfaceAccount<'info, TokenAccount>,

    pub input_mint: InterfaceAccount<'info, Mint>,
    pub output_mint: InterfaceAccount<'info, Mint>,

    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn create_group(
    ctx: Context<CreateGroupAccountConstraints>,
    group_id: [u8; 8],
    swap_rate: u64,
    rate_decimals: u8,
    fee_basis_points: u16,
) -> Result<()> {
    require!(swap_rate > 0, TokenSwapError::InvalidSwapRate);
    require!(fee_basis_points <= 10000, TokenSwapError::InvalidFee);

    let clock = Clock::get()?;
    let mut group = ctx.accounts.swap_group.load_init()?;

    group.admin = ctx.accounts.admin.key();
    group.input_mint = ctx.accounts.input_mint.key();
    group.output_mint = ctx.accounts.output_mint.key();
    group.swap_rate = swap_rate;
    group.rate_decimals = rate_decimals;
    group.fee_basis_points = fee_basis_points;
    group.status = STATUS_ACTIVE;
    group.group_id = group_id;
    group.bump = ctx.bumps.swap_group;
    group.input_vault_bump = ctx.bumps.input_vault;
    group.output_vault_bump = ctx.bumps.output_vault;
    group.created_at = clock.unix_timestamp;
    group.updated_at = clock.unix_timestamp;

    Ok(())
}
