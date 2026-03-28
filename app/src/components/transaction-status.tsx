"use client";

import { getExplorerSignatureUrl } from "@/lib/networks";
import { useAppRuntime } from "@/lib/runtime";

interface TransactionStatusProps {
  error: unknown;
  signature: string | null;
  status: string;
  idleLabel?: string;
}

export function TransactionStatus({
  error,
  signature,
  status,
  idleLabel = "Ready to submit",
}: TransactionStatusProps) {
  const { network } = useAppRuntime();
  const explorerUrl = signature ? getExplorerSignatureUrl(network, signature) : null;

  if (error) {
    return (
      <div className="error-box">
        <strong>Transaction failed.</strong>
        <div className="help-copy">{String(error)}</div>
      </div>
    );
  }

  if (signature) {
    return (
      <div className="success-box">
        <strong>Transaction submitted.</strong>
        <div className="help-copy">Status: {status}</div>
        <div className="help-copy">
          Signature:{" "}
          {explorerUrl ? (
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              {signature}
            </a>
          ) : (
            signature
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="notice">
      <strong>{idleLabel}</strong>
      <div className="help-copy">Status: {status}</div>
    </div>
  );
}
