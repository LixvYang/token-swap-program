use crate::{
    error::{anchor_error, TokenSwapError, ANCHOR_CONSTRAINT_HAS_ONE},
    state::SwapGroup,
};
use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvars::{clock::Clock, Sysvar},
    ProgramResult,
};

const ADMIN: usize = 0;
const SWAP_GROUP: usize = 1;

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if instruction_data.len() < 32 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let new_admin: [u8; 32] = instruction_data[0..32]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let admin = &accounts[ADMIN];
    let swap_group_account = &accounts[SWAP_GROUP];

    if !admin.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let swap_group = SwapGroup::load(swap_group_account, program_id)?;
    swap_group.validate()?;

    if admin.key().as_ref() != swap_group.admin.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_HAS_ONE));
    }
    if new_admin == swap_group.admin {
        return Err(TokenSwapError::InvalidAdmin.into());
    }

    drop(swap_group);

    let clock = Clock::get()?;
    let mut swap_group = SwapGroup::load_mut(swap_group_account, program_id)?;
    swap_group.admin = new_admin;
    swap_group.updated_at = clock.unix_timestamp;

    Ok(())
}
