"use client";

import type {
  PreparedInstruction,
  SwapGroupAccountData,
  SwapGroupSnapshot,
} from "@rebetxin/token-swap-sdk";
import { deriveAssociatedTokenAccount, discoverAssociatedTokenAccount, type DiscoveredTokenAccount } from "@/lib/token-accounts";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { fromWeb3Instruction } from "@solana/web3-compat";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { useWalletSession } from "@solana/react-hooks";
import { useMemo } from "react";
import { useAppRuntime } from "./runtime";

export interface GroupDirectoryState {
  deployed: boolean;
  groups: SwapGroupSnapshot[];
}

function buildKeys(networkId: string, programId: string) {
  return {
    deployment: ["program-deployment", networkId, programId] as const,
    groups: ["groups", networkId, programId] as const,
    group: (address: string) => ["group", networkId, programId, address] as const,
    tokenAccounts: (groupAddress: string, owner: string) =>
      ["token-accounts", networkId, groupAddress, owner] as const,
  };
}

export function getProtocolQueryKeys(networkId: string, programId: string) {
  return buildKeys(networkId, programId);
}

export async function invalidateProtocolQueries(
  queryClient: QueryClient,
  networkId: string,
  programId: string,
  groupAddress?: string,
): Promise<void> {
  const keys = buildKeys(networkId, programId);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.deployment }),
    queryClient.invalidateQueries({ queryKey: keys.groups }),
    groupAddress
      ? queryClient.invalidateQueries({ queryKey: keys.group(groupAddress) })
      : Promise.resolve(),
  ]);
}

export function toKitInstructionInput(
  prepared: PreparedInstruction | TransactionInstruction,
) {
  const instruction =
    "instruction" in prepared ? prepared.instruction : prepared;
  return fromWeb3Instruction(instruction) as any;
}

export function useProgramDeploymentQuery() {
  const { connection, network, networkId } = useAppRuntime();

  return useQuery({
    queryKey: buildKeys(networkId, network.programId).deployment,
    queryFn: async () => {
      const programInfo = await connection.getAccountInfo(
        new PublicKey(network.programId),
        "confirmed",
      );
      return Boolean(programInfo);
    },
  });
}

export function useGroupsQuery() {
  const { connection, sdk, network, networkId } = useAppRuntime();

  return useQuery<GroupDirectoryState>({
    queryKey: buildKeys(networkId, network.programId).groups,
    queryFn: async () => {
      const programInfo = await connection.getAccountInfo(
        new PublicKey(network.programId),
        "confirmed",
      );

      if (!programInfo) {
        return { deployed: false, groups: [] };
      }

      const groups = await sdk.getAllGroups();
      const snapshots = await Promise.all(groups.map((group) => sdk.getGroupSnapshot(group.address)));

      return {
        deployed: true,
        groups: snapshots,
      };
    },
  });
}

export function useGroupQuery(address: string) {
  const { sdk, network, networkId } = useAppRuntime();

  return useQuery<SwapGroupSnapshot | null>({
    queryKey: buildKeys(networkId, network.programId).group(address),
    queryFn: async () => {
      const group = await sdk.getGroup(address);
      if (!group) {
        return null;
      }

      return sdk.getGroupSnapshot(group.address);
    },
  });
}

export function useOwnerTokenAccounts(snapshot: SwapGroupSnapshot | null, ownerAddress?: string | null) {
  const { connection, networkId } = useAppRuntime();

  return useQuery({
    enabled: Boolean(snapshot && ownerAddress),
    queryKey: buildKeys(networkId, snapshot?.address.toBase58() ?? "pending").tokenAccounts(
      snapshot?.address.toBase58() ?? "pending",
      ownerAddress ?? "missing",
    ),
    queryFn: async (): Promise<{
      input: DiscoveredTokenAccount;
      output: DiscoveredTokenAccount;
    }> => {
      if (!snapshot || !ownerAddress) {
        throw new Error("snapshot and ownerAddress are required");
      }

      const owner = new PublicKey(ownerAddress);
      const [input, output] = await Promise.all([
        discoverAssociatedTokenAccount(connection, owner, snapshot.inputMintInfo),
        discoverAssociatedTokenAccount(connection, owner, snapshot.outputMintInfo),
      ]);

      return { input, output };
    },
  });
}

export function useConnectedOwnerAddress(): string | null {
  const session = useWalletSession();
  return session?.account.address.toString() ?? null;
}

export function useIsCurrentAdmin(group: SwapGroupAccountData | SwapGroupSnapshot | null): boolean {
  const ownerAddress = useConnectedOwnerAddress();

  return useMemo(() => {
    if (!group || !ownerAddress) {
      return false;
    }

    return group.admin.toBase58() === ownerAddress;
  }, [group, ownerAddress]);
}

export function deriveDefaultAtaForOwner(
  snapshot: SwapGroupSnapshot,
  ownerAddress: string,
  direction: "input" | "output",
) {
  const owner = new PublicKey(ownerAddress);
  return direction === "input"
    ? deriveAssociatedTokenAccount(owner, snapshot.inputMintInfo)
    : deriveAssociatedTokenAccount(owner, snapshot.outputMintInfo);
}
