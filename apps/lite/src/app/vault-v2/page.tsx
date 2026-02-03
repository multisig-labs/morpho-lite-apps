import { morphoAbi } from "@morpho-org/uikit/assets/abis/morpho";
import { morphoMarketV1AdapterV2Abi } from "@morpho-org/uikit/assets/abis/morpho-market-v1-adapter-v2";
import { vaultV2Abi } from "@morpho-org/uikit/assets/abis/vault-v2";
import { AvatarStack } from "@morpho-org/uikit/components/avatar-stack";
import { ChainIcon } from "@morpho-org/uikit/components/chain-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@morpho-org/uikit/components/shadcn/avatar";
import { Button } from "@morpho-org/uikit/components/shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-org/uikit/components/shadcn/table";
import { TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { getContractDeploymentInfo } from "@morpho-org/uikit/lib/deployments";
import { abbreviateAddress, formatApy, formatBalanceWithSymbol } from "@morpho-org/uikit/lib/utils";
import { blo } from "blo";
// @ts-expect-error: this package lacks types
import humanizeDuration from "humanize-duration";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { type Address, erc20Abi, type Hex, toFunctionSelector, zeroAddress } from "viem";
import { useChainId, useChains, useReadContracts } from "wagmi";

import { getVaultV2Curator } from "@/lib/curators";
import { getTokenURI } from "@/lib/tokens";

// Timelocked function definitions for VaultV2
const TIMELOCKED_FUNCTIONS = [
  { name: "Add / Remove allocator", signature: "setIsAllocator(address,bool)" },
  { name: "Set receive shares gate", signature: "setReceiveSharesGate(address)" },
  { name: "Set send shares gate", signature: "setSendSharesGate(address)" },
  { name: "Set receive assets gate", signature: "setReceiveAssetsGate(address)" },
  { name: "Set send assets gate", signature: "setSendAssetsGate(address)" },
  { name: "Set adapter registry", signature: "setAdapterRegistry(address)" },
  { name: "Add adapter", signature: "addAdapter(address,uint128,uint128)" },
  { name: "Remove adapter", signature: "removeAdapter(address)" },
  { name: "Set performance fee", signature: "setPerformanceFee(uint256)" },
  { name: "Set management fee", signature: "setManagementFee(uint256)" },
  { name: "Set performance fee recipient", signature: "setPerformanceFeeRecipient(address)" },
  { name: "Set management fee recipient", signature: "setManagementFeeRecipient(address)" },
  { name: "Increase absolute cap", signature: "increaseAbsoluteCap(bytes,uint256)" },
  { name: "Decrease absolute cap", signature: "decreaseAbsoluteCap(bytes,uint256)" },
  { name: "Increase relative cap", signature: "increaseRelativeCap(bytes,uint256)" },
  { name: "Decrease relative cap", signature: "decreaseRelativeCap(bytes,uint256)" },
  { name: "Set force deallocate penalty", signature: "setForceDeallocatePenalty(address,uint256)" },
] as const;

function AttributeRow({
  label,
  children,
  chainExplorerUrl,
  address,
}: {
  label: string;
  children: React.ReactNode;
  chainExplorerUrl?: string;
  address?: Address;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-4">
      <span className="text-secondary-foreground">{label}</span>
      <span className="text-primary-foreground flex items-center gap-2">
        {children}
        {chainExplorerUrl && address && address !== zeroAddress && (
          <a href={`${chainExplorerUrl}/address/${address}`} rel="noopener noreferrer" target="_blank">
            <ExternalLink className="size-4" />
          </a>
        )}
      </span>
    </div>
  );
}

function formatTimelockDuration(seconds: bigint | undefined, isAbdicated: boolean | undefined): string {
  if (isAbdicated) return "Abdicated";
  if (seconds === undefined) return "Loading...";
  if (seconds === 0n) return "No timelock";
  return humanizeDuration(Number(seconds) * 1000);
}

export function VaultV2DetailsPage() {
  const { chain: chainSlug, address: vaultAddress } = useParams();
  const chainId = useChainId();
  const chains = useChains();
  const chain = chains.find((c) => c.id === chainId);
  const chainExplorerUrl = chain?.blockExplorers?.default.url;
  const curator = useMemo(
    () => (vaultAddress ? getVaultV2Curator(chainId, vaultAddress as Address) : undefined),
    [chainId, vaultAddress],
  );

  // Get Morpho deployment for this chain
  const morpho = useMemo(() => getContractDeploymentInfo(chainId, "Morpho"), [chainId]);

  // Compute function selectors
  const functionSelectors = useMemo(() => TIMELOCKED_FUNCTIONS.map((fn) => toFunctionSelector(fn.signature)), []);

  // Fetch vault data
  const { data: vaultData } = useReadContracts({
    contracts: vaultAddress
      ? [
          { chainId, address: vaultAddress as Address, abi: vaultV2Abi, functionName: "name" } as const,
          { chainId, address: vaultAddress as Address, abi: vaultV2Abi, functionName: "owner" } as const,
          { chainId, address: vaultAddress as Address, abi: vaultV2Abi, functionName: "adaptersLength" } as const,
          { chainId, address: vaultAddress as Address, abi: vaultV2Abi, functionName: "asset" } as const,
          { chainId, address: vaultAddress as Address, abi: vaultV2Abi, functionName: "totalAssets" } as const,
          { chainId, address: vaultAddress as Address, abi: vaultV2Abi, functionName: "performanceFee" } as const,
          { chainId, address: vaultAddress as Address, abi: vaultV2Abi, functionName: "managementFee" } as const,
        ]
      : [],
    allowFailure: true,
    query: {
      enabled: !!vaultAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  const assetAddress = vaultData?.[3]?.result as Address | undefined;
  const adaptersLength = vaultData?.[2]?.result as bigint | undefined;

  // Fetch asset token info
  const { data: assetData } = useReadContracts({
    contracts: assetAddress
      ? [
          { chainId, address: assetAddress, abi: erc20Abi, functionName: "symbol" } as const,
          { chainId, address: assetAddress, abi: erc20Abi, functionName: "decimals" } as const,
          {
            chainId,
            address: assetAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [vaultAddress as Address],
          } as const,
        ]
      : [],
    allowFailure: true,
    query: {
      enabled: !!assetAddress && !!vaultAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  // Fetch adapter addresses for exposure
  const adapterIndices = useMemo(
    () => (adaptersLength !== undefined ? Array.from({ length: Number(adaptersLength) }, (_, i) => BigInt(i)) : []),
    [adaptersLength],
  );

  const { data: adaptersData } = useReadContracts({
    contracts: vaultAddress
      ? adapterIndices.map(
          (idx) =>
            ({
              chainId,
              address: vaultAddress as Address,
              abi: vaultV2Abi,
              functionName: "adapters",
              args: [idx],
            }) as const,
        )
      : [],
    allowFailure: true,
    query: {
      enabled: !!vaultAddress && adaptersLength !== undefined && adaptersLength > 0n,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  // Get adapter addresses
  const adapterAddresses = useMemo(
    () =>
      adaptersData
        ?.map((result) => result.result as Address | undefined)
        .filter((addr): addr is Address => addr !== undefined) ?? [],
    [adaptersData],
  );

  // Fetch marketIdsLength from each adapter
  const { data: marketIdsLengthData } = useReadContracts({
    contracts: adapterAddresses.map(
      (addr) =>
        ({
          chainId,
          address: addr,
          abi: morphoMarketV1AdapterV2Abi,
          functionName: "marketIdsLength",
        }) as const,
    ),
    allowFailure: true,
    query: {
      enabled: adapterAddresses.length > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  // Build list of (adapter, marketIndex) pairs
  const adapterMarketQueries = useMemo(() => {
    const queries: { adapter: Address; index: bigint }[] = [];
    adapterAddresses.forEach((adapter, adapterIdx) => {
      const length = marketIdsLengthData?.[adapterIdx]?.result as bigint | undefined;
      if (length !== undefined) {
        for (let i = 0n; i < length; i++) {
          queries.push({ adapter, index: i });
        }
      }
    });
    return queries;
  }, [adapterAddresses, marketIdsLengthData]);

  // Fetch all marketIds from adapters
  const { data: marketIdsData } = useReadContracts({
    contracts: adapterMarketQueries.map(
      ({ adapter, index }) =>
        ({
          chainId,
          address: adapter,
          abi: morphoMarketV1AdapterV2Abi,
          functionName: "marketIds",
          args: [index],
        }) as const,
    ),
    allowFailure: true,
    query: {
      enabled: adapterMarketQueries.length > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  // Get unique market IDs
  const uniqueMarketIds = useMemo(() => {
    const ids = new Set<Hex>();
    marketIdsData?.forEach((result) => {
      const marketId = result.result as Hex | undefined;
      if (marketId) ids.add(marketId);
    });
    return [...ids];
  }, [marketIdsData]);

  // Fetch market params from Morpho to get collateral tokens
  const { data: marketParamsData } = useReadContracts({
    contracts:
      morpho && uniqueMarketIds.length > 0
        ? uniqueMarketIds.map(
            (marketId) =>
              ({
                chainId,
                address: morpho.address,
                abi: morphoAbi,
                functionName: "idToMarketParams",
                args: [marketId],
              }) as const,
          )
        : [],
    allowFailure: true,
    query: {
      enabled: !!morpho && uniqueMarketIds.length > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  // Extract unique collateral tokens
  const collateralTokens = useMemo(() => {
    const tokens = new Set<Address>();
    marketParamsData?.forEach((result) => {
      const params = result.result as [Address, Address, Address, Address, bigint] | undefined;
      if (params) {
        const collateralToken = params[1]; // collateralToken is second element
        if (collateralToken && collateralToken !== zeroAddress) {
          tokens.add(collateralToken);
        }
      }
    });
    return [...tokens];
  }, [marketParamsData]);

  // Fetch symbols for collateral tokens
  const { data: collateralSymbolsData } = useReadContracts({
    contracts: collateralTokens.map(
      (token) =>
        ({
          chainId,
          address: token,
          abi: erc20Abi,
          functionName: "symbol",
        }) as const,
    ),
    allowFailure: true,
    query: {
      enabled: collateralTokens.length > 0,
      staleTime: Infinity,
      gcTime: Infinity,
    },
  });

  // Build collateral token info for display
  const collateralTokenInfo = useMemo(() => {
    return collateralTokens.map((address, idx) => {
      const symbol = collateralSymbolsData?.[idx]?.result as string | undefined;
      const logoUrl = getTokenURI({ symbol, address, chainId });
      return { address, symbol, logoUrl };
    });
  }, [collateralTokens, collateralSymbolsData, chainId]);

  // Fetch timelocks for all functions
  const { data: timelockData } = useReadContracts({
    contracts: vaultAddress
      ? functionSelectors.map(
          (selector) =>
            ({
              chainId,
              address: vaultAddress as Address,
              abi: vaultV2Abi,
              functionName: "timelock",
              args: [selector as Hex],
            }) as const,
        )
      : [],
    allowFailure: true,
    query: {
      enabled: !!vaultAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  // Fetch abdicated status for all functions
  const { data: abdicatedData } = useReadContracts({
    contracts: vaultAddress
      ? functionSelectors.map(
          (selector) =>
            ({
              chainId,
              address: vaultAddress as Address,
              abi: vaultV2Abi,
              functionName: "abdicated",
              args: [selector as Hex],
            }) as const,
        )
      : [],
    allowFailure: true,
    query: {
      enabled: !!vaultAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  const vaultName = vaultData?.[0]?.result as string | undefined;
  const owner = vaultData?.[1]?.result as Address | undefined;
  const totalAssets = vaultData?.[4]?.result as bigint | undefined;
  const performanceFee = vaultData?.[5]?.result as bigint | undefined;
  const managementFee = vaultData?.[6]?.result as bigint | undefined;

  const assetSymbol = assetData?.[0]?.result as string | undefined;
  const assetDecimals = assetData?.[1]?.result as number | undefined;
  const vaultAssetBalance = assetData?.[2]?.result as bigint | undefined; // Liquidity (idle assets)

  if (!vaultAddress) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-secondary-foreground">Vault address not provided</p>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col px-4 pt-20">
      <div className="mx-auto w-full max-w-2xl">
        <Link to={`/${chainSlug}/earn`}>
          <Button variant="ghost" className="mb-6 gap-2">
            <ArrowLeft className="size-4" />
            Back to Vaults
          </Button>
        </Link>

        {/* Metrics Section */}
        <div className="bg-primary mb-6 grid grid-cols-3 gap-6 rounded-2xl p-6">
          <div className="flex flex-col">
            <span className="text-secondary-foreground mb-2 text-sm">Total Deposits</span>
            <span className="text-primary-foreground text-2xl font-semibold">
              {totalAssets !== undefined && assetDecimals !== undefined
                ? formatBalanceWithSymbol(totalAssets, assetDecimals, assetSymbol, 2, true)
                : "Loading..."}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-secondary-foreground mb-2 text-sm">Liquidity</span>
            <span className="text-primary-foreground text-2xl font-semibold">
              {vaultAssetBalance !== undefined && assetDecimals !== undefined
                ? formatBalanceWithSymbol(vaultAssetBalance, assetDecimals, assetSymbol, 2, true)
                : "Loading..."}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-secondary-foreground mb-2 text-sm">Exposure</span>
            <div className="mt-1">
              {collateralTokenInfo.length > 0 ? (
                <AvatarStack
                  items={collateralTokenInfo.map((token) => ({
                    logoUrl: [token.logoUrl, blo(token.address)],
                    hoverCardContent: (
                      <TooltipContent className="text-primary-foreground rounded-xl p-3 shadow-2xl">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-4 w-4 rounded-full">
                            <AvatarImage src={token.logoUrl} alt={token.symbol ?? "Token"} />
                            <AvatarFallback delayMs={500}>
                              <img src={blo(token.address)} />
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{token.symbol ?? abbreviateAddress(token.address)}</span>
                          {chainExplorerUrl && (
                            <a
                              href={`${chainExplorerUrl}/address/${token.address}`}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </TooltipContent>
                    ),
                  }))}
                  align="left"
                  maxItems={5}
                />
              ) : adaptersLength === 0n ? (
                <span className="text-secondary-foreground text-sm">No adapters</span>
              ) : (
                <span className="text-secondary-foreground text-sm">Loading...</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-primary mb-8 rounded-2xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="size-6 [&>svg]:size-6">
              <ChainIcon id={chainId} />
            </div>
            <h1 className="text-primary-foreground text-2xl font-semibold">{vaultName ?? "Vault"} Details</h1>
          </div>

          <h2 className="text-primary-foreground mb-4 text-lg font-medium">Risk Disclosures</h2>

          <div className="mb-6 flex flex-col">
            <AttributeRow label="Owner" chainExplorerUrl={chainExplorerUrl} address={owner}>
              {owner ? (owner === zeroAddress ? "None" : abbreviateAddress(owner)) : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Curator" chainExplorerUrl={chainExplorerUrl} address={curator?.address}>
              {curator ? (
                <span className="flex items-center gap-2">
                  {curator.name}
                  <code>{abbreviateAddress(curator.address)}</code>
                </span>
              ) : (
                "Not configured"
              )}
            </AttributeRow>

            <AttributeRow label="Performance Fee">
              {performanceFee !== undefined ? formatApy(performanceFee) : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Management Fee">
              {managementFee !== undefined ? formatApy(managementFee) : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Vault Type">VaultV2</AttributeRow>

            <AttributeRow label="Adapters Count">
              {adaptersLength !== undefined ? adaptersLength.toString() : "Loading..."}
            </AttributeRow>
          </div>

          <h2 className="text-primary-foreground mb-4 text-lg font-medium">Timelock Configuration</h2>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-secondary-foreground">Type</TableHead>
                <TableHead className="text-secondary-foreground text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TIMELOCKED_FUNCTIONS.map((fn, idx) => {
                const timelock = timelockData?.[idx]?.result as bigint | undefined;
                const isAbdicated = abdicatedData?.[idx]?.result as boolean | undefined;
                return (
                  <TableRow key={fn.signature}>
                    <TableCell className="text-primary-foreground">{fn.name}</TableCell>
                    <TableCell
                      className={`text-right ${isAbdicated ? "text-yellow-500" : timelock === 0n ? "text-secondary-foreground" : "text-primary-foreground"}`}
                    >
                      {formatTimelockDuration(timelock, isAbdicated)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
