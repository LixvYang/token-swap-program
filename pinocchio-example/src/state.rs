use bytemuck::{from_bytes, from_bytes_mut, Pod, Zeroable};
use pinocchio::{
    account_info::{AccountInfo, Ref, RefMut},
    program_error::ProgramError,
    pubkey::Pubkey,
};

/// SwapGroup 状态常量
pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_PAUSED: u8 = 1;
pub const STATUS_CLOSED: u8 = 2;

/// Anchor `account:SwapGroup` discriminator.
pub const SWAP_GROUP_DISCRIMINATOR: [u8; 8] = [52, 88, 74, 68, 102, 2, 69, 113];
pub const SWAP_GROUP_DISCRIMINATOR_LEN: usize = 8;

/// SwapGroup 结构体大小（不含 Anchor discriminator）。
pub const SWAP_GROUP_SIZE: usize = 136;
pub const SWAP_GROUP_ACCOUNT_SIZE: usize = SWAP_GROUP_DISCRIMINATOR_LEN + SWAP_GROUP_SIZE;

/// SwapGroup 状态账户
#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
pub struct SwapGroup {
    pub admin: [u8; 32],
    pub input_mint: [u8; 32],
    pub output_mint: [u8; 32],
    pub swap_rate: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub group_id: [u8; 8],
    pub fee_basis_points: u16,
    pub rate_decimals: u8,
    pub status: u8,
    pub bump: u8,
    pub input_vault_bump: u8,
    pub output_vault_bump: u8,
    pub _padding: u8,
}

impl SwapGroup {
    pub fn load<'a>(
        account: &'a AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Ref<'a, Self>, ProgramError> {
        if account.owner() != program_id {
            return Err(ProgramError::InvalidAccountOwner);
        }

        let data = account.try_borrow_data()?;
        if data.len() < SWAP_GROUP_ACCOUNT_SIZE {
            return Err(ProgramError::InvalidAccountData);
        }
        if data[..SWAP_GROUP_DISCRIMINATOR_LEN] != SWAP_GROUP_DISCRIMINATOR {
            return Err(ProgramError::InvalidAccountData);
        }

        Ok(Ref::map(data, |bytes| {
            from_bytes(&bytes[SWAP_GROUP_DISCRIMINATOR_LEN..SWAP_GROUP_ACCOUNT_SIZE])
        }))
    }

    pub fn load_mut<'a>(
        account: &'a AccountInfo,
        program_id: &Pubkey,
    ) -> Result<RefMut<'a, Self>, ProgramError> {
        if account.owner() != program_id {
            return Err(ProgramError::InvalidAccountOwner);
        }

        let data = account.try_borrow_mut_data()?;
        if data.len() < SWAP_GROUP_ACCOUNT_SIZE {
            return Err(ProgramError::InvalidAccountData);
        }
        if data[..SWAP_GROUP_DISCRIMINATOR_LEN] != SWAP_GROUP_DISCRIMINATOR {
            return Err(ProgramError::InvalidAccountData);
        }

        Ok(RefMut::map(data, |bytes| {
            from_bytes_mut(&mut bytes[SWAP_GROUP_DISCRIMINATOR_LEN..SWAP_GROUP_ACCOUNT_SIZE])
        }))
    }

    pub fn init<'a>(
        account: &'a AccountInfo,
        program_id: &Pubkey,
    ) -> Result<RefMut<'a, Self>, ProgramError> {
        if account.owner() != program_id {
            return Err(ProgramError::InvalidAccountOwner);
        }

        let mut data = account.try_borrow_mut_data()?;
        if data.len() < SWAP_GROUP_ACCOUNT_SIZE {
            return Err(ProgramError::InvalidAccountData);
        }

        data.fill(0);
        data[..SWAP_GROUP_DISCRIMINATOR_LEN].copy_from_slice(&SWAP_GROUP_DISCRIMINATOR);

        Ok(RefMut::map(data, |bytes| {
            from_bytes_mut(&mut bytes[SWAP_GROUP_DISCRIMINATOR_LEN..SWAP_GROUP_ACCOUNT_SIZE])
        }))
    }

    pub fn validate(&self) -> Result<(), pinocchio::program_error::ProgramError> {
        if self.status > STATUS_CLOSED {
            return Err(pinocchio::program_error::ProgramError::InvalidAccountData);
        }

        if self.swap_rate == 0 {
            return Err(pinocchio::program_error::ProgramError::InvalidAccountData);
        }

        if self.fee_basis_points > 10000 {
            return Err(pinocchio::program_error::ProgramError::InvalidAccountData);
        }

        Ok(())
    }

    #[inline(always)]
    pub fn is_active(&self) -> bool {
        self.status == STATUS_ACTIVE
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swap_group_size() {
        assert_eq!(std::mem::size_of::<SwapGroup>(), SWAP_GROUP_SIZE);
    }

    #[test]
    fn test_swap_group_account_size() {
        assert_eq!(SWAP_GROUP_ACCOUNT_SIZE, 144);
    }
}
