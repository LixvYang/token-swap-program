use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("5tVSCoxYwSjewDXGZyN5rnvj8ovjAoxvRpzVY8SwQ8b1");

#[program]
pub mod token_swap_program {
    use super::*;

    // Admin instructions
    #[instruction(discriminator = 0)]
    pub fn create_group(
        ctx: Context<CreateGroupAccountConstraints>,
        group_id: [u8; 8],
        swap_rate: u64,
        rate_decimals: u8,
        fee_basis_points: u16,
    ) -> Result<()> {
        instructions::admin::create_group::create_group(
            ctx,
            group_id,
            swap_rate,
            rate_decimals,
            fee_basis_points,
        )
    }

    #[instruction(discriminator = 1)]
    pub fn deposit(ctx: Context<DepositAccountConstraints>, amount: u64) -> Result<()> {
        instructions::admin::deposit::deposit(ctx, amount)
    }

    #[instruction(discriminator = 2)]
    pub fn withdraw(ctx: Context<WithdrawAccountConstraints>, amount: u64) -> Result<()> {
        instructions::admin::withdraw::withdraw(ctx, amount)
    }

    #[instruction(discriminator = 3)]
    pub fn set_group_status(
        ctx: Context<SetGroupStatusAccountConstraints>,
        status: u8,
    ) -> Result<()> {
        instructions::admin::set_group_status::set_group_status(ctx, status)
    }

    #[instruction(discriminator = 4)]
    pub fn close_group(ctx: Context<CloseGroupAccountConstraints>) -> Result<()> {
        instructions::admin::close_group::close_group(ctx)
    }

    #[instruction(discriminator = 5)]
    pub fn transfer_admin(
        ctx: Context<TransferAdminAccountConstraints>,
        new_admin: Pubkey,
    ) -> Result<()> {
        instructions::admin::transfer_admin::transfer_admin(ctx, new_admin)
    }

    #[instruction(discriminator = 6)]
    pub fn update_config(
        ctx: Context<UpdateConfigAccountConstraints>,
        swap_rate: u64,
        rate_decimals: u8,
        fee_basis_points: u16,
    ) -> Result<()> {
        instructions::admin::update_config::update_config(
            ctx,
            swap_rate,
            rate_decimals,
            fee_basis_points,
        )
    }

    // User instructions
    #[instruction(discriminator = 7)]
    pub fn swap(ctx: Context<SwapAccountConstraints>, amount_in: u64) -> Result<()> {
        instructions::swap::swap(ctx, amount_in)
    }

    #[instruction(discriminator = 8)]
    pub fn swap_reverse(ctx: Context<SwapReverseAccountConstraints>, amount_in: u64) -> Result<()> {
        instructions::swap_reverse::swap_reverse(ctx, amount_in)
    }
}
