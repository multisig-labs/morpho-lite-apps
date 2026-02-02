import { metaMorphoAbi } from "@morpho-org/uikit/assets/abis/meta-morpho";
import { metaMorphoFactoryAbi } from "@morpho-org/uikit/assets/abis/meta-morpho-factory";
import { ChainIcon } from "@morpho-org/uikit/components/chain-icon";
import { Button } from "@morpho-org/uikit/components/shadcn/button";
import useContractEvents from "@morpho-org/uikit/hooks/use-contract-events/use-contract-events";
import { getContractDeploymentInfo } from "@morpho-org/uikit/lib/deployments";
import { abbreviateAddress } from "@morpho-org/uikit/lib/utils";
// @ts-expect-error: this package lacks types
import humanizeDuration from "humanize-duration";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { type Address, zeroAddress } from "viem";
import { useChainId, useChains, usePublicClient, useReadContracts } from "wagmi";

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

export function VaultDetailsPage() {
  const { chain: chainSlug, address: vaultAddress } = useParams();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const chains = useChains();
  const chain = chains.find((c) => c.id === chainId);
  const chainExplorerUrl = chain?.blockExplorers?.default.url;

  const [factory, factoryV1_1] = useMemo(
    () => [
      getContractDeploymentInfo(chainId, "MetaMorphoFactory"),
      getContractDeploymentInfo(chainId, "MetaMorphoV1_1Factory"),
    ],
    [chainId],
  );

  // Fetch vault data
  const { data: vaultData } = useReadContracts({
    contracts: vaultAddress
      ? [
          { chainId, address: vaultAddress as Address, abi: metaMorphoAbi, functionName: "owner" } as const,
          { chainId, address: vaultAddress as Address, abi: metaMorphoAbi, functionName: "guardian" } as const,
          { chainId, address: vaultAddress as Address, abi: metaMorphoAbi, functionName: "timelock" } as const,
          { chainId, address: vaultAddress as Address, abi: metaMorphoAbi, functionName: "curator" } as const,
          { chainId, address: vaultAddress as Address, abi: metaMorphoAbi, functionName: "name" } as const,
        ]
      : [],
    allowFailure: true,
    query: {
      enabled: !!vaultAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  const owner = vaultData?.[0]?.result as Address | undefined;
  const guardian = vaultData?.[1]?.result as Address | undefined;
  const timelock = vaultData?.[2]?.result as bigint | undefined;
  const curator = vaultData?.[3]?.result as Address | undefined;
  const vaultName = vaultData?.[4]?.result as string | undefined;

  // Fetch CreateMetaMorpho events from both factory versions to find deployment date and version
  const fromBlock = factory?.fromBlock ?? factoryV1_1?.fromBlock;
  const {
    logs: { all: createMetaMorphoEventsV1 },
  } = useContractEvents({
    chainId,
    abi: metaMorphoFactoryAbi,
    address: factory?.address ? [factory.address] : [],
    fromBlock: factory?.fromBlock,
    toBlock: "finalized",
    eventName: "CreateMetaMorpho",
    strict: true,
    query: { enabled: chainId !== undefined && !!factory && !!vaultAddress },
  });

  const {
    logs: { all: createMetaMorphoEventsV1_1 },
  } = useContractEvents({
    chainId,
    abi: metaMorphoFactoryAbi,
    address: factoryV1_1?.address ? [factoryV1_1.address] : [],
    fromBlock: factoryV1_1?.fromBlock,
    toBlock: "finalized",
    eventName: "CreateMetaMorpho",
    strict: true,
    query: { enabled: chainId !== undefined && !!factoryV1_1 && !!vaultAddress },
  });

  // Find the creation event for this vault
  const createEvent = useMemo(() => {
    const v1Event = createMetaMorphoEventsV1.find(
      (ev) => ev.args.metaMorpho.toLowerCase() === vaultAddress?.toLowerCase(),
    );
    const v1_1Event = createMetaMorphoEventsV1_1.find(
      (ev) => ev.args.metaMorpho.toLowerCase() === vaultAddress?.toLowerCase(),
    );
    return v1Event ?? v1_1Event;
  }, [createMetaMorphoEventsV1, createMetaMorphoEventsV1_1, vaultAddress]);

  const vaultVersion = useMemo(() => {
    if (createMetaMorphoEventsV1.some((ev) => ev.args.metaMorpho.toLowerCase() === vaultAddress?.toLowerCase())) {
      return "v1.0";
    }
    if (createMetaMorphoEventsV1_1.some((ev) => ev.args.metaMorpho.toLowerCase() === vaultAddress?.toLowerCase())) {
      return "v1.1";
    }
    return undefined;
  }, [createMetaMorphoEventsV1, createMetaMorphoEventsV1_1, vaultAddress]);

  // Fetch SetIsAllocator events to find allocators
  const {
    logs: { all: setAllocatorEvents },
  } = useContractEvents({
    chainId,
    abi: metaMorphoAbi,
    address: vaultAddress ? [vaultAddress as Address] : [],
    fromBlock,
    toBlock: "finalized",
    eventName: "SetIsAllocator",
    strict: true,
    query: { enabled: chainId !== undefined && !!vaultAddress && fromBlock !== undefined },
  });

  // Compute current allocators from events
  const allocators = useMemo(() => {
    const allocatorMap = new Map<Address, boolean>();
    setAllocatorEvents.forEach((ev) => {
      allocatorMap.set(ev.args.allocator, ev.args.isAllocator);
    });
    return [...allocatorMap.entries()].filter(([, isAllocator]) => isAllocator).map(([addr]) => addr);
  }, [setAllocatorEvents]);

  // State for deployment date fetched asynchronously
  const [deploymentDate, setDeploymentDate] = useState<string | undefined>(undefined);

  // Fetch block timestamp when we have the CreateMetaMorpho event
  useEffect(() => {
    if (!createEvent?.blockNumber || !publicClient) return;

    void publicClient
      .getBlock({ blockNumber: createEvent.blockNumber })
      .then((block) => {
        const date = new Date(Number(block.timestamp) * 1000);
        setDeploymentDate(
          date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }),
        );
      })
      .catch(() => {
        setDeploymentDate(`Block ${createEvent.blockNumber}`);
      });
  }, [createEvent, publicClient]);

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

        <div className="bg-primary rounded-2xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="size-6 [&>svg]:size-6">
              <ChainIcon id={chainId} />
            </div>
            <h1 className="text-primary-foreground text-2xl font-semibold">{vaultName ?? "Vault"} Details</h1>
          </div>

          <h2 className="text-primary-foreground mb-4 text-lg font-medium">Risk Disclosures</h2>

          <div className="flex flex-col">
            <AttributeRow label="Owner" chainExplorerUrl={chainExplorerUrl} address={owner}>
              {owner ? (owner === zeroAddress ? "None" : abbreviateAddress(owner)) : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Guardian" chainExplorerUrl={chainExplorerUrl} address={guardian}>
              {guardian ? (guardian === zeroAddress ? "None" : abbreviateAddress(guardian)) : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Timelock Duration">
              {timelock !== undefined ? humanizeDuration(Number(timelock) * 1000) : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Deployment Date">{deploymentDate ?? "Loading..."}</AttributeRow>

            <AttributeRow label="Curator" chainExplorerUrl={chainExplorerUrl} address={curator}>
              {curator ? (curator === zeroAddress ? "None" : abbreviateAddress(curator)) : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Vault Version">{vaultVersion ?? "Loading..."}</AttributeRow>

            <AttributeRow
              label="Allocator(s)"
              chainExplorerUrl={allocators.length === 1 ? chainExplorerUrl : undefined}
              address={allocators.length === 1 ? allocators[0] : undefined}
            >
              {allocators.length > 0 ? (
                allocators.length === 1 ? (
                  abbreviateAddress(allocators[0])
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    {allocators.map((allocator) => (
                      <a
                        key={allocator}
                        href={`${chainExplorerUrl}/address/${allocator}`}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="flex items-center gap-1 hover:underline"
                      >
                        {abbreviateAddress(allocator)}
                        <ExternalLink className="size-3" />
                      </a>
                    ))}
                  </div>
                )
              ) : (
                "None"
              )}
            </AttributeRow>
          </div>
        </div>
      </div>
    </div>
  );
}
