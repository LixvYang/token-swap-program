## Context

The on-chain program already exposes all required instructions, and the repository now includes a dedicated SDK that handles IDL loading, PDA derivation, quote math, group discovery, and instruction building. The frontend should consume that SDK rather than reimplement protocol logic inside React components. The user explicitly needs network switching between at least localnet and devnet, automatic discovery of on-chain groups, detailed group configuration display, swapping, and an admin experience where any wallet can create a group and manage groups it owns.

Solana's official frontend guidance currently points developers toward `@solana/client`, `@solana/react-hooks`, and `@solana/kit` for modern React integrations, while `@solana/web3-compat` is the compatibility path for web3.js-based code. Because the current SDK and program integration still use Anchor and web3.js types, the frontend should initially keep a thin compatibility boundary rather than rewriting the whole client stack at once. Next.js App Router remains the right fit for product UI, routing, and progressive rendering. This is an architecture decision inferred from the current repo structure and aligned with official docs. [Sources: Solana Frontend docs, Solana Kit frontend docs, Next.js data-fetching docs]

## Goals / Non-Goals

**Goals:**
- Provide a single frontend that can read from localnet or devnet based on user selection.
- Show all existing groups on the selected network with key configuration and liquidity data.
- Provide group detail pages with swap quoting and transaction submission.
- Provide a create-group flow for any connected wallet.
- Show admin controls only when the connected wallet matches `swap_group.admin`.
- Automatically discover the connected wallet's and group admin's relevant token accounts for the currently viewed mints.
- Explain protocol behavior and operational constraints through inline help and lightweight documentation.
- Keep protocol logic centralized in the SDK.

**Non-Goals:**
- Support every possible cluster at launch.
- Build a custom indexer or backend service before proving the direct-RPC flow.
- Add fiat ramps, analytics, or social features.
- Introduce a separate admin backend; group ownership is determined on-chain.

## Decisions

### Use Next.js App Router for the product shell
Use Next.js App Router so the application has strong routing for the group list, group details, and create/admin flows, while still allowing client-side Solana wallet interactions where needed.

Alternative considered:
- A pure client-side Vite app. Rejected because the app benefits from structured routing and future server-rendered marketing/documentation pages.

### Keep reads network-aware and mostly client-driven
Group discovery and group detail reads should run against the selected cluster in the browser so the user can switch localnet/devnet instantly without coupling to a server-side deployment environment. Route-level loading states and suspense boundaries can still structure the UI.

Alternative considered:
- Server-side RPC reads in Next.js route handlers. Rejected for V1 because cluster selection is user-controlled and the UX is simpler when the browser owns the selected RPC endpoint.

### Use the SDK as the single protocol boundary
The frontend should not call raw Anchor `program.methods.*` directly. Instead, it should use the SDK for:
- group discovery
- PDA derivation
- mint metadata and vault balance reads
- quote computation
- instruction building

Alternative considered:
- Let the frontend rederive everything from IDL directly. Rejected because it would duplicate logic already moved into the SDK.

### Separate read-only browsing from wallet-required actions
The group list and group details should be browsable without a wallet connection. Wallet connection is only required for:
- create group
- swap
- swap reverse
- admin actions

Alternative considered:
- Require wallet connection for the whole app. Rejected because it adds friction and hides public liquidity state that is already readable on-chain.

### Auto-discover token accounts instead of asking users to paste token addresses
For swap and admin flows, the frontend should derive or discover the relevant token accounts automatically from the connected wallet and the selected group mints. For the common case, the app should default to ATA-based discovery and show balances next to each action. If a required token account is missing, the UI should explain that condition rather than asking the user to manually paste an address.

Alternative considered:
- Require manual token account entry for user and admin actions. Rejected because it is error-prone, hostile to non-technical users, and unnecessary for the common ATA path.

### Ship product guidance as both inline help and supporting docs
The frontend should include contextual help near swap, create-group, and admin forms, and it should also ship a dedicated help or setup document for localnet/devnet usage and protocol caveats.

Alternative considered:
- Rely only on README-level developer docs. Rejected because end users and testers need guidance inside the UI as they perform actions.

### Use a network config registry rather than hardcoded logic in components
Create a central cluster registry describing:
- cluster key: `localnet`, `devnet`
- RPC URL
- program ID override if needed
- label and availability

All SDK clients and wallet actions should derive from the selected registry entry.

Alternative considered:
- Scatter RPC/program constants across pages and components. Rejected because it makes cluster switching error-prone.

## Risks / Trade-offs

- [Program deployment mismatch across clusters] → Show clear empty/error states when the selected cluster does not have the program deployed or has no groups.
- [Direct RPC discovery may get slower as groups grow] → Start with direct SDK reads, and add indexed caching only if scale demands it.
- [Wallet + Next.js boundary can get messy] → Isolate wallet providers and transaction send flows in client components only.
- [SDK still uses Anchor/web3.js internally] → Keep this as a contained compatibility layer for V1, then evaluate migration to newer Solana client stacks later.
- [Token account auto-discovery may miss non-ATA custom accounts] → Default to ATA discovery for V1, show the detected account and balance explicitly, and defer advanced custom-account selection to a later version if needed.

## Open Questions

- Whether to show token metadata beyond mint addresses in V1, or keep the initial UI mint-address-first.
- Whether devnet should be enabled by default if the program is not yet deployed there.
- Whether V1 should expose an advanced override for non-ATA token accounts or keep the UX strictly auto-discovered.
