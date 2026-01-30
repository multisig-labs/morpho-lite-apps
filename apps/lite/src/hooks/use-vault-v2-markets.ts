import { morphoMarketV1AdapterV2Abi } from "@morpho-org/uikit/assets/abis/morpho-market-v1-adapter-v2";
import { vaultV2Abi } from "@morpho-org/uikit/assets/abis/vault-v2";
import { useMemo } from "react";
import { type Address, type Hex } from "viem";
import { useReadContracts } from "wagmi";

import { VAULT_V2_OVERRIDES } from "@/lib/overrides";

export interface VaultV2Data {
  address: Address;
  name: string;
  asset: Address;
  owner: Address;
  totalAssets: bigint;
  marketIds: Hex[];
}

const STALE_TIME = 5 * 60 * 1000;

/**
 * Hook to fetch VaultV2 data and extract Morpho Blue market IDs from its adapters.
 * Only activates if there are VaultV2 overrides configured for the given chainId.
 */
export function useVaultV2Markets({ chainId }: { chainId: number | undefined }) {
  const vaultAddresses = useMemo(() => (chainId !== undefined ? (VAULT_V2_OVERRIDES[chainId] ?? []) : []), [chainId]);
  const hasVaultV2 = vaultAddresses.length > 0;

  // Step 1: Fetch basic vault info and adapters length
  const { data: vaultBasicData } = useReadContracts({
    contracts: vaultAddresses.flatMap((vaultAddress) => [
      { chainId, address: vaultAddress, abi: vaultV2Abi, functionName: "name" } as const,
      { chainId, address: vaultAddress, abi: vaultV2Abi, functionName: "asset" } as const,
      { chainId, address: vaultAddress, abi: vaultV2Abi, functionName: "owner" } as const,
      { chainId, address: vaultAddress, abi: vaultV2Abi, functionName: "totalAssets" } as const,
      { chainId, address: vaultAddress, abi: vaultV2Abi, functionName: "adaptersLength" } as const,
    ]),
    allowFailure: true,
    query: {
      enabled: hasVaultV2 && chainId !== undefined,
      staleTime: STALE_TIME,
      gcTime: Infinity,
    },
  });
  console.log("vaultBasicData", vaultBasicData);

  // Parse vault basic data and adapters lengths
  const vaultInfos = useMemo(() => {
    if (!vaultBasicData) return [];

    return vaultAddresses.map((vaultAddress, vaultIdx) => {
      const baseIdx = vaultIdx * 5;
      const name = vaultBasicData[baseIdx]?.result as string | undefined;
      const asset = vaultBasicData[baseIdx + 1]?.result as Address | undefined;
      const owner = vaultBasicData[baseIdx + 2]?.result as Address | undefined;
      const totalAssets = vaultBasicData[baseIdx + 3]?.result as bigint | undefined;
      const adaptersLength = vaultBasicData[baseIdx + 4]?.result as bigint | undefined;

      return {
        vaultAddress,
        name: name ?? "(no name)",
        asset: asset ?? ("0x" as Address),
        owner: owner ?? ("0x" as Address),
        totalAssets: totalAssets ?? 0n,
        adaptersLength: Number(adaptersLength ?? 0n),
      };
    });
  }, [vaultAddresses, vaultBasicData]);

  // Step 2: Fetch adapter addresses for each vault
  const adapterQueries = useMemo(() => {
    return vaultInfos.flatMap((vaultInfo) =>
      Array.from({ length: vaultInfo.adaptersLength }, (_, i) => ({
        chainId,
        address: vaultInfo.vaultAddress,
        abi: vaultV2Abi,
        functionName: "adapters" as const,
        args: [BigInt(i)] as const,
      })),
    );
  }, [chainId, vaultInfos]);

  const { data: adapterAddressesData } = useReadContracts({
    contracts: adapterQueries,
    allowFailure: true,
    query: {
      enabled: hasVaultV2 && chainId !== undefined && adapterQueries.length > 0,
      staleTime: STALE_TIME,
      gcTime: Infinity,
    },
  });
  console.log("adapterAddressesData", adapterAddressesData);

  // Parse adapter addresses per vault
  const vaultAdapters = useMemo(() => {
    if (!adapterAddressesData) return [];

    let idx = 0;
    return vaultInfos.map((vaultInfo) => {
      const adapters: Address[] = [];
      for (let i = 0; i < vaultInfo.adaptersLength; i++) {
        const addr = adapterAddressesData[idx]?.result as Address | undefined;
        if (addr) adapters.push(addr);
        idx++;
      }
      return { ...vaultInfo, adapters };
    });
  }, [vaultInfos, adapterAddressesData]);

  // Step 3: Fetch marketIdsLength from each adapter
  const allAdapters = useMemo(() => vaultAdapters.flatMap((v) => v.adapters), [vaultAdapters]);
  console.log("allAdapters", allAdapters);

  const { data: marketIdsLengthData } = useReadContracts({
    contracts: allAdapters.map(
      (adapterAddress) =>
        ({
          chainId,
          address: adapterAddress,
          abi: morphoMarketV1AdapterV2Abi,
          functionName: "marketIdsLength",
        }) as const,
    ),
    allowFailure: true,
    query: {
      enabled: hasVaultV2 && chainId !== undefined && allAdapters.length > 0,
      staleTime: STALE_TIME,
      gcTime: Infinity,
    },
  });
  console.log("marketIdsLengthData", marketIdsLengthData);

  // Parse marketIds lengths per adapter
  const adapterMarketLengths = useMemo(() => {
    if (!marketIdsLengthData) return [];
    return allAdapters.map((adapter, idx) => ({
      adapter,
      length: Number(marketIdsLengthData[idx]?.result ?? 0n),
    }));
  }, [allAdapters, marketIdsLengthData]);
  console.log("adapterMarketLengths", adapterMarketLengths);

  // Step 4: Fetch all marketIds from all adapters
  const marketIdQueries = useMemo(() => {
    return adapterMarketLengths.flatMap(({ adapter, length }) =>
      Array.from({ length }, (_, i) => ({
        chainId,
        address: adapter,
        abi: morphoMarketV1AdapterV2Abi,
        functionName: "marketIds" as const,
        args: [BigInt(i)] as const,
      })),
    );
  }, [chainId, adapterMarketLengths]);
  console.log("marketIdQueries", marketIdQueries);

  const { data: marketIdsData } = useReadContracts({
    contracts: marketIdQueries,
    allowFailure: true,
    query: {
      enabled: hasVaultV2 && chainId !== undefined && marketIdQueries.length > 0,
      staleTime: STALE_TIME,
      gcTime: Infinity,
    },
  });
  console.log("marketIdsData", marketIdsData);

  // Assemble final VaultV2Data array
  const vaultV2Data = useMemo((): VaultV2Data[] => {
    if (!marketIdsData || vaultAdapters.length === 0) return [];

    // Build a map of adapter -> marketIds
    const adapterMarketIds = new Map<Address, Hex[]>();
    let queryIdx = 0;
    for (const { adapter, length } of adapterMarketLengths) {
      const ids: Hex[] = [];
      for (let i = 0; i < length; i++) {
        const marketId = marketIdsData[queryIdx]?.result as Hex | undefined;
        if (marketId) ids.push(marketId);
        queryIdx++;
      }
      adapterMarketIds.set(adapter, ids);
    }

    // Map vault data with their market IDs
    return vaultAdapters.map((vault) => {
      const marketIdsSet = new Set<Hex>();
      for (const adapter of vault.adapters) {
        const ids = adapterMarketIds.get(adapter) ?? [];
        ids.forEach((id) => marketIdsSet.add(id));
      }

      return {
        address: vault.vaultAddress,
        name: vault.name,
        asset: vault.asset,
        owner: vault.owner,
        totalAssets: vault.totalAssets,
        marketIds: [...marketIdsSet],
      };
    });
  }, [vaultAdapters, adapterMarketLengths, marketIdsData]);

  // Compute all unique market IDs across all VaultV2 vaults
  const allMarketIds = useMemo(() => {
    const set = new Set<Hex>();
    vaultV2Data.forEach((v) => v.marketIds.forEach((id) => set.add(id)));
    return [...set];
  }, [vaultV2Data]);

  return {
    vaultV2Data,
    allMarketIds,
    hasVaultV2,
  };
}
