"use client";

import { NETWORKS, type NetworkId } from "@/lib/networks";
import { useAppRuntime } from "@/lib/runtime";

export function NetworkSelector() {
  const { networkId, setNetworkId } = useAppRuntime();

  return (
    <section className="panel">
      <div className="stack">
        <div>
          <p className="eyebrow">Cluster routing</p>
          <h2 className="panel-title">Select the active network</h2>
        </div>
        <div className="cluster-row">
          {Object.values(NETWORKS).map((network) => {
            const active = network.id === networkId;
            return (
              <button
                key={network.id}
                className={`card ${active ? "active-card" : ""}`}
                onClick={() => setNetworkId(network.id as NetworkId)}
                type="button"
              >
                <div className="stack">
                  <div className="nav-row">
                    <strong>{network.label}</strong>
                    <span className="cluster-pill">{active ? "active" : network.badge}</span>
                  </div>
                  <div className="help-copy">{network.description}</div>
                  <div className="help-copy">{network.rpcEndpoint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
