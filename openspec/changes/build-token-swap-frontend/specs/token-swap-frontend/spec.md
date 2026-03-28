## ADDED Requirements

### Requirement: Frontend SHALL support cluster-aware protocol interaction
The frontend SHALL let the user select between supported Solana networks and SHALL bind all group reads, quotes, and instruction building to the currently selected cluster configuration.

#### Scenario: Switching networks
- **WHEN** a user switches from localnet to devnet or back
- **THEN** the frontend SHALL rebuild its protocol client against the selected cluster and refresh the visible group data for that network

#### Scenario: Missing deployment on selected network
- **WHEN** the selected network does not have the token swap program deployed or has no groups
- **THEN** the frontend SHALL show a clear empty or unavailable state instead of a broken UI

### Requirement: Frontend SHALL expose group discovery and configuration browsing
The frontend SHALL display all currently available groups on the selected network and SHALL show enough configuration to understand how each group behaves before entering a swap flow.

#### Scenario: Browsing groups
- **WHEN** the frontend loads successfully on a network with existing groups
- **THEN** it SHALL list each group's admin, input mint, output mint, swap rate, fee basis points, status, and vault balances

#### Scenario: Viewing a group
- **WHEN** the user opens a specific group detail page
- **THEN** the frontend SHALL show the full group configuration, vault addresses, vault balances, and current quote context for swaps

### Requirement: Frontend SHALL support swap interactions through the SDK
The frontend SHALL let a connected wallet perform forward and reverse swaps using the selected group's current configuration and SHALL use the SDK as the instruction-building boundary.

#### Scenario: Forward swap
- **WHEN** a connected user enters an input amount on a group detail page and submits a forward swap
- **THEN** the frontend SHALL show the computed quote, build the SDK swap instruction for that group, and submit the transaction through the connected wallet

#### Scenario: Reverse swap with insufficient liquidity
- **WHEN** a connected user attempts a reverse swap and the relevant input vault cannot satisfy the payout
- **THEN** the frontend SHALL block or warn before submission and communicate the liquidity issue clearly

### Requirement: Frontend SHALL auto-discover relevant token accounts
The frontend SHALL automatically load the connected wallet's and current admin's relevant token accounts and balances for the currently selected group mints, so common flows do not require users to manually enter token account addresses.

#### Scenario: User swap account discovery
- **WHEN** a connected wallet opens a group detail page
- **THEN** the frontend SHALL discover the wallet's token accounts for the group's input and output mints, display the detected balances, and use those accounts as the default swap accounts

#### Scenario: Admin token account discovery
- **WHEN** the current group admin opens the admin panel for a group
- **THEN** the frontend SHALL discover the admin's relevant token accounts for deposit, withdraw, and close-group actions and display the detected balances before submission

#### Scenario: Missing token account
- **WHEN** the frontend cannot find a required token account for the connected wallet or admin
- **THEN** it SHALL explain the missing-account condition clearly and avoid forcing the user to paste a raw token account address for the default path

### Requirement: Frontend SHALL support open group creation and admin management
Any connected wallet SHALL be able to create a new group and become its admin, and the frontend SHALL expose admin management controls only to the current on-chain admin of a group.

#### Scenario: Creating a group
- **WHEN** a connected wallet submits valid create-group parameters
- **THEN** the frontend SHALL build the create-group instruction through the SDK and, after confirmation, show the newly created group with the connected wallet as admin

#### Scenario: Viewing admin controls
- **WHEN** the connected wallet matches the selected group's current `admin`
- **THEN** the frontend SHALL show deposit, withdraw, pause/resume, update config, transfer admin, and close-group actions for that group

#### Scenario: Non-admin user on a group page
- **WHEN** the connected wallet does not match the selected group's current `admin`
- **THEN** the frontend SHALL hide or disable admin-only controls while preserving read-only browsing and swap actions

### Requirement: Frontend SHALL explain protocol behavior in-product
The frontend SHALL provide concise in-product guidance and supporting documentation that help users understand network selection, swap direction, admin-only behavior, and known protocol limitations.

#### Scenario: Inline swap guidance
- **WHEN** a user opens a swap panel
- **THEN** the frontend SHALL explain which mint is being deposited, which vault pays out, and any current liquidity constraints relevant to the selected direction

#### Scenario: Admin help content
- **WHEN** an admin opens the create-group or admin management interface
- **THEN** the frontend SHALL provide guidance about group ID uniqueness, admin ownership, vault funding expectations, and the current limitation that deposit and withdraw operate on the output vault path
