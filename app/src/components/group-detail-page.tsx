"use client";

import { buildCreateAssociatedTokenAccountInstruction } from "@/lib/token-accounts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendTransaction, useWalletSession } from "@solana/react-hooks";
import { PublicKey } from "@solana/web3.js";
import { AppShell } from "@/components/app-shell";
import { AdminPanel } from "@/components/admin-panel";
import { SwapPanel } from "@/components/swap-panel";
import { TransactionStatus } from "@/components/transaction-status";
import { WalletPanel } from "@/components/wallet-panel";
import {
  describeGroupId,
  formatFeeBps,
  formatRate,
  formatStatus,
  formatTimestamp,
  formatUiAmount,
  shortAddress,
} from "@/lib/format";
import {
  invalidateProtocolQueries,
  toKitInstructionInput,
  useConnectedOwnerAddress,
  useGroupQuery,
  useIsCurrentAdmin,
  useOwnerTokenAccounts,
} from "@/lib/protocol";
import { useAppRuntime } from "@/lib/runtime";

export function GroupDetailPage({ address }: { address: string }) {
  const groupQuery = useGroupQuery(address);
  const ownerAddress = useConnectedOwnerAddress();
  const accountsQuery = useOwnerTokenAccounts(groupQuery.data ?? null, ownerAddress);
  const isCurrentAdmin = useIsCurrentAdmin(groupQuery.data ?? null);

  const title = groupQuery.data
    ? `Group ${shortAddress(groupQuery.data.address, 8)}`
    : "Group detail";
  const summary = groupQuery.data
    ? `Inspect the full configuration, wallet token accounts, quotes, and admin controls for ${shortAddress(groupQuery.data.inputMint, 6)} → ${shortAddress(groupQuery.data.outputMint, 6)}.`
    : "Load a specific group address to inspect configuration, quotes, and admin operations.";

  return (
    <AppShell
      title={title}
      summary={summary}
      eyebrow="Group workspace"
      caption="Forward swap uses output vault liquidity. Reverse swap uses input vault liquidity."
    >
      <div className="detail-grid">
        <WalletPanel />
        <section className="panel stack">
          <div>
            <p className="eyebrow">Address</p>
            <h2 className="panel-title">Selected group</h2>
          </div>
          <div className="help-copy">{address}</div>
          <div className="notice">
            <strong>Auto-discovery model</strong>
            <div className="help-copy">
              The page derives the connected wallet&apos;s token accounts for the group mints automatically. No manual token account entry is required for the default flow.
            </div>
          </div>
        </section>
      </div>

      {groupQuery.isLoading ? (
        <section className="panel ghost-panel">
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </section>
      ) : groupQuery.isError ? (
        <section className="panel">
          <div className="error-box">
            <strong>Failed to load the requested group.</strong>
            <div className="help-copy">{String(groupQuery.error)}</div>
          </div>
        </section>
      ) : !groupQuery.data ? (
        <section className="panel">
          <div className="warning-box">
            <strong>Group not found.</strong>
            <div className="help-copy">
              This address does not resolve to a swap group on the currently selected network.
            </div>
          </div>
        </section>
      ) : (
        <>
          <GroupOverview snapshot={groupQuery.data} />
          <TokenAccountsPanel
            ownerAddress={ownerAddress}
            query={accountsQuery}
            snapshot={groupQuery.data}
          />
          <div className="panel-grid">
            <SwapPanel
              direction="forward"
              ownerAddress={ownerAddress}
              snapshot={groupQuery.data}
              tokenAccounts={accountsQuery.data ?? null}
            />
            <SwapPanel
              direction="reverse"
              ownerAddress={ownerAddress}
              snapshot={groupQuery.data}
              tokenAccounts={accountsQuery.data ?? null}
            />
          </div>

          {isCurrentAdmin ? (
            <section className="stack">
              <div>
                <p className="eyebrow">Admin panel</p>
                <h2 className="panel-title">Admin-only group controls</h2>
              </div>
              <AdminPanel
                ownerAddress={ownerAddress!}
                snapshot={groupQuery.data}
                tokenAccounts={accountsQuery.data ?? null}
              />
            </section>
          ) : (
            <section className="panel">
              <div className="notice">
                <strong>Read-only mode for this wallet.</strong>
                <div className="help-copy">
                  Admin controls only appear when the connected wallet matches the group&apos;s current on-chain admin field.
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

function GroupOverview({
  snapshot,
}: {
  snapshot: NonNullable<ReturnType<typeof useGroupQuery>["data"]>;
}) {
  const statusClass =
    snapshot.status === 0 ? "active" : snapshot.status === 1 ? "paused" : "closed";

  return (
    <section className="panel stack">
      <div className="nav-row">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2 className="panel-title">On-chain group state</h2>
        </div>
        <span className={`status-pill ${statusClass}`}>{formatStatus(snapshot.status)}</span>
      </div>

      <div className="data-list">
        <div className="data-item">
          <span className="label">Group ID</span>
          <span className="value">{describeGroupId(snapshot)}</span>
        </div>
        <div className="data-item">
          <span className="label">Admin</span>
          <span className="value">{snapshot.admin.toBase58()}</span>
        </div>
        <div className="data-item">
          <span className="label">Input mint</span>
          <span className="value">{snapshot.inputMint.toBase58()}</span>
        </div>
        <div className="data-item">
          <span className="label">Output mint</span>
          <span className="value">{snapshot.outputMint.toBase58()}</span>
        </div>
        <div className="data-item">
          <span className="label">Rate</span>
          <span className="value">{formatRate(snapshot)}</span>
        </div>
        <div className="data-item">
          <span className="label">Fee</span>
          <span className="value">{formatFeeBps(snapshot.feeBasisPoints)}</span>
        </div>
        <div className="data-item">
          <span className="label">Created</span>
          <span className="value">{formatTimestamp(snapshot.createdAt)}</span>
        </div>
        <div className="data-item">
          <span className="label">Updated</span>
          <span className="value">{formatTimestamp(snapshot.updatedAt)}</span>
        </div>
      </div>

      <div className="token-grid">
        <div className="card stack">
          <span className="label">Input vault</span>
          <span className="value">{snapshot.vaults.inputVault.toBase58()}</span>
          <span className="value strong">
            {formatUiAmount(snapshot.balances.inputVault, snapshot.inputMintInfo.decimals)}
          </span>
        </div>
        <div className="card stack">
          <span className="label">Output vault</span>
          <span className="value">{snapshot.vaults.outputVault.toBase58()}</span>
          <span className="value strong">
            {formatUiAmount(snapshot.balances.outputVault, snapshot.outputMintInfo.decimals)}
          </span>
        </div>
      </div>
    </section>
  );
}

function TokenAccountsPanel({
  ownerAddress,
  query,
  snapshot,
}: {
  ownerAddress: string | null;
  query: ReturnType<typeof useOwnerTokenAccounts>;
  snapshot: NonNullable<ReturnType<typeof useGroupQuery>["data"]>;
}) {
  const queryClient = useQueryClient();
  const { network, networkId } = useAppRuntime();
  const inputAtaTxn = useSendTransaction();
  const outputAtaTxn = useSendTransaction();
  const session = useWalletSession();

  async function createAssociatedAccount(kind: "input" | "output") {
    if (!session || !ownerAddress) {
      return;
    }

      const mint = kind === "input" ? snapshot.inputMintInfo : snapshot.outputMintInfo;
      const walletPublicKey = new PublicKey(ownerAddress);
      const instruction = buildCreateAssociatedTokenAccountInstruction({
        payer: walletPublicKey,
        owner: walletPublicKey,
        mint,
      });

    const runner = kind === "input" ? inputAtaTxn : outputAtaTxn;
    await runner.send({ instructions: [toKitInstructionInput(instruction)] });

    await Promise.all([
      invalidateProtocolQueries(
        queryClient,
        networkId,
        network.programId,
        snapshot.address.toBase58(),
      ),
      queryClient.invalidateQueries({
        queryKey: [
          "token-accounts",
          networkId,
          snapshot.address.toBase58(),
          ownerAddress,
        ],
      }),
    ]);
  }

  return (
    <section className="panel stack">
      <div className="nav-row">
        <div>
          <p className="eyebrow">Auto-discovered token accounts</p>
          <h2 className="panel-title">Wallet defaults for swap and admin flows</h2>
        </div>
        <span className="tag">{ownerAddress ? shortAddress(ownerAddress, 8) : "Wallet not connected"}</span>
      </div>

      {!ownerAddress ? (
        <div className="notice">
          <strong>Connect a wallet to discover token accounts.</strong>
          <div className="help-copy">
            The page will derive the associated token accounts for both group mints automatically.
          </div>
        </div>
      ) : query.isLoading ? (
        <div className="token-grid">
          <div className="card">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line" />
          </div>
          <div className="card">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line" />
          </div>
        </div>
      ) : query.isError ? (
        <div className="error-box">
          <strong>Token account discovery failed.</strong>
          <div className="help-copy">{String(query.error)}</div>
        </div>
      ) : query.data ? (
        <>
          <div className="token-grid">
            <TokenAccountCard
              action={inputAtaTxn}
              description="Used as sender for forward swaps and recipient for reverse swaps."
              label="Input mint account"
              onCreate={() => createAssociatedAccount("input")}
              tokenAccount={query.data.input}
            />
            <TokenAccountCard
              action={outputAtaTxn}
              description="Used as recipient for forward swaps and sender for reverse swaps."
              label="Output mint account"
              onCreate={() => createAssociatedAccount("output")}
              tokenAccount={query.data.output}
            />
          </div>

          <TransactionStatus
            error={inputAtaTxn.error ?? outputAtaTxn.error}
            signature={
              inputAtaTxn.signature?.toString() ??
              outputAtaTxn.signature?.toString() ??
              null
            }
            status={inputAtaTxn.status !== "idle" ? inputAtaTxn.status : outputAtaTxn.status}
            idleLabel="If an associated token account is missing, create it here and the rest of the UI will use it automatically."
          />
        </>
      ) : null}
    </section>
  );
}

function TokenAccountCard({
  action,
  description,
  label,
  onCreate,
  tokenAccount,
}: {
  action: ReturnType<typeof useSendTransaction>;
  description: string;
  label: string;
  onCreate: () => Promise<void>;
  tokenAccount: NonNullable<ReturnType<typeof useOwnerTokenAccounts>["data"]>["input"];
}) {
  return (
    <div className="card stack">
      <span className="label">{label}</span>
      <div className="value">{tokenAccount.address.toBase58()}</div>
      <div className="help-copy">{description}</div>
      <div className="value strong">{tokenAccount.exists ? tokenAccount.balanceUi : "Missing"}</div>
      {!tokenAccount.exists ? (
        <button className="button secondary" onClick={onCreate} type="button">
          {action.isSending ? "Creating account…" : "Create associated token account"}
        </button>
      ) : null}
    </div>
  );
}
