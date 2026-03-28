## 1. SDK package setup

- [x] 1.1 Create the standalone `sdk/` package structure with package metadata and TypeScript config
- [x] 1.2 Bundle the current Anchor IDL into the package and expose it from the public API

## 2. Read-side integration APIs

- [x] 2.1 Implement group ID conversion helpers and PDA derivation utilities
- [x] 2.2 Implement quote helpers that mirror on-chain forward and reverse swap math
- [x] 2.3 Implement group discovery, single-group fetch, snapshot, and vault balance queries

## 3. Instruction builders

- [x] 3.1 Implement admin instruction builders for create, deposit, withdraw, set status, transfer admin, update config, and close group
- [x] 3.2 Implement user instruction builders for swap and swapReverse with automatic token program detection and default ATA derivation
- [x] 3.3 Add transaction assembly helper(s) for frontend composition

## 4. Package docs and verification

- [x] 4.1 Add SDK README with initialization and usage examples
- [x] 4.2 Run TypeScript verification and fix package-level type issues
