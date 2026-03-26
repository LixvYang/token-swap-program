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
    if instruction_data.len() < 11 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let swap_rate = u64::from_le_bytes(
        instruction_data[0..8]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    let rate_decimals = instruction_data[8];
    let fee_basis_points = u16::from_le_bytes(
        instruction_data[9..11]
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

    if !admin.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let swap_group = SwapGroup::load(swap_group_account, program_id)?;
    swap_group.validate()?;

    if admin.key().as_ref() != swap_group.admin.as_ref() {
        return Err(anchor_error(ANCHOR_CONSTRAINT_HAS_ONE));
    }

    drop(swap_group);

    let clock = Clock::get()?;
    let mut swap_group = SwapGroup::load_mut(swap_group_account, program_id)?;
    swap_group.swap_rate = swap_rate;
    swap_group.rate_decimals = rate_decimals;
    swap_group.fee_basis_points = fee_basis_points;
    swap_group.updated_at = clock.unix_timestamp;

    Ok(())
}
