import { vaultV2Abi } from "@morpho-org/uikit/assets/abis/vault-v2";
import { Avatar, AvatarFallback, AvatarImage } from "@morpho-org/uikit/components/shadcn/avatar";
import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { Sheet, SheetTrigger } from "@morpho-org/uikit/components/shadcn/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-org/uikit/components/shadcn/table";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { formatBalanceWithSymbol, abbreviateAddress, getChainSlug } from "@morpho-org/uikit/lib/utils";
import { blo } from "blo";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { type Chain, type Address, erc20Abi } from "viem";
import { useReadContracts } from "wagmi";

import { VaultV2EarnSheetContent } from "@/components/vault-v2-earn-sheet-content";
import { type VaultV2Data } from "@/hooks/use-vault-v2-markets";
import { getTokenURI } from "@/lib/tokens";

function VaultTableCell({
  address,
  name,
  imageSrc,
  chain,
}: {
  address: Address;
  name: string;
  imageSrc?: string;
  chain: Chain | undefined;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hover:bg-secondary flex w-min items-center gap-2 rounded-sm p-2">
            <Avatar className="h-4 w-4 rounded-full">
              <AvatarImage src={imageSrc} alt="Avatar" />
              <AvatarFallback delayMs={1000}>
                <img src={blo(address)} />
              </AvatarFallback>
            </Avatar>
            {name || "－"}
          </div>
        </TooltipTrigger>
        <TooltipContent
          className="text-primary-foreground rounded-3xl p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="underline">VaultV2</p>
          <br />
          <div className="flex items-center gap-1">
            <p>
              Vault: <code>{abbreviateAddress(address)}</code>
            </p>
            {chain?.blockExplorers?.default.url && (
              <a
                href={`${chain.blockExplorers.default.url}/address/${address}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function VaultV2EarnTable({
  chain,
  vaults,
  depositsMode,
  refetchPositions,
}: {
  chain: Chain | undefined;
  vaults: VaultV2Data[];
  depositsMode: "totalAssets" | "userAssets";
  refetchPositions: () => void;
}) {
  const chainId = chain?.id;

  // Fetch asset token info for each vault
  const assetAddresses = useMemo(() => [...new Set(vaults.map((v) => v.asset))], [vaults]);

  const { data: tokenData } = useReadContracts({
    contracts: assetAddresses.flatMap((asset) => [
      { chainId, address: asset, abi: erc20Abi, functionName: "symbol" } as const,
      { chainId, address: asset, abi: erc20Abi, functionName: "decimals" } as const,
    ]),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  // Fetch totalSupply for share-to-asset conversion
  const { data: totalSupplyData } = useReadContracts({
    contracts: vaults.map(
      (vault) =>
        ({
          chainId,
          address: vault.address,
          abi: vaultV2Abi,
          functionName: "totalSupply",
        }) as const,
    ),
    allowFailure: true,
    query: { staleTime: 5 * 60 * 1000, gcTime: Infinity },
  });

  const tokens = useMemo(() => {
    const map = new Map<Address, { symbol?: string; decimals?: number }>();
    assetAddresses.forEach((asset, idx) => {
      const symbol = tokenData?.[idx * 2]?.result as string | undefined;
      const decimals = tokenData?.[idx * 2 + 1]?.result as number | undefined;
      map.set(asset, { symbol, decimals });
    });
    return map;
  }, [assetAddresses, tokenData]);

  if (vaults.length === 0) return null;

  return (
    <Table className="border-separate border-spacing-y-3">
      <TableHeader className="bg-primary">
        <TableRow>
          <TableHead className="text-secondary-foreground rounded-l-lg pl-4 text-xs font-light">Vault</TableHead>
          <TableHead className="text-secondary-foreground text-xs font-light">Deposits</TableHead>
          <TableHead className="text-secondary-foreground text-xs font-light">Owner</TableHead>
          <TableHead className="text-secondary-foreground text-xs font-light">Type</TableHead>
          <TableHead className="text-secondary-foreground rounded-r-lg text-xs font-light"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vaults.map((vault, idx) => {
          const token = tokens.get(vault.asset);
          const totalSupply = totalSupplyData?.[idx]?.result as bigint | undefined;

          // Calculate deposits based on mode
          let deposits: bigint | undefined;
          if (depositsMode === "totalAssets") {
            deposits = vault.totalAssets;
          } else if (vault.userShares !== undefined && totalSupply !== undefined && totalSupply > 0n) {
            // Convert shares to assets: shares * totalAssets / totalSupply
            deposits = (vault.userShares * vault.totalAssets) / totalSupply;
          }

          const imageSrc = getTokenURI({ symbol: token?.symbol, address: vault.asset, chainId });

          return (
            <Sheet
              key={vault.address}
              onOpenChange={(isOpen) => {
                if (!isOpen) void refetchPositions();
              }}
            >
              <SheetTrigger asChild>
                <TableRow className="bg-primary hover:bg-secondary cursor-pointer">
                  <TableCell className="rounded-l-lg py-3">
                    <VaultTableCell address={vault.address} name={vault.name} imageSrc={imageSrc} chain={chain} />
                  </TableCell>
                  <TableCell>
                    {deposits !== undefined && token?.decimals !== undefined
                      ? formatBalanceWithSymbol(deposits, token.decimals, token.symbol, 5, true)
                      : "－"}
                  </TableCell>
                  <TableCell>
                    <code>{abbreviateAddress(vault.owner)}</code>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-gray-400">VaultV2</span>
                  </TableCell>
                  <TableCell className="rounded-r-lg">
                    <Link
                      to={`/${chain ? getChainSlug(chain) : ""}/vault-v2/${vault.address}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="secondary" size="sm">
                        Details
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              </SheetTrigger>
              <VaultV2EarnSheetContent
                vault={vault}
                asset={{
                  address: vault.asset,
                  symbol: token?.symbol,
                  decimals: token?.decimals,
                  imageSrc,
                }}
              />
            </Sheet>
          );
        })}
      </TableBody>
    </Table>
  );
}
