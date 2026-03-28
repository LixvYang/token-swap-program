"use client";

import { groupIdFromU64LE } from "@rebetxin/token-swap-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useSendTransaction, useWalletSession } from "@solana/react-hooks";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NetworkSelector } from "@/components/network-selector";
import { TransactionStatus } from "@/components/transaction-status";
import { WalletPanel } from "@/components/wallet-panel";
import { groupIdToHex, parseFixedRate, shortAddress } from "@/lib/format";
import {
  invalidateProtocolQueries,
  toKitInstructionInput,
} from "@/lib/protocol";
import { useAppRuntime } from "@/lib/runtime";

function parseGroupId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Group ID is required");
  }

  return groupIdFromU64LE(BigInt(trimmed));
}

export function CreateGroupPage() {
  const session = useWalletSession();
  const queryClient = useQueryClient();
  const { network, networkId, sdk } = useAppRuntime();
  const { send, error, signature, status } = useSendTransaction();

  const [groupIdText, setGroupIdText] = useState(() => Date.now().toString());
  const [inputMint, setInputMint] = useState("");
  const [outputMint, setOutputMint] = useState("");
  const [rateText, setRateText] = useState("1");
  const [rateDecimals, setRateDecimals] = useState("0");
  const [feeBasisPoints, setFeeBasisPoints] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      const groupId = parseGroupId(groupIdText);
      const [swapGroup] = sdk.deriveSwapGroupAddress(groupId);
      return {
        groupId,
        groupHex: groupIdToHex(groupId),
        swapGroup: swapGroup.toBase58(),
      };
    } catch {
      return null;
    }
  }, [groupIdText, sdk]);

  async function handleCreateGroup() {
    setFormError(null);

    try {
      if (!session) {
        throw new Error("Connect a wallet before creating a group");
      }

      const groupId = parseGroupId(groupIdText);
      const parsedRateDecimals = Number(rateDecimals);
      const parsedFeeBasisPoints = Number(feeBasisPoints);
      const rawRate = parseFixedRate(rateText, parsedRateDecimals);

      const prepared = await sdk.buildCreateGroupInstruction({
        admin: session.account.address.toString(),
        groupId,
        inputMint,
        outputMint,
        swapRate: rawRate,
        rateDecimals: parsedRateDecimals,
        feeBasisPoints: parsedFeeBasisPoints,
      });

      await send({
        instructions: [toKitInstructionInput(prepared)],
      });

      await invalidateProtocolQueries(
        queryClient,
        networkId,
        network.programId,
        preview?.swapGroup,
      );
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  return (
    <AppShell
      title="Anyone can open a new group and take admin control."
      summary="A group is a fixed input/output mint pair plus rate, fee, and vault PDAs. The creating wallet becomes admin immediately after confirmation."
      caption="Group IDs are globally unique under the current PDA scheme. Reusing a group ID will hit the same PDA and fail."
    >
      <div className="detail-grid">
        <NetworkSelector />
        <WalletPanel />
      </div>

      <section className="panel">
        <div className="stack">
          <div>
            <p className="eyebrow">Create group</p>
            <h2 className="panel-title">Define the pair and the pricing model</h2>
          </div>

          <div className="warning-box">
            <strong>Admin funding expectations</strong>
            <div className="help-copy">
              The current program only exposes admin deposit and withdraw flows for the output vault. Reverse swaps rely on input vault liquidity that usually accumulates from prior forward swaps.
            </div>
          </div>

          <div className="inline-fields">
            <label className="stack">
              <span className="label">Group ID (u64)</span>
              <input
                className="input"
                onChange={(event) => setGroupIdText(event.target.value)}
                value={groupIdText}
              />
            </label>
            <label className="stack">
              <span className="label">Input mint</span>
              <input
                className="input"
                onChange={(event) => setInputMint(event.target.value)}
                placeholder="Base58 mint address"
                value={inputMint}
              />
            </label>
            <label className="stack">
              <span className="label">Output mint</span>
              <input
                className="input"
                onChange={(event) => setOutputMint(event.target.value)}
                placeholder="Base58 mint address"
                value={outputMint}
              />
            </label>
          </div>

          <div className="inline-fields">
            <label className="stack">
              <span className="label">Human swap rate</span>
              <input
                className="input"
                onChange={(event) => setRateText(event.target.value)}
                placeholder="1"
                value={rateText}
              />
            </label>
            <label className="stack">
              <span className="label">Rate decimals</span>
              <input
                className="input"
                min="0"
                onChange={(event) => setRateDecimals(event.target.value)}
                type="number"
                value={rateDecimals}
              />
            </label>
            <label className="stack">
              <span className="label">Fee basis points</span>
              <input
                className="input"
                min="0"
                onChange={(event) => setFeeBasisPoints(event.target.value)}
                type="number"
                value={feeBasisPoints}
              />
            </label>
          </div>

          {preview ? (
            <div className="notice">
              <strong>PDA preview</strong>
              <div className="help-copy">Group bytes: 0x{preview.groupHex}</div>
              <div className="help-copy">Swap group PDA: {shortAddress(preview.swapGroup, 8)}</div>
            </div>
          ) : (
            <div className="warning-box">
              <strong>Group ID preview unavailable</strong>
              <div className="help-copy">
                The group ID must fit into an unsigned 64-bit integer.
              </div>
            </div>
          )}

          {formError ? (
            <div className="error-box">
              <strong>Form validation failed.</strong>
              <div className="help-copy">{formError}</div>
            </div>
          ) : null}

          <div className="button-row">
            <button className="button" disabled={!session} onClick={handleCreateGroup} type="button">
              Create group on {network.label}
            </button>
          </div>

          <TransactionStatus
            error={error}
            signature={signature?.toString() ?? null}
            status={status}
            idleLabel="Submit when you are comfortable with the final PDA preview."
          />
        </div>
      </section>
    </AppShell>
  );
}
