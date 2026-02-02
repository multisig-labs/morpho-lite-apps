import { Market, MarketParams } from "@morpho-org/blue-sdk";
import { restructure } from "@morpho-org/blue-sdk-viem";
import { morphoAbi } from "@morpho-org/uikit/assets/abis/morpho";
import { oracleAbi } from "@morpho-org/uikit/assets/abis/oracle";
import { ChainIcon } from "@morpho-org/uikit/components/chain-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@morpho-org/uikit/components/shadcn/avatar";
import { Button } from "@morpho-org/uikit/components/shadcn/button";
import useContractEvents from "@morpho-org/uikit/hooks/use-contract-events/use-contract-events";
import { getContractDeploymentInfo } from "@morpho-org/uikit/lib/deployments";
import { formatBalance, formatLtv, Token } from "@morpho-org/uikit/lib/utils";
import { blo } from "blo";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { type Address, erc20Abi, type Hex } from "viem";
import { useChainId, usePublicClient, useReadContract, useReadContracts } from "wagmi";

import { getTokenURI } from "@/lib/tokens";

function restructureMarketParams(data: readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint]) {
  return restructure(data, { abi: morphoAbi, name: "idToMarketParams", args: ["0x"] });
}

function restructureMarket(data: readonly [bigint, bigint, bigint, bigint, bigint, bigint]) {
  return restructure(data, { abi: morphoAbi, name: "market", args: ["0x"] });
}

function TokenDisplay({ token }: { token: Token }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-6 rounded-full">
        <AvatarImage src={token.imageSrc} alt={token.symbol} />
        <AvatarFallback delayMs={1000}>
          <img src={blo(token.address)} />
        </AvatarFallback>
      </Avatar>
      <span className="font-medium">{token.symbol ?? "Unknown"}</span>
    </div>
  );
}

function AttributeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-4">
      <span className="text-secondary-foreground">{label}</span>
      <span className="text-primary-foreground">{children}</span>
    </div>
  );
}

