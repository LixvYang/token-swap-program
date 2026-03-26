use crate::{
    error::{
        anchor_error, TokenSwapError, ANCHOR_CONSTRAINT_HAS_ONE, ANCHOR_CONSTRAINT_TOKEN_MINT,
    },
    state::SwapGroup,
    utils::{load_mint, load_token_account, verify_pda, verify_program_account},
};
use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvars::{clock::Clock, Sysvar},
    ProgramResult,
};
use pinocchio_token::instructions::TransferChecked;

const ADMIN: usize = 0;
const SWAP_GROUP: usize = 1;
const OUTPUT_VAULT: usize = 2;
const ADMIN_OUTPUT_ATA: usize = 3;
const OUTPUT_MINT: usize = 4;
const TOKEN_PROGRAM: usize = 5;

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 6 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if instruction_data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let amount = u64::from_le_bytes(
        instruction_data[0..8]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );

    let admin = &accounts[ADMIN];
    let swap_group_account = &accounts[SWAP_GROUP];
    let output_vault = &accounts[OUTPUT_VAULT];
    let admin_output_ata = &accounts[ADMIN_OUTPUT_ATA];
    let output_mint = &accounts[OUTPUT_MINT];
    let token_program = &accounts[TOKEN_PROGRAM];

    if !admin.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    verify_program_account(token_program, &pinocchio_token::ID)?;

    let swap_group = SwapGroup::load(swap_group_account, program_id)?;
    swap_group.validate()?;

    if admin.key().as_ref() != swap_group.admin.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_HAS_ONE));
    }
    if output_mint.key().as_ref() != swap_group.output_mint.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_TOKEN_MINT));
    }

    let output_vault_bump = swap_group.output_vault_bump;
    drop(swap_group);

    verify_pda(
        output_vault,
        &[b"vault_output", swap_group_account.key().as_ref()],
        output_vault_bump,
        program_id,
    )?;

    let output_mint_state = load_mint(output_mint)?;
    let output_decimals = output_mint_state.decimals();
    drop(output_mint_state);

    let output_vault_state =
        load_token_account(output_vault, output_mint.key(), output_vault.key())?;
    let vault_balance = output_vault_state.amount();
    drop(output_vault_state);

    if vault_balance < amount {
        return Err(TokenSwapError::InsufficientVaultBalance.into());
    }

    let admin_output_state = load_token_account(admin_output_ata, output_mint.key(), admin.key())?;
    drop(admin_output_state);

    TransferChecked {
        from: output_vault,
        to: admin_output_ata,
        authority: output_vault,
        mint: output_mint,
        amount,
        decimals: output_decimals,
    }
    .invoke_signed(&[pinocchio::signer!(
        b"vault_output",
        swap_group_account.key().as_ref(),
        &[output_vault_bump]
    )])?;

    let clock = Clock::get()?;
    let mut swap_group = SwapGroup::load_mut(swap_group_account, program_id)?;
    swap_group.updated_at = clock.unix_timestamp;

    Ok(())
}
