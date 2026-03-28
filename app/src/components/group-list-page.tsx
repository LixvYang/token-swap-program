"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NetworkSelector } from "@/components/network-selector";
import { WalletPanel } from "@/components/wallet-panel";
import {
  describeGroupId,
  formatFeeBps,
  formatRate,
  formatStatus,
  formatUiAmount,
  shortAddress,
} from "@/lib/format";
import { useGroupsQuery } from "@/lib/protocol";

export function GroupListPage() {
  const groupsQuery = useGroupsQuery();

  return (
    <AppShell
      title="Observe every live group before you touch liquidity."
      summary="Switch networks, inspect every deployed swap group, and understand which vault pays which asset before a single transaction is signed."
      caption="The list below is bound to the currently selected cluster. Empty states mean either no deployment or no groups on that network."
    >
      <div className="detail-grid">
        <NetworkSelector />
        <WalletPanel />
      </div>

      <section className="panel">
        <div className="stack">
          <div className="nav-row">
            <div>
              <p className="eyebrow">Group directory</p>
              <h2 className="panel-title">Current on-chain groups</h2>
            </div>
            <Link className="button secondary" href="/create">
              Create a new group
            </Link>
          </div>

          {groupsQuery.isLoading ? (
            <div className="group-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="card" key={index}>
                  <div className="skeleton-line skeleton-title" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line skeleton-short" />
                </div>
              ))}
            </div>
          ) : groupsQuery.isError ? (
            <div className="error-box">
              <strong>Unable to load groups.</strong>
              <div className="help-copy">{String(groupsQuery.error)}</div>
            </div>
          ) : !groupsQuery.data?.deployed ? (
            <div className="warning-box">
              <strong>No program deployment detected on this network.</strong>
              <div className="help-copy">
                The selected cluster does not currently expose the configured token swap program ID.
              </div>
            </div>
          ) : groupsQuery.data.groups.length === 0 ? (
            <div className="notice">
              <strong>No groups exist yet.</strong>
              <div className="help-copy">
                Any connected wallet can create the first group and become that group&apos;s admin.
              </div>
            </div>
          ) : (
            <ul className="list-reset group-grid">
              {groupsQuery.data.groups.map((group) => {
                const statusClass =
                  group.status === 0 ? "active" : group.status === 1 ? "paused" : "closed";

                return (
                  <li key={group.address.toBase58()}>
                    <Link className="card" href={`/groups/${group.address.toBase58()}`}>
                      <div className="stack">
                        <div className="nav-row">
                          <strong>{shortAddress(group.address, 6)}</strong>
                          <span className={`status-pill ${statusClass}`}>
                            {formatStatus(group.status)}
                          </span>
                        </div>
                        <div className="data-list">
                          <div className="data-item">
                            <span className="label">Group ID</span>
                            <span className="value">{describeGroupId(group)}</span>
                          </div>
                          <div className="data-item">
                            <span className="label">Admin</span>
                            <span className="value">{shortAddress(group.admin, 6)}</span>
                          </div>
                          <div className="data-item">
                            <span className="label">Input mint</span>
                            <span className="value">{shortAddress(group.inputMint, 6)}</span>
                          </div>
                          <div className="data-item">
                            <span className="label">Output mint</span>
                            <span className="value">{shortAddress(group.outputMint, 6)}</span>
                          </div>
                          <div className="data-item">
                            <span className="label">Swap rate</span>
                            <span className="value">{formatRate(group)}</span>
                          </div>
                          <div className="data-item">
                            <span className="label">Fee</span>
                            <span className="value">{formatFeeBps(group.feeBasisPoints)}</span>
                          </div>
                          <div className="data-item">
                            <span className="label">Input vault</span>
                            <span className="value">
                              {formatUiAmount(
                                group.balances.inputVault,
                                group.inputMintInfo.decimals,
                              )}
                            </span>
                          </div>
                          <div className="data-item">
                            <span className="label">Output vault</span>
                            <span className="value">
                              {formatUiAmount(
                                group.balances.outputVault,
                                group.outputMintInfo.decimals,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </AppShell>
  );
}
