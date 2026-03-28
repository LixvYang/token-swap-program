"use client";

import { AppShell } from "@/components/app-shell";
import { NetworkSelector } from "@/components/network-selector";
import { WalletPanel } from "@/components/wallet-panel";

export function DocsPage() {
  return (
    <AppShell
      title="Read the funding model before you assume the vaults are symmetric."
      summary="The protocol looks simple, but directionality matters: forward swaps and reverse swaps touch different user mints and different vaults."
      caption="These notes mirror the current on-chain behavior, not an idealized AMM design."
    >
      <div className="detail-grid">
        <NetworkSelector />
        <WalletPanel />
      </div>

      <section className="panel-grid">
        <article className="panel stack">
          <div>
            <p className="eyebrow">Swap direction</p>
            <h2 className="panel-title">Forward swap</h2>
          </div>
          <div className="help-copy">
            The user deposits the group&apos;s <strong>input mint</strong> into the <strong>input vault</strong>. The program then pays the <strong>output mint</strong> out of the <strong>output vault</strong>.
          </div>
          <div className="warning-box">
            <strong>Liquidity gate</strong>
            <div className="help-copy">
              Forward swaps fail if the output vault cannot cover the post-fee payout amount.
            </div>
          </div>
        </article>

        <article className="panel stack">
          <div>
            <p className="eyebrow">Swap direction</p>
            <h2 className="panel-title">Reverse swap</h2>
          </div>
          <div className="help-copy">
            The user deposits the <strong>output mint</strong> into the <strong>output vault</strong>. The program pays the <strong>input mint</strong> out of the <strong>input vault</strong>.
          </div>
          <div className="warning-box">
            <strong>Important limitation</strong>
            <div className="help-copy">
              Reverse swaps often start unavailable because admin tooling does not directly seed the input vault.
            </div>
          </div>
        </article>

        <article className="panel stack">
          <div>
            <p className="eyebrow">Admin behavior</p>
            <h2 className="panel-title">Create, fund, pause, transfer, close</h2>
          </div>
          <div className="help-copy">
            Any connected wallet can create a group and becomes that group&apos;s admin. Admin controls appear only for the wallet that matches the on-chain `admin` field.
          </div>
          <div className="help-copy">
            Deposit and withdraw currently operate on the output vault path. Close group marks the group as closed and returns vault funds, but it does not reclaim the group account address from the chain.
          </div>
        </article>

        <article className="panel stack">
          <div>
            <p className="eyebrow">Group IDs</p>
            <h2 className="panel-title">Treat group IDs as globally unique</h2>
          </div>
          <div className="help-copy">
            The current PDA design derives `swap_group` from `["swap_group", group_id]`. That means the same numeric group ID cannot be reused by a different creator on the same program deployment.
          </div>
          <div className="help-copy">
            When you build tooling around this program, generate group IDs intentionally and avoid accidental collisions between environments.
          </div>
        </article>
      </section>
    </AppShell>
  );
}
