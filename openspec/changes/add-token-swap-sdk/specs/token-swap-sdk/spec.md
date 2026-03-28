## ADDED Requirements

### Requirement: SDK SHALL initialize from the current program IDL
The SDK SHALL expose a client that can be initialized with a Solana connection and an optional program ID override while defaulting to the repository's current deployed program ID.

#### Scenario: Default initialization
- **WHEN** a consumer initializes the SDK with only a Solana connection
- **THEN** the SDK SHALL create a client bound to the bundled IDL and the default token swap program ID

#### Scenario: Program override
- **WHEN** a consumer initializes the SDK with a custom program ID
- **THEN** the SDK SHALL bind instruction builders and PDA derivation to that override

### Requirement: SDK SHALL provide group discovery and PDA derivation
The SDK SHALL allow consumers to derive `swap_group`, `input_vault`, and `output_vault` addresses from a group identifier and fetch existing on-chain groups without manually parsing account discriminators.

#### Scenario: Derive PDA addresses from group ID
- **WHEN** a consumer passes a valid 8-byte group ID into the SDK
- **THEN** the SDK SHALL return the deterministic `swap_group`, `input_vault`, and `output_vault` addresses for the current program ID

#### Scenario: List groups
- **WHEN** a consumer requests all groups from the client
- **THEN** the SDK SHALL return decoded `SwapGroup` data for all current on-chain groups

### Requirement: SDK SHALL mirror on-chain quote math
The SDK SHALL expose forward and reverse quote helpers that mirror the current on-chain formulas, including rate decimals and fee basis points.

#### Scenario: Forward quote
- **WHEN** a consumer requests a forward quote for a group and input amount
- **THEN** the SDK SHALL return the raw output amount, fee amount, and net output amount using the same arithmetic model as the program

#### Scenario: Reverse quote
- **WHEN** a consumer requests a reverse quote for a group and input amount
- **THEN** the SDK SHALL return the raw output amount, fee amount, and net output amount using the reverse swap formula implemented on-chain

### Requirement: SDK SHALL build instructions for all current entrypoints
The SDK SHALL provide instruction builders for every currently supported program instruction and SHALL derive default token accounts and token program IDs when possible.

#### Scenario: Build create group instruction
- **WHEN** a consumer requests a create-group instruction with group parameters and mint addresses
- **THEN** the SDK SHALL derive the group and vault PDAs, resolve token program IDs, and return a valid Anchor instruction

#### Scenario: Build swap instruction
- **WHEN** a consumer requests a swap or reverse-swap instruction with a user address and a group reference
- **THEN** the SDK SHALL derive or accept the relevant token accounts and return a valid Anchor instruction for the requested direction
