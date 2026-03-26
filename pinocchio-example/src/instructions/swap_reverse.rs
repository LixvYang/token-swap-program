use crate::{
    error::{anchor_error, TokenSwapError, ANCHOR_CONSTRAINT_TOKEN_MINT},
    state::SwapGroup,
    utils::{
        calculate_swap_reverse_amount, load_mint, load_token_account, verify_pda,
        verify_program_account,
    },
};
use pinocchio::{
    account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey, ProgramResult,
};
use pinocchio_token::instructions::TransferChecked;

const USER: usize = 0;
const SWAP_GROUP: usize = 1;
const INPUT_VAULT: usize = 2;
const OUTPUT_VAULT: usize = 3;
const USER_INPUT_ATA: usize = 4;
const USER_OUTPUT_ATA: usize = 5;
const INPUT_MINT: usize = 6;
const OUTPUT_MINT: usize = 7;
const TOKEN_PROGRAM: usize = 8;

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 9 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if instruction_data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let amount_in = u64::from_le_bytes(
        instruction_data[0..8]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    if amount_in == 0 {
        return Err(TokenSwapError::InvalidAmount.into());
    }

    let user = &accounts[USER];
    let swap_group_account = &accounts[SWAP_GROUP];
    let input_vault = &accounts[INPUT_VAULT];
    let output_vault = &accounts[OUTPUT_VAULT];
    let user_input_ata = &accounts[USER_INPUT_ATA];
    let user_output_ata = &accounts[USER_OUTPUT_ATA];
    let input_mint = &accounts[INPUT_MINT];
    let output_mint = &accounts[OUTPUT_MINT];
    let token_program = &accounts[TOKEN_PROGRAM];

    if !user.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    verify_program_account(token_program, &pinocchio_token::ID)?;

    let swap_group = SwapGroup::load(swap_group_account, program_id)?;
    swap_group.validate()?;

    if !swap_group.is_active() {
        return Err(TokenSwapError::GroupNotActive.into());
    }
    if input_mint.key().as_ref() != swap_group.input_mint.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_TOKEN_MINT));
    }
    if output_mint.key().as_ref() != swap_group.output_mint.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_TOKEN_MINT));
    }

    let input_vault_bump = swap_group.input_vault_bump;
    let output_vault_bump = swap_group.output_vault_bump;
    let swap_rate = swap_group.swap_rate;
    let rate_decimals = swap_group.rate_decimals;
    let fee_basis_points = swap_group.fee_basis_points;
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
    let vault_balance = input_vault_state.amount();
    drop(input_vault_state);

    let output_vault_state =
        load_token_account(output_vault, output_mint.key(), output_vault.key())?;
    drop(output_vault_state);

    let user_input_state = load_token_account(user_input_ata, input_mint.key(), user.key())?;
    drop(user_input_state);
    let user_output_state = load_token_account(user_output_ata, output_mint.key(), user.key())?;
    drop(user_output_state);

    let net_output = calculate_swap_reverse_amount(
        amount_in,
        swap_rate,
        rate_decimals,
        fee_basis_points,
        input_decimals,
        output_decimals,
    )?;

    if vault_balance < net_output {
        return Err(TokenSwapError::InsufficientVaultBalance.into());
    }

    TransferChecked {
        from: user_output_ata,
        to: output_vault,
        authority: user,
        mint: output_mint,
        amount: amount_in,
        decimals: output_decimals,
    }
    .invoke()?;

    TransferChecked {
        from: input_vault,
        to: user_input_ata,
        authority: input_vault,
        mint: input_mint,
        amount: net_output,
        decimals: input_decimals,
    }
    .invoke_signed(&[pinocchio::signer!(
        b"vault_input",
        swap_group_account.key().as_ref(),
        &[input_vault_bump]
    )])?;

    Ok(())
}
