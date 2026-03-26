#![allow(unexpected_cfgs)]

#[cfg(target_os = "solana")]
use pinocchio::entrypoint;
use pinocchio::{account_info::AccountInfo, pubkey::Pubkey, ProgramResult};

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use error::{anchor_error, ANCHOR_FALLBACK_NOT_FOUND, ANCHOR_INSTRUCTION_MISSING};

#[cfg(target_os = "solana")]
entrypoint!(process_instruction);

pub mod instruction_discriminator {
    pub const CLOSE_GROUP: [u8; 8] = [40, 187, 201, 187, 18, 194, 122, 232];
    pub const CREATE_GROUP: [u8; 8] = [79, 60, 158, 134, 61, 199, 56, 248];
    pub const DEPOSIT: [u8; 8] = [242, 35, 198, 137, 82, 225, 242, 182];
    pub const SET_GROUP_STATUS: [u8; 8] = [55, 98, 107, 185, 74, 61, 19, 150];
    pub const SWAP: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];
    pub const SWAP_REVERSE: [u8; 8] = [39, 179, 128, 162, 230, 16, 25, 244];
    pub const TRANSFER_ADMIN: [u8; 8] = [42, 242, 66, 106, 228, 10, 111, 156];
    pub const UPDATE_CONFIG: [u8; 8] = [29, 158, 252, 191, 10, 83, 219, 99];
    pub const WITHDRAW: [u8; 8] = [183, 18, 70, 156, 148, 109, 161, 34];
}

pub mod legacy_instruction_discriminator {
    pub const CREATE_GROUP: u8 = 0;
    pub const DEPOSIT: u8 = 1;
    pub const WITHDRAW: u8 = 2;
    pub const SWAP: u8 = 3;
    pub const SWAP_REVERSE: u8 = 4;
    pub const SET_GROUP_STATUS: u8 = 5;
    pub const UPDATE_CONFIG: u8 = 6;
    pub const TRANSFER_ADMIN: u8 = 7;
    pub const CLOSE_GROUP: u8 = 8;
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.is_empty() {
        return Err(anchor_error(ANCHOR_INSTRUCTION_MISSING));
    }

    if instruction_data.len() >= 8 {
        let discriminator = &instruction_data[..8];
        let data = &instruction_data[8..];

        if discriminator == instruction_discriminator::CREATE_GROUP.as_ref() {
            return instructions::create_group::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::DEPOSIT.as_ref() {
            return instructions::deposit::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::WITHDRAW.as_ref() {
            return instructions::withdraw::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::SWAP.as_ref() {
            return instructions::swap::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::SWAP_REVERSE.as_ref() {
            return instructions::swap_reverse::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::SET_GROUP_STATUS.as_ref() {
            return instructions::set_status::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::UPDATE_CONFIG.as_ref() {
            return instructions::update_config::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::TRANSFER_ADMIN.as_ref() {
            return instructions::transfer_admin::process(program_id, accounts, data);
        }
        if discriminator == instruction_discriminator::CLOSE_GROUP.as_ref() {
            return instructions::close_group::process(program_id, accounts, data);
        }
    }

    match instruction_data[0] {
        legacy_instruction_discriminator::CREATE_GROUP => {
            instructions::create_group::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::DEPOSIT => {
            instructions::deposit::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::WITHDRAW => {
            instructions::withdraw::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::SWAP => {
            instructions::swap::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::SWAP_REVERSE => {
            instructions::swap_reverse::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::SET_GROUP_STATUS => {
            instructions::set_status::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::UPDATE_CONFIG => {
            instructions::update_config::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::TRANSFER_ADMIN => {
            instructions::transfer_admin::process(program_id, accounts, &instruction_data[1..])
        }
        legacy_instruction_discriminator::CLOSE_GROUP => {
            instructions::close_group::process(program_id, accounts, &instruction_data[1..])
        }
        _ => Err(anchor_error(ANCHOR_FALLBACK_NOT_FOUND)),
    }
}
