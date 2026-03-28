"use client";

import {
  SwapGroupStatus,
  type SwapGroupSnapshot,
} from "@rebetxin/token-swap-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useSendTransaction } from "@solana/react-hooks";
import { useMemo, useState, type PropsWithChildren } from "react";
import { TransactionStatus } from "@/components/transaction-status";
import { formatUiAmount, parseFixedRate, parseUiAmount, shortAddress } from "@/lib/format";
import { invalidateProtocolQueries, toKitInstructionInput } from "@/lib/protocol";
import { useAppRuntime } from "@/lib/runtime";
import type { DiscoveredTokenAccount } from "@/lib/token-accounts";

interface AdminPanelProps {
  ownerAddress: string;
  snapshot: SwapGroupSnapshot;
  tokenAccounts: {
    input: DiscoveredTokenAccount;
    output: DiscoveredTokenAccount;
  } | null;
}

function AdminActionFrame({
  title,
  eyebrow,
  children,
}: PropsWithChildren<{ title: string; eyebrow: string }>) {
  return (
    <section className="panel stack">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="panel-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function AdminPanel({ ownerAddress, snapshot, tokenAccounts }: AdminPanelProps) {
  const isClosed = snapshot.status === SwapGroupStatus.Closed;

  return (
    <div className="stack">
      <div className="warning-box">
        <strong>Admin path caveat</strong>
        <div className="help-copy">
          Deposit and withdraw operate against the output vault. Reverse swaps can still fail if the input vault never accumulated enough inventory.
        </div>
      </div>

      <div className="panel-grid">
        <TreasuryPanel
          ownerAddress={ownerAddress}
          snapshot={snapshot}
          tokenAccounts={tokenAccounts}
        />
        <StatusPanel ownerAddress={ownerAddress} snapshot={snapshot} disabled={isClosed} />
        <ConfigPanel ownerAddress={ownerAddress} snapshot={snapshot} disabled={isClosed} />
        <TransferAdminPanel ownerAddress={ownerAddress} snapshot={snapshot} disabled={isClosed} />
        <ClosePanel
          ownerAddress={ownerAddress}
          snapshot={snapshot}
          tokenAccounts={tokenAccounts}
        />
      </div>
    </div>
  );
}

function TreasuryPanel({
  ownerAddress,
  snapshot,
  tokenAccounts,
}: AdminPanelProps) {
  const queryClient = useQueryClient();
  const { sdk, network, networkId } = useAppRuntime();
  const depositTxn = useSendTransaction();
  const withdrawTxn = useSendTransaction();
  const [amountText, setAmountText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const parsedAmount = useMemo(() => {
    if (!amountText.trim()) {
      return null;
    }

    try {
      return parseUiAmount(amountText, snapshot.outputMintInfo.decimals);
    } catch {
      return null;
    }
  }, [amountText, snapshot.outputMintInfo.decimals]);

  async function runAction(kind: "deposit" | "withdraw") {
    setLocalError(null);

    try {
      if (!parsedAmount) {
        throw new Error("Enter a valid output mint amount");
      }

      if (!tokenAccounts?.output.exists) {
        throw new Error("The admin output token account is missing");
      }

      const prepared =
        kind === "deposit"
          ? await sdk.buildDepositInstruction({
              admin: ownerAddress,
              group: snapshot.address,
              amount: parsedAmount,
              adminOutputTokenAccount: tokenAccounts.output.address,
            })
          : await sdk.buildWithdrawInstruction({
              admin: ownerAddress,
              group: snapshot.address,
              amount: parsedAmount,
              adminOutputTokenAccount: tokenAccounts.output.address,
            });

      const runner = kind === "deposit" ? depositTxn : withdrawTxn;
      await runner.send({ instructions: [toKitInstructionInput(prepared)] });

      await invalidateProtocolQueries(
        queryClient,
        networkId,
        network.programId,
        snapshot.address.toBase58(),
      );
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  return (
    <AdminActionFrame eyebrow="Treasury" title="Fund or drain the output vault">
      <div className="help-copy">
        Output vault balance:{" "}
        {formatUiAmount(snapshot.balances.outputVault, snapshot.outputMintInfo.decimals)}
      </div>
      <div className="help-copy">
        Admin output ATA:{" "}
        {tokenAccounts?.output.exists
          ? shortAddress(tokenAccounts.output.address, 8)
          : "Missing associated token account"}
      </div>
      <label className="stack">
        <span className="label">Output mint amount</span>
        <input
          className="input"
          onChange={(event) => setAmountText(event.target.value)}
          value={amountText}
        />
      </label>
      {localError ? (
        <div className="error-box">
          <strong>Admin treasury action failed.</strong>
          <div className="help-copy">{localError}</div>
        </div>
      ) : null}
      <div className="button-row">
        <button className="button" onClick={() => runAction("deposit")} type="button">
          Deposit output mint
        </button>
        <button className="button secondary" onClick={() => runAction("withdraw")} type="button">
          Withdraw output mint
        </button>
      </div>
      <TransactionStatus
        error={depositTxn.error ?? withdrawTxn.error}
        signature={
          depositTxn.signature?.toString() ??
          withdrawTxn.signature?.toString() ??
          null
        }
        status={depositTxn.status !== "idle" ? depositTxn.status : withdrawTxn.status}
        idleLabel="These instructions only touch the output vault path."
      />
    </AdminActionFrame>
  );
}

function StatusPanel({
  ownerAddress,
  snapshot,
  disabled,
}: {
  ownerAddress: string;
  snapshot: SwapGroupSnapshot;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { sdk, network, networkId } = useAppRuntime();
  const txn = useSendTransaction();
  const [localError, setLocalError] = useState<string | null>(null);

  const nextStatus =
    snapshot.status === SwapGroupStatus.Active
      ? SwapGroupStatus.Paused
      : SwapGroupStatus.Active;

  async function handleSetStatus() {
    setLocalError(null);

    try {
      const prepared = await sdk.buildSetGroupStatusInstruction({
        admin: ownerAddress,
        group: snapshot.address,
        status: nextStatus,
      });

      await txn.send({ instructions: [toKitInstructionInput(prepared)] });

      await invalidateProtocolQueries(
        queryClient,
        networkId,
        network.programId,
        snapshot.address.toBase58(),
      );
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  return (
    <AdminActionFrame eyebrow="State" title="Pause or resume order flow">
      <div className="help-copy">
        Current status: <strong>{snapshot.status === 0 ? "Active" : snapshot.status === 1 ? "Paused" : "Closed"}</strong>
      </div>
      {disabled ? (
        <div className="warning-box">
          <strong>Closed groups are treated as terminal.</strong>
          <div className="help-copy">The UI does not expose reopening closed groups.</div>
        </div>
      ) : null}
      {localError ? (
        <div className="error-box">
          <strong>Status update failed.</strong>
          <div className="help-copy">{localError}</div>
        </div>
      ) : null}
      <div className="button-row">
        <button className="button secondary" disabled={disabled} onClick={handleSetStatus} type="button">
          {nextStatus === SwapGroupStatus.Paused ? "Pause group" : "Resume group"}
        </button>
      </div>
      <TransactionStatus
        error={txn.error}
        signature={txn.signature?.toString() ?? null}
        status={txn.status}
      />
    </AdminActionFrame>
  );
}

function ConfigPanel({
  ownerAddress,
  snapshot,
  disabled,
}: {
  ownerAddress: string;
  snapshot: SwapGroupSnapshot;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { sdk, network, networkId } = useAppRuntime();
  const txn = useSendTransaction();
  const [rateText, setRateText] = useState(
    formatUiAmount(snapshot.swapRate, snapshot.rateDecimals),
  );
  const [rateDecimals, setRateDecimals] = useState(snapshot.rateDecimals.toString());
  const [feeBasisPoints, setFeeBasisPoints] = useState(snapshot.feeBasisPoints.toString());
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleUpdateConfig() {
    setLocalError(null);

    try {
      const parsedRateDecimals = Number(rateDecimals);
      const rawRate = parseFixedRate(rateText, parsedRateDecimals);

      const prepared = await sdk.buildUpdateConfigInstruction({
        admin: ownerAddress,
        group: snapshot.address,
        swapRate: rawRate,
        rateDecimals: parsedRateDecimals,
        feeBasisPoints: Number(feeBasisPoints),
      });

      await txn.send({ instructions: [toKitInstructionInput(prepared)] });

      await invalidateProtocolQueries(
        queryClient,
        networkId,
        network.programId,
        snapshot.address.toBase58(),
      );
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  return (
    <AdminActionFrame eyebrow="Pricing" title="Update rate and fee configuration">
      <div className="inline-fields">
        <label className="stack">
          <span className="label">Human swap rate</span>
          <input className="input" onChange={(event) => setRateText(event.target.value)} value={rateText} />
        </label>
        <label className="stack">
          <span className="label">Rate decimals</span>
          <input
            className="input"
            disabled={disabled}
            onChange={(event) => setRateDecimals(event.target.value)}
            type="number"
            value={rateDecimals}
          />
        </label>
        <label className="stack">
          <span className="label">Fee basis points</span>
          <input
            className="input"
            disabled={disabled}
            onChange={(event) => setFeeBasisPoints(event.target.value)}
            type="number"
            value={feeBasisPoints}
          />
        </label>
      </div>
      {localError ? (
        <div className="error-box">
          <strong>Config update failed.</strong>
          <div className="help-copy">{localError}</div>
        </div>
      ) : null}
      <div className="button-row">
        <button className="button" disabled={disabled} onClick={handleUpdateConfig} type="button">
          Update config
        </button>
      </div>
      <TransactionStatus
        error={txn.error}
        signature={txn.signature?.toString() ?? null}
        status={txn.status}
      />
    </AdminActionFrame>
  );
}

function TransferAdminPanel({
  ownerAddress,
  snapshot,
  disabled,
}: {
  ownerAddress: string;
  snapshot: SwapGroupSnapshot;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { sdk, network, networkId } = useAppRuntime();
  const txn = useSendTransaction();
  const [newAdmin, setNewAdmin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleTransferAdmin() {
    setLocalError(null);

    try {
      const prepared = await sdk.buildTransferAdminInstruction({
        admin: ownerAddress,
        group: snapshot.address,
        newAdmin,
      });

      await txn.send({ instructions: [toKitInstructionInput(prepared)] });

      await invalidateProtocolQueries(
        queryClient,
        networkId,
        network.programId,
        snapshot.address.toBase58(),
      );
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  return (
    <AdminActionFrame eyebrow="Ownership" title="Transfer admin authority">
      <label className="stack">
        <span className="label">New admin wallet</span>
        <input
          className="input"
          disabled={disabled}
          onChange={(event) => setNewAdmin(event.target.value)}
          placeholder="Base58 wallet address"
          value={newAdmin}
        />
      </label>
      <div className="help-copy">
        After confirmation, the current wallet loses access to admin-only actions for this group.
      </div>
      {localError ? (
        <div className="error-box">
          <strong>Admin transfer failed.</strong>
          <div className="help-copy">{localError}</div>
        </div>
      ) : null}
      <div className="button-row">
        <button className="button secondary" disabled={disabled} onClick={handleTransferAdmin} type="button">
          Transfer admin
        </button>
      </div>
      <TransactionStatus
        error={txn.error}
        signature={txn.signature?.toString() ?? null}
        status={txn.status}
      />
    </AdminActionFrame>
  );
}

function ClosePanel({
  ownerAddress,
  snapshot,
  tokenAccounts,
}: AdminPanelProps) {
  const queryClient = useQueryClient();
  const { sdk, network, networkId } = useAppRuntime();
  const txn = useSendTransaction();
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const phrase = "close group";

  async function handleCloseGroup() {
    setLocalError(null);

    try {
      if (confirmPhrase.trim().toLowerCase() !== phrase) {
        throw new Error(`Type "${phrase}" to confirm`);
      }

      if (!tokenAccounts?.input.exists || !tokenAccounts.output.exists) {
        throw new Error("The admin needs both input and output token accounts before closing");
      }

      const prepared = await sdk.buildCloseGroupInstruction({
        admin: ownerAddress,
        group: snapshot.address,
        adminInputTokenAccount: tokenAccounts.input.address,
        adminOutputTokenAccount: tokenAccounts.output.address,
      });

      await txn.send({ instructions: [toKitInstructionInput(prepared)] });

      await invalidateProtocolQueries(
        queryClient,
        networkId,
        network.programId,
        snapshot.address.toBase58(),
      );
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  return (
    <AdminActionFrame eyebrow="Terminal action" title="Close the group">
      <div className="warning-box">
        <strong>This is the final admin action for the group.</strong>
        <div className="help-copy">
          The current program returns vault funds but still keeps the group account address on-chain with closed status.
        </div>
      </div>
      <label className="stack">
        <span className="label">Type "{phrase}" to confirm</span>
        <input
          className="input"
          onChange={(event) => setConfirmPhrase(event.target.value)}
          value={confirmPhrase}
        />
      </label>
      {localError ? (
        <div className="error-box">
          <strong>Close group failed.</strong>
          <div className="help-copy">{localError}</div>
        </div>
      ) : null}
      <div className="button-row">
        <button className="button danger" onClick={handleCloseGroup} type="button">
          Close group
        </button>
      </div>
      <TransactionStatus
        error={txn.error}
        signature={txn.signature?.toString() ?? null}
        status={txn.status}
      />
    </AdminActionFrame>
  );
}
