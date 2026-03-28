# Task Plan

## Goal

Create a frontend-usable TypeScript SDK under `sdk/` for the current Anchor IDL, following the repository's existing TypeScript conventions and exposing a stable integration surface for external consumers.

## Phases

| Phase | Status | Notes |
| --- | --- | --- |
| Inspect repo structure and IDL constraints | complete | Root repo has no existing sdk package contents; target IDL and types are available |
| Define sdk package layout and public API | complete | Created a standalone package shape under `sdk/` |
| Implement sdk source files | complete | Added client, IDL, PDA, group ID, math, and builder layers |
| Add package docs/example and verify build | complete | SDK README added, TypeScript build passes, OpenSpec change validates |

## Decisions

- Create a standalone `sdk/` package under the repo root.
- Package will be IDL-backed but will wrap raw Anchor calls behind a cleaner client API.
- Use existing Anchor + web3.js stack for compatibility with the current repo and IDL.
- Avoid leaking raw `[u8; 8]` handling to consumers; expose conversion helpers for `groupId`.

## Risks

- The repo currently has no workspace tooling for nested packages, so the sdk package must be self-contained.
- Anchor's generated TS types live under `target/`, which is not suitable as a publish-time dependency; the SDK should carry its own IDL copy.
