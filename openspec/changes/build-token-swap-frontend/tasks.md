## 1. Frontend app foundation

- [x] 1.1 Create the Next.js app structure and shared providers for theme, query state, and Solana runtime
- [x] 1.2 Add a network registry and a persisted network selector for localnet and devnet
- [x] 1.3 Wire the frontend to the existing SDK so the selected cluster drives all protocol reads and writes

## 2. Group discovery and read UX

- [x] 2.1 Build a group list page that loads all groups on the selected network
- [x] 2.2 Show each group's core configuration: admin, input/output mints, rate, fee, status, and vault balances
- [x] 2.3 Add empty, loading, and error states for missing deployments, no groups, and RPC failures

## 3. Group detail and swap UX

- [x] 3.1 Build a group detail page with forward and reverse quote panels
- [x] 3.2 Automatically discover the connected wallet's token accounts and balances for the selected group's mints
- [x] 3.3 Add wallet-gated swap and swapReverse actions using the SDK instruction builders
- [x] 3.4 Show liquidity warnings and disabled states when the relevant vault cannot satisfy the requested swap

## 4. Group creation and admin UX

- [x] 4.1 Build a create-group flow where any connected wallet can choose network, mints, rate, fee, and group ID
- [x] 4.2 Detect when the connected wallet is the current group admin and show the admin panel only in that case
- [x] 4.3 Automatically discover the admin's relevant token accounts and balances for deposit, withdraw, and close-group flows
- [x] 4.4 Add admin actions for deposit, withdraw, pause/resume, update config, transfer admin, and close group

## 5. Product hardening

- [x] 5.1 Add transaction status, signature links, and failure handling for all write flows
- [x] 5.2 Add route-level loading boundaries and client-side state handling for network changes
- [x] 5.3 Add inline help content for swap direction, admin actions, and protocol limitations
- [x] 5.4 Document localnet and devnet setup expectations for frontend developers and testers
