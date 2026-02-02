import { vaultV2Abi } from "@morpho-org/uikit/assets/abis/vault-v2";
import { Button } from "@morpho-org/uikit/components/shadcn/button";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@morpho-org/uikit/components/shadcn/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@morpho-org/uikit/components/shadcn/tabs";
import { TokenAmountInput } from "@morpho-org/uikit/components/token-amount-input";
import { TransactionButton } from "@morpho-org/uikit/components/transaction-button";
import { Token } from "@morpho-org/uikit/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { CircleArrowLeft } from "lucide-react";
import { useState } from "react";
import { erc20Abi, parseUnits } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { type VaultV2Data } from "@/hooks/use-vault-v2-markets";
import { TRANSACTION_DATA_SUFFIX } from "@/lib/constants";

enum Actions {
  Deposit = "Deposit",
  Withdraw = "Withdraw",
}

const STYLE_TAB = "hover:bg-tertiary rounded-full duration-200 ease-in-out";
const STYLE_INPUT_WRAPPER =
  "bg-primary hover:bg-secondary flex flex-col gap-4 rounded-2xl p-4 transition-colors duration-200 ease-in-out";
const STYLE_INPUT_HEADER = "text-secondary-foreground flex items-center justify-between text-xs font-light";

export function VaultV2EarnSheetContent({ vault, asset }: { vault: VaultV2Data; asset: Token }) {
  const { address: userAddress } = useAccount();

  const [selectedTab, setSelectedTab] = useState(Actions.Deposit);
  const [textInputValue, setTextInputValue] = useState("");

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [userAddress ?? "0x", vault.address],
    query: { enabled: !!userAddress, staleTime: 5_000, gcTime: 5_000 },
  });

  // VaultV2 returns 0 for max functions, so we use balanceOf instead
  const { data: balances, refetch: refetchBalances } = useReadContracts({
    contracts: [
      { address: vault.address, abi: vaultV2Abi, functionName: "balanceOf", args: [userAddress ?? "0x"] },
      { address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [userAddress ?? "0x"] },
      { address: vault.address, abi: vaultV2Abi, functionName: "totalAssets" },
      { address: vault.address, abi: vaultV2Abi, functionName: "totalSupply" },
    ],
    allowFailure: true,
    query: { enabled: !!userAddress, staleTime: 1 * 60 * 1000, placeholderData: keepPreviousData },
  });

  const userVaultShares = balances?.[0]?.result as bigint | undefined;
  const userAssetBalance = balances?.[1]?.result as bigint | undefined;
  const totalAssets = balances?.[2]?.result as bigint | undefined;
  const totalSupply = balances?.[3]?.result as bigint | undefined;

  // Calculate user's withdrawable assets from shares
  const userWithdrawableAssets =
    userVaultShares !== undefined && totalAssets !== undefined && totalSupply !== undefined && totalSupply > 0n
      ? (userVaultShares * totalAssets) / totalSupply
      : 0n;

  const inputValue = asset.decimals !== undefined ? parseUnits(textInputValue, asset.decimals) : undefined;

  const approvalTxnConfig =
    userAddress !== undefined && inputValue !== undefined && allowance !== undefined && allowance < inputValue
      ? ({
          address: asset.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [vault.address, inputValue],
        } as const)
      : undefined;

  const depositTxnConfig =
    userAddress !== undefined && inputValue !== undefined
      ? ({
          address: vault.address,
          abi: vaultV2Abi,
          functionName: "deposit",
          args: [inputValue, userAddress],
          dataSuffix: TRANSACTION_DATA_SUFFIX,
        } as const)
      : undefined;

  const withdrawTxnConfig =
    userAddress !== undefined && inputValue !== undefined
      ? ({
          address: vault.address,
          abi: vaultV2Abi,
          functionName: "withdraw",
          args: [inputValue, userAddress, userAddress],
          dataSuffix: TRANSACTION_DATA_SUFFIX,
        } as const)
      : undefined;

  function onClear() {
    void refetchAllowance();
    void refetchBalances();
    setTextInputValue("");
  }

  return (
    <SheetContent className="flex w-full flex-col justify-between gap-4 overflow-y-scroll px-2 pb-8 sm:max-w-lg">
      <div className="flex flex-col gap-4">
        <SheetHeader className="flex flex-row items-center gap-1 pl-4 pt-4">
          <SheetClose className="hover:bg-secondary h-min w-min rounded-full p-2">
            <CircleArrowLeft className="text-secondary-foreground" />
          </SheetClose>
          <div className="flex flex-col">
            <SheetTitle className="text-primary-foreground text-xl font-light">{vault.name}</SheetTitle>
            <SheetDescription className="text-xs font-light">VaultV2</SheetDescription>
          </div>
        </SheetHeader>
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as Actions)}>
          <div className="px-4">
            <TabsList className="bg-primary grid w-full grid-cols-2 rounded-full px-[6px] py-1">
              <TabsTrigger className={STYLE_TAB} value={Actions.Deposit}>
                Deposit
              </TabsTrigger>
              <TabsTrigger className={STYLE_TAB} value={Actions.Withdraw}>
                Withdraw
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={Actions.Deposit} className="flex flex-col gap-4 px-4">
            <div className={STYLE_INPUT_WRAPPER}>
              <div className={STYLE_INPUT_HEADER}>
                Deposit {asset.symbol ?? ""}
                {asset.imageSrc && <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />}
              </div>
              <TokenAmountInput
                value={textInputValue}
                onChange={setTextInputValue}
                maxValue={userAssetBalance}
                decimals={asset.decimals}
              />
            </div>
          </TabsContent>
          <TabsContent value={Actions.Withdraw} className="flex flex-col gap-4 px-4">
            <div className={STYLE_INPUT_WRAPPER}>
              <div className={STYLE_INPUT_HEADER}>
                Withdraw {asset.symbol ?? ""}
                {asset.imageSrc && <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />}
              </div>
              <TokenAmountInput
                value={textInputValue}
                onChange={setTextInputValue}
                maxValue={userWithdrawableAssets}
                decimals={asset.decimals}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <SheetFooter className="flex flex-col gap-4 px-4 sm:flex-col">
        {selectedTab === Actions.Deposit ? (
          <>
            {approvalTxnConfig && (
              <TransactionButton
                variables={approvalTxnConfig}
                disabled={inputValue === 0n}
                onTxnReceipt={() => refetchAllowance()}
              >
                Approve {asset.symbol}
              </TransactionButton>
            )}
            <TransactionButton
              variables={depositTxnConfig}
              disabled={!!approvalTxnConfig || !inputValue}
              onTxnReceipt={onClear}
            >
              Deposit
            </TransactionButton>
          </>
        ) : (
          <TransactionButton variables={withdrawTxnConfig} disabled={!inputValue} onTxnReceipt={onClear}>
            Withdraw
          </TransactionButton>
        )}
        <SheetClose asChild>
          <Button variant="ghost" className="text-secondary-foreground hover:bg-secondary rounded-full">
            Close
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}
