use crate::{
    error::{anchor_error, ANCHOR_CONSTRAINT_HAS_ONE, ANCHOR_CONSTRAINT_TOKEN_MINT},
    state::{SwapGroup, STATUS_CLOSED},
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
const INPUT_VAULT: usize = 2;
const OUTPUT_VAULT: usize = 3;
const ADMIN_INPUT_ATA: usize = 4;
const ADMIN_OUTPUT_ATA: usize = 5;
const INPUT_MINT: usize = 6;
const OUTPUT_MINT: usize = 7;
const TOKEN_PROGRAM: usize = 8;

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 9 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let admin = &accounts[ADMIN];
    let swap_group_account = &accounts[SWAP_GROUP];
    let input_vault = &accounts[INPUT_VAULT];
    let output_vault = &accounts[OUTPUT_VAULT];
    let admin_input_ata = &accounts[ADMIN_INPUT_ATA];
    let admin_output_ata = &accounts[ADMIN_OUTPUT_ATA];
    let input_mint = &accounts[INPUT_MINT];
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
    if input_mint.key().as_ref() != swap_group.input_mint.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_TOKEN_MINT));
    }
    if output_mint.key().as_ref() != swap_group.output_mint.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_TOKEN_MINT));
    }

    let input_vault_bump = swap_group.input_vault_bump;
    let output_vault_bump = swap_group.output_vault_bump;
    drop(swap_group);

    verify_pda(
        input_vault,
        &[b"vault_input", swap_group_account.key().as_ref()],
        input_vault_bump,
        program_id,
    )?;
    verify_pda(
        output_vault,
        &[b"vault_output", swap_group_account.key().as_ref()],
        output_vault_bump,
        program_id,
    )?;

    let input_mint_state = load_mint(input_mint)?;
    let input_decimals = input_mint_state.decimals();
    drop(input_mint_state);

    let output_mint_state = load_mint(output_mint)?;
    let output_decimals = output_mint_state.decimals();
    drop(output_mint_state);

    let input_vault_state = load_token_account(input_vault, input_mint.key(), input_vault.key())?;
    let input_amount = input_vault_state.amount();
    drop(input_vault_state);

    let output_vault_state =
        load_token_account(output_vault, output_mint.key(), output_vault.key())?;
    let output_amount = output_vault_state.amount();
    drop(output_vault_state);

    let admin_input_state = load_token_account(admin_input_ata, input_mint.key(), admin.key())?;
    drop(admin_input_state);
    let admin_output_state = load_token_account(admin_output_ata, output_mint.key(), admin.key())?;
    drop(admin_output_state);

    if input_amount > 0 {
        TransferChecked {
            from: input_vault,
            to: admin_input_ata,
            authority: input_vault,
            mint: input_mint,
            amount: input_amount,
            decimals: input_decimals,
        }
        .invoke_signed(&[pinocchio::signer!(
            b"vault_input",
            swap_group_account.key().as_ref(),
            &[input_vault_bump]
        )])?;
    }

    if output_amount > 0 {
        TransferChecked {
            from: output_vault,
            to: admin_output_ata,
            authority: output_vault,
            mint: output_mint,
            amount: output_amount,
            decimals: output_decimals,
        }
        .invoke_signed(&[pinocchio::signer!(
            b"vault_output",
            swap_group_account.key().as_ref(),
            &[output_vault_bump]
        )])?;
    }

    let clock = Clock::get()?;
    let mut swap_group = SwapGroup::load_mut(swap_group_account, program_id)?;
    swap_group.status = STATUS_CLOSED;
    swap_group.updated_at = clock.unix_timestamp;

    Ok(())
}
