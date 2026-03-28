import { TOKEN_SWAP_PROGRAM_ADDRESS } from "@rebetxin/token-swap-sdk";

export type NetworkId = "localnet" | "devnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  rpcEndpoint: string;
  websocketEndpoint: string;
  explorerCluster: "devnet" | null;
  programId: string;
  badge: string;
  description: string;
}

const LOCALNET_PROGRAM_ID =
  process.env.NEXT_PUBLIC_LOCALNET_PROGRAM_ID ?? TOKEN_SWAP_PROGRAM_ADDRESS;
const DEVNET_PROGRAM_ID =
  process.env.NEXT_PUBLIC_DEVNET_PROGRAM_ID ?? TOKEN_SWAP_PROGRAM_ADDRESS;

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  localnet: {
    id: "localnet",
    label: "Localnet",
    rpcEndpoint: process.env.NEXT_PUBLIC_LOCALNET_RPC ?? "http://127.0.0.1:8899",
    websocketEndpoint: process.env.NEXT_PUBLIC_LOCALNET_WS ?? "ws://127.0.0.1:8900",
    explorerCluster: null,
    programId: LOCALNET_PROGRAM_ID,
    badge: "localhost validator",
    description: "For local validator testing and admin flow verification.",
  },
  devnet: {
    id: "devnet",
    label: "Devnet",
    rpcEndpoint: process.env.NEXT_PUBLIC_DEVNET_RPC ?? "https://api.devnet.solana.com",
    websocketEndpoint: process.env.NEXT_PUBLIC_DEVNET_WS ?? "wss://api.devnet.solana.com",
    explorerCluster: "devnet",
    programId: DEVNET_PROGRAM_ID,
    badge: "shared test cluster",
    description: "For wallet integration, hosted demos, and public testing.",
  },
};

export function isNetworkId(value: string): value is NetworkId {
  return value in NETWORKS;
}

export function getExplorerSignatureUrl(network: NetworkConfig, signature: string): string | null {
  if (!network.explorerCluster) {
    return null;
  }

  return `https://explorer.solana.com/tx/${signature}?cluster=${network.explorerCluster}`;
}
