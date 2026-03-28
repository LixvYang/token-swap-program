"use client";

import { lamportsToSolString } from "@solana/client";
import { useBalance, useWalletConnection } from "@solana/react-hooks";
import { shortAddress } from "@/lib/format";

export function WalletPanel() {
  const {
    connectors,
    connect,
    disconnect,
    wallet,
    status,
    currentConnector,
  } = useWalletConnection();
  const address = wallet?.account.address?.toString();
  const balance = useBalance(wallet?.account.address);

  return (
    <section className="panel">
      <div className="stack">
        <div>
          <p className="eyebrow">Wallet session</p>
          <h2 className="panel-title">Connect once, then swap or administer</h2>
        </div>

        {status === "connected" && address ? (
          <div className="stack">
            <div className="data-list">
              <div className="data-item">
                <span className="label">Connector</span>
                <span className="value strong">{currentConnector?.name ?? "Wallet Standard"}</span>
              </div>
              <div className="data-item">
                <span className="label">Address</span>
                <span className="value">{shortAddress(address, 6)}</span>
              </div>
              <div className="data-item">
                <span className="label">SOL</span>
                <span className="value">
                  {balance.lamports ? lamportsToSolString(balance.lamports) : "Loading"}
                </span>
              </div>
            </div>
            <div className="button-row">
              <button className="button secondary" onClick={() => disconnect()} type="button">
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <p className="help-copy">
              The app reads groups without a wallet, but any swap or admin write requires a connected Wallet Standard wallet.
            </p>
            <div className="wallet-grid">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  className="connector-button"
                  disabled={!connector.ready}
                  onClick={() => connect(connector.id)}
                  type="button"
                >
                  Connect {connector.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