export function MarketDetailsPage() {
  const { chain: chainSlug, id: marketId } = useParams();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const morpho = useMemo(() => getContractDeploymentInfo(chainId, "Morpho"), [chainId]);

  // Fetch CreateMarket event to get actual creation date
  const {
    logs: { all: createMarketEvents },
  } = useContractEvents({
    chainId,
    abi: morphoAbi,
    address: morpho?.address ? [morpho.address] : [],
    fromBlock: morpho?.fromBlock,
    toBlock: "finalized",
    eventName: "CreateMarket",
    args: { id: marketId as Hex },
    strict: true,
    query: { enabled: chainId !== undefined && !!morpho && !!marketId },
  });

  const { data: marketParamsData } = useReadContract({
    chainId,
    address: morpho?.address ?? "0x",
    abi: morphoAbi,
    functionName: "idToMarketParams",
    args: [marketId as Hex],
    query: {
      enabled: chainId !== undefined && !!morpho && !!marketId,
      staleTime: Infinity,
      gcTime: Infinity,
      select: restructureMarketParams,
    },
  });

  const { data: marketData } = useReadContract({
    chainId,
    address: morpho?.address ?? "0x",
    abi: morphoAbi,
    functionName: "market",
    args: [marketId as Hex],
    query: {
      enabled: chainId !== undefined && !!morpho && !!marketId,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
      select: restructureMarket,
    },
  });

  const { data: price } = useReadContract({
    chainId,
    address: marketParamsData?.oracle ?? "0x",
    abi: oracleAbi,
    functionName: "price",
    query: {
      enabled: chainId !== undefined && !!marketParamsData?.oracle,
      staleTime: 5 * 60 * 1000,
      gcTime: Infinity,
    },
  });

  const { data: tokenData } = useReadContracts({
    contracts: marketParamsData
      ? [
          { chainId, address: marketParamsData.collateralToken, abi: erc20Abi, functionName: "symbol" } as const,
          { chainId, address: marketParamsData.collateralToken, abi: erc20Abi, functionName: "decimals" } as const,
          { chainId, address: marketParamsData.loanToken, abi: erc20Abi, functionName: "symbol" } as const,
          { chainId, address: marketParamsData.loanToken, abi: erc20Abi, functionName: "decimals" } as const,
        ]
      : [],
    allowFailure: true,
    query: {
      enabled: !!marketParamsData,
      staleTime: Infinity,
      gcTime: Infinity,
    },
  });

  const createMarketEvent = createMarketEvents[0];

  const market = useMemo(() => {
    if (!marketParamsData || !marketData) return undefined;
    return new Market({
      ...marketData,
      params: new MarketParams(marketParamsData),
      price,
    });
  }, [marketParamsData, marketData, price]);

  const collateralToken: Token | undefined = useMemo(() => {
    if (!marketParamsData || !tokenData) return undefined;
    const symbol = tokenData[0]?.result;
    const decimals = tokenData[1]?.result;
    return {
      address: marketParamsData.collateralToken as Address,
      symbol,
      decimals,
      imageSrc: getTokenURI({ symbol, address: marketParamsData.collateralToken as Address, chainId }),
    };
  }, [marketParamsData, tokenData, chainId]);

  const loanToken: Token | undefined = useMemo(() => {
    if (!marketParamsData || !tokenData) return undefined;
    const symbol = tokenData[2]?.result;
    const decimals = tokenData[3]?.result;
    return {
      address: marketParamsData.loanToken as Address,
      symbol,
      decimals,
      imageSrc: getTokenURI({ symbol, address: marketParamsData.loanToken as Address, chainId }),
    };
  }, [marketParamsData, tokenData, chainId]);

  const utilization = useMemo(() => {
    if (!market || market.totalSupplyAssets === 0n) return undefined;
    return market.utilization;
  }, [market]);

  const oraclePriceFormatted = useMemo(() => {
    if (!price || !collateralToken?.decimals || !loanToken?.decimals) return undefined;
    const scaledPrice = formatBalance(price, 36 + loanToken.decimals - collateralToken.decimals, 5);
    return `${collateralToken.symbol} / ${loanToken.symbol} = ${scaledPrice}`;
  }, [price, collateralToken, loanToken]);

  // State for creation date fetched asynchronously
  const [creationDate, setCreationDate] = useState<string | undefined>(undefined);

  // Fetch block timestamp when we have the CreateMarket event
  useEffect(() => {
    if (!createMarketEvent?.blockNumber || !publicClient) return;

    void publicClient
      .getBlock({ blockNumber: createMarketEvent.blockNumber })
      .then((block) => {
        const date = new Date(Number(block.timestamp) * 1000);
        setCreationDate(
          date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }),
        );
      })
      .catch(() => {
        setCreationDate(`Block ${createMarketEvent.blockNumber}`);
      });
  }, [createMarketEvent, publicClient]);

  if (!marketId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-secondary-foreground">Market ID not provided</p>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col px-4 pt-20">
      <div className="mx-auto w-full max-w-2xl">
        <Link to={`/${chainSlug}/borrow`}>
          <Button variant="ghost" className="mb-6 gap-2">
            <ArrowLeft className="size-4" />
            Back to Markets
          </Button>
        </Link>

        <div className="bg-primary rounded-2xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="size-6 [&>svg]:size-6">
              <ChainIcon id={chainId} />
            </div>
            <h1 className="text-primary-foreground text-2xl font-semibold">Market Details</h1>
          </div>

          <div className="flex flex-col">
            <AttributeRow label="Collateral">
              {collateralToken ? <TokenDisplay token={collateralToken} /> : "Loading..."}
            </AttributeRow>

            <AttributeRow label="Loan">{loanToken ? <TokenDisplay token={loanToken} /> : "Loading..."}</AttributeRow>

            <AttributeRow label="Liquidation LTV">{market ? formatLtv(market.params.lltv) : "Loading..."}</AttributeRow>

            <AttributeRow label="Oracle price">{oraclePriceFormatted ?? "Loading..."}</AttributeRow>

            <AttributeRow label="Created on">{creationDate ?? "Loading..."}</AttributeRow>

            <AttributeRow label="Utilization">
              {utilization !== undefined ? formatLtv(utilization) : "Loading..."}
            </AttributeRow>
          </div>
        </div>
      </div>
    </div>
  );
}
