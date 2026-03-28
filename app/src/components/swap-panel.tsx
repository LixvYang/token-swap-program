"use client";

import {
  calculateForwardQuote,
  calculateReverseQuote,
  type SwapGroupSnapshot,
} from "@rebetxin/token-swap-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useSendTransaction } from "@solana/react-hooks";
import { useMemo, useState } from "react";
import { TransactionStatus } from "@/components/transaction-status";
import { formatUiAmount, parseUiAmount, shortAddress } from "@/lib/format";
import { invalidateProtocolQueries, toKitInstructionInput } from "@/lib/protocol";
import { useAppRuntime } from "@/lib/runtime";
import type { DiscoveredTokenAccount } from "@/lib/token-accounts";

type TokenAccountsData = {
  input: DiscoveredTokenAccount;
  output: DiscoveredTokenAccount;
};

interface SwapPanelProps {
  direction: "forward" | "reverse";
  ownerAddress: string | null;
  snapshot: SwapGroupSnapshot;
  tokenAccounts: TokenAccountsData | null;
}

export function SwapPanel({
  direction,
  ownerAddress,
  snapshot,
  tokenAccounts,
}: SwapPanelProps) {
  const queryClient = useQueryClient();
  const { sdk, network, networkId } = useAppRuntime();
  const { send, error, signature, status } = useSendTransaction();
  const [amountText, setAmountText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const panelTitle = direction === "forward" ? "Forward swap" : "Reverse swap";
  const inputMint = direction === "forward" ? snapshot.inputMintInfo : snapshot.outputMintInfo;
  const outputMint = direction === "forward" ? snapshot.outputMintInfo : snapshot.inputMintInfo;
  const sourceAccount = direction === "forward" ? tokenAccounts?.input : tokenAccounts?.output;
  const destinationAccount = direction === "forward" ? tokenAccounts?.output : tokenAccounts?.input;
  const vaultLiquidity =
    direction === "forward" ? snapshot.balances.outputVault : snapshot.balances.inputVault;

  const parsed = useMemo(() => {
    if (!amountText.trim()) {
      return null;
    }

    try {
      const amountIn = parseUiAmount(amountText, inputMint.decimals);
      const quote =
        direction === "forward"
          ? calculateForwardQuote({
              amountIn,
              swapRate: snapshot.swapRate,
              rateDecimals: snapshot.rateDecimals,
              feeBasisPoints: snapshot.feeBasisPoints,
              inputDecimals: snapshot.inputMintInfo.decimals,
              outputDecimals: snapshot.outputMintInfo.decimals,
            })
          : calculateReverseQuote({
              amountIn,
              swapRate: snapshot.swapRate,
              rateDecimals: snapshot.rateDecimals,
              feeBasisPoints: snapshot.feeBasisPoints,
              inputDecimals: snapshot.inputMintInfo.decimals,
              outputDecimals: snapshot.outputMintInfo.decimals,
            });

      return { amountIn, quote, error: null as string | null };
    } catch (caughtError) {
      return {
        amountIn: null,
        quote: null,
        error: caughtError instanceof Error ? caughtError.message : String(caughtError),
      };
    }
  }, [amountText, direction, inputMint.decimals, snapshot]);

  const liquidityOk =
    parsed?.quote && vaultLiquidity !== null
      ? vaultLiquidity >= parsed.quote.netAmountOut
      : false;

  const sourceBalanceOk =
    parsed?.amountIn && sourceAccount && sourceAccount.balanceRaw !== null
      ? sourceAccount.balanceRaw >= parsed.amountIn
      : false;

  const groupIsActive = snapshot.status === 0;
  const canSubmit =
    Boolean(ownerAddress) &&
    Boolean(parsed?.quote) &&
    !parsed?.error &&
    groupIsActive &&
    Boolean(sourceAccount?.exists) &&
    Boolean(destinationAccount?.exists) &&
    liquidityOk &&
    sourceBalanceOk;

  async function handleSubmit() {
    setLocalError(null);

    try {
      if (!ownerAddress) {
        throw new Error("Connect a wallet before swapping");
      }

      if (!parsed?.quote) {
        throw new Error("Enter a valid amount");
      }

      const prepared =
        direction === "forward"
          ? await sdk.buildSwapInstruction({
              user: ownerAddress,
              group: snapshot.address,
              amountIn: parsed.quote.amountIn,
              userInputTokenAccount: tokenAccounts?.input.address,
              userOutputTokenAccount: tokenAccounts?.output.address,
            })
          : await sdk.buildSwapReverseInstruction({
              user: ownerAddress,
              group: snapshot.address,
              amountIn: parsed.quote.amountIn,
              userInputTokenAccount: tokenAccounts?.input.address,
              userOutputTokenAccount: tokenAccounts?.output.address,
            });

      await send({ instructions: [toKitInstructionInput(prepared)] });

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
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  return (
    <section className="panel stack">
      <div>
        <p className="eyebrow">{panelTitle}</p>
        <h2 className="panel-title">
          {direction === "forward"
            ? "Deposit input mint, receive output mint"
            : "Deposit output mint, receive input mint"}
        </h2>
      </div>

      <div className="help-block">
        <div className="help-copy">
          {direction === "forward"
            ? "The wallet sends the group input mint to the input vault. The program pays the output mint from the output vault."
            : "The wallet sends the group output mint to the output vault. The program pays the input mint from the input vault."}
        </div>
      </div>

      <div className="inline-fields">
        <label className="stack">
          <span className="label">You send ({shortAddress(inputMint.address, 6)})</span>
          <input
            className="input"
            onChange={(event) => setAmountText(event.target.value)}
            placeholder={`0.0 (${inputMint.decimals} decimals)`}
            value={amountText}
          />
        </label>
      </div>

      <div className="data-list">
        <div className="data-item">
          <span className="label">Detected source balance</span>
          <span className="value">
            {sourceAccount
              ? sourceAccount.balanceUi
              : "Connect wallet to auto-discover token accounts"}
          </span>
        </div>
        <div className="data-item">
          <span className="label">Payout estimate</span>
          <span className="value">
            {parsed?.quote
              ? formatUiAmount(parsed.quote.netAmountOut, outputMint.decimals)
              : "Enter an amount"}
          </span>
        </div>
        <div className="data-item">
          <span className="label">Fee amount</span>
          <span className="value">
            {parsed?.quote
              ? formatUiAmount(parsed.quote.feeAmount, outputMint.decimals)
              : "Pending"}
          </span>
        </div>
        <div className="data-item">
          <span className="label">Relevant vault liquidity</span>
          <span className="value">{formatUiAmount(vaultLiquidity, outputMint.decimals)}</span>
        </div>
      </div>

      {!groupIsActive ? (
        <div className="warning-box">
          <strong>Group is not active.</strong>
          <div className="help-copy">Only groups in Active state can process swaps.</div>
        </div>
      ) : null}

      {parsed?.error ? (
        <div className="error-box">
          <strong>Amount parsing failed.</strong>
          <div className="help-copy">{parsed.error}</div>
        </div>
      ) : null}

      {tokenAccounts && !sourceAccount?.exists ? (
        <div className="warning-box">
          <strong>Missing source token account.</strong>
          <div className="help-copy">
            Create the detected associated token account before sending this direction.
          </div>
        </div>
      ) : null}

      {tokenAccounts && !destinationAccount?.exists ? (
        <div className="warning-box">
          <strong>Missing destination token account.</strong>
          <div className="help-copy">
            The payout mint needs an associated token account on your wallet before submission.
          </div>
        </div>
      ) : null}

      {parsed?.quote && !liquidityOk ? (
        <div className="warning-box">
          <strong>Liquidity warning.</strong>
          <div className="help-copy">
            The relevant vault cannot currently satisfy the requested payout amount.
          </div>
        </div>
      ) : null}

      {parsed?.quote && !sourceBalanceOk ? (
        <div className="warning-box">
          <strong>Wallet balance too low.</strong>
          <div className="help-copy">
            The detected source token account does not have enough balance for this request.
          </div>
        </div>
      ) : null}

      {localError ? (
        <div className="error-box">
          <strong>Swap request could not be built.</strong>
          <div className="help-copy">{localError}</div>
        </div>
      ) : null}

      <div className="button-row">
        <button className="button" disabled={!canSubmit} onClick={handleSubmit} type="button">
          {direction === "forward" ? "Submit forward swap" : "Submit reverse swap"}
        </button>
      </div>

      <TransactionStatus
        error={error}
        signature={signature?.toString() ?? null}
        status={status}
        idleLabel="Quotes are local; the chain still enforces vault liquidity at execution time."
      />
    </section>
  );
}
