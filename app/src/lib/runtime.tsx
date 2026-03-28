"use client";

import {
  TOKEN_SWAP_PROGRAM_ID,
  TokenSwapClient,
} from "@rebetxin/token-swap-sdk";
import { SolanaProvider, SolanaQueryProvider } from "@solana/react-hooks";
import { autoDiscover, createClient, type SolanaClient } from "@solana/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { NETWORKS, isNetworkId, type NetworkConfig, type NetworkId } from "./networks";

const STORAGE_KEY = "token-swap-frontend-network";
const walletConnectors = autoDiscover();

interface RuntimeContextValue {
  network: NetworkConfig;
  networkId: NetworkId;
  setNetworkId: (networkId: NetworkId) => void;
  client: SolanaClient;
  connection: Connection;
  sdk: TokenSwapClient;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

function getInitialNetworkId(): NetworkId {
  if (typeof window === "undefined") {
    return "localnet";
  }

  const savedValue = window.localStorage.getItem(STORAGE_KEY);
  return savedValue && isNetworkId(savedValue) ? savedValue : "localnet";
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [networkId, setNetworkIdState] = useState<NetworkId>(getInitialNetworkId);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, networkId);
  }, [networkId]);

  const network = NETWORKS[networkId];
  const client = useMemo(
    () =>
      createClient({
        endpoint: network.rpcEndpoint,
        websocketEndpoint: network.websocketEndpoint,
        walletConnectors,
      }),
    [network.rpcEndpoint, network.websocketEndpoint],
  );
  const connection = useMemo(
    () => new Connection(network.rpcEndpoint, "confirmed"),
    [network.rpcEndpoint],
  );
  const sdk = useMemo(
    () =>
      TokenSwapClient.initialize(connection, {
        programId: new PublicKey(network.programId),
        commitment: "confirmed",
      }),
    [connection, network.programId],
  );

  const contextValue = useMemo<RuntimeContextValue>(
    () => ({
      network,
      networkId,
      setNetworkId(nextNetworkId) {
        startTransition(() => {
          setNetworkIdState(nextNetworkId);
        });
      },
      client,
      connection,
      sdk,
    }),
    [client, connection, network, networkId, sdk],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeContext.Provider value={contextValue}>
        <SolanaProvider client={client}>
          <SolanaQueryProvider>{children}</SolanaQueryProvider>
        </SolanaProvider>
      </RuntimeContext.Provider>
    </QueryClientProvider>
  );
}

export function useAppRuntime(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error("useAppRuntime must be used inside <AppProviders />");
  }
  return context;
}

export function useProgramId(): PublicKey {
  const { network } = useAppRuntime();
  return useMemo(() => new PublicKey(network.programId), [network.programId]);
}

export function useDefaultProgramId(): PublicKey {
  return TOKEN_SWAP_PROGRAM_ID;
}
