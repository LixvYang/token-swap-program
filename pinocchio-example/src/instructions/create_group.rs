use crate::{
    error::{anchor_error, TokenSwapError, ANCHOR_CONSTRAINT_SEEDS},
    state::{SwapGroup, STATUS_ACTIVE, SWAP_GROUP_ACCOUNT_SIZE},
    utils::{find_program_address, load_mint, verify_program_account},
};
use pinocchio::{
    account_info::AccountInfo,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    ProgramResult,
};
use pinocchio_token::{instructions::InitilizeAccount3, state::TokenAccount};

const ADMIN: usize = 0;
const SWAP_GROUP: usize = 1;
const INPUT_VAULT: usize = 2;
const OUTPUT_VAULT: usize = 3;
const INPUT_MINT: usize = 4;
const OUTPUT_MINT: usize = 5;
const TOKEN_PROGRAM: usize = 6;
const SYSTEM_PROGRAM: usize = 7;

fn create_account(
    funding_account: &AccountInfo,
    new_account: &AccountInfo,
    lamports: u64,
    space: u64,
    owner: &Pubkey,
    signer: pinocchio::instruction::Signer<'_, '_>,
) -> ProgramResult {
    let account_metas = [
        AccountMeta::writable_signer(funding_account.key()),
        AccountMeta::writable_signer(new_account.key()),
    ];

    let mut instruction_data = [0u8; 52];
    instruction_data[4..12].copy_from_slice(&lamports.to_le_bytes());
    instruction_data[12..20].copy_from_slice(&space.to_le_bytes());
    instruction_data[20..52].copy_from_slice(owner.as_ref());

    let instruction = Instruction {
        program_id: &pinocchio_system::ID,
        accounts: &account_metas,
        data: &instruction_data,
    };

    invoke_signed(&instruction, &[funding_account, new_account], &[signer])
}

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    if instruction_data.len() < 19 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let group_id: [u8; 8] = instruction_data[0..8]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    let swap_rate = u64::from_le_bytes(
        instruction_data[8..16]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    let rate_decimals = instruction_data[16];
    let fee_basis_points = u16::from_le_bytes(
        instruction_data[17..19]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );

    if swap_rate == 0 {
        return Err(TokenSwapError::InvalidSwapRate.into());
    }
    if fee_basis_points > 10000 {
        return Err(TokenSwapError::InvalidFee.into());
    }

    let admin = &accounts[ADMIN];
    let swap_group_account = &accounts[SWAP_GROUP];
    let input_vault = &accounts[INPUT_VAULT];
    let output_vault = &accounts[OUTPUT_VAULT];
    let input_mint = &accounts[INPUT_MINT];
    let output_mint = &accounts[OUTPUT_MINT];
    let token_program = &accounts[TOKEN_PROGRAM];
    let system_program = &accounts[SYSTEM_PROGRAM];

    if !admin.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    verify_program_account(token_program, &pinocchio_token::ID)?;
    verify_program_account(system_program, &pinocchio_system::ID)?;

    let input_mint_state = load_mint(input_mint)?;
    drop(input_mint_state);
    let output_mint_state = load_mint(output_mint)?;
    drop(output_mint_state);

    let (expected_group, swap_group_bump) = find_program_address(
        &[b"swap_group", admin.key().as_ref(), &group_id],
        program_id,
    )?;
    if expected_group != *swap_group_account.key() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_SEEDS));
    }

    let (expected_input_vault, input_vault_bump) = find_program_address(
        &[b"vault_input", swap_group_account.key().as_ref()],
        program_id,
    )?;
    if expected_input_vault != *input_vault.key() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_SEEDS));
    }

    let (expected_output_vault, output_vault_bump) = find_program_address(
        &[b"vault_output", swap_group_account.key().as_ref()],
        program_id,
    )?;
    if expected_output_vault != *output_vault.key() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_SEEDS));
    }

    let rent = Rent::get()?;

    create_account(
        admin,
        swap_group_account,
        rent.minimum_balance(SWAP_GROUP_ACCOUNT_SIZE),
        SWAP_GROUP_ACCOUNT_SIZE as u64,
        program_id,
        pinocchio::signer!(
            b"swap_group",
            admin.key().as_ref(),
            &group_id,
            &[swap_group_bump]
        ),
    )?;

    create_account(
        admin,
        input_vault,
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &pinocchio_token::ID,
        pinocchio::signer!(
            b"vault_input",
            swap_group_account.key().as_ref(),
            &[input_vault_bump]
        ),
    )?;

    create_account(
        admin,
        output_vault,
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &pinocchio_token::ID,
        pinocchio::signer!(
            b"vault_output",
            swap_group_account.key().as_ref(),
            &[output_vault_bump]
        ),
    )?;

    let clock = Clock::get()?;
    let mut swap_group = SwapGroup::init(swap_group_account, program_id)?;
    swap_group.admin.copy_from_slice(admin.key().as_ref());
    swap_group
        .input_mint
        .copy_from_slice(input_mint.key().as_ref());
    swap_group
        .output_mint
        .copy_from_slice(output_mint.key().as_ref());
    swap_group.swap_rate = swap_rate;
    swap_group.created_at = clock.unix_timestamp;
    swap_group.updated_at = clock.unix_timestamp;
    swap_group.group_id = group_id;
    swap_group.fee_basis_points = fee_basis_points;
    swap_group.rate_decimals = rate_decimals;
    swap_group.status = STATUS_ACTIVE;
    swap_group.bump = swap_group_bump;
    swap_group.input_vault_bump = input_vault_bump;
    swap_group.output_vault_bump = output_vault_bump;
    swap_group._padding = 0;
    drop(swap_group);

    InitilizeAccount3 {
        token: input_vault,
        mint: input_mint,
        owner: input_vault.key(),
    }
    .invoke()?;

    InitilizeAccount3 {
        token: output_vault,
        mint: output_mint,
        owner: output_vault.key(),
    }
    .invoke()?;

    Ok(())
}
