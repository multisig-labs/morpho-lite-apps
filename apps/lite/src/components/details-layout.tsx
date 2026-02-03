import WatermarkSvg from "@morpho-org/uikit/assets/powered-by-morpho.svg?react";
import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { WalletMenu } from "@morpho-org/uikit/components/wallet-menu";
import { getChainSlug } from "@morpho-org/uikit/lib/utils";
import { ConnectKitButton } from "connectkit";
import { useCallback, useMemo } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { Toaster } from "sonner";
import { useChains } from "wagmi";

import { Header } from "@/components/header";
import { MorphoMenu } from "@/components/morpho-menu";
import { RewardsButton } from "@/components/rewards-button";
import { WORDMARK } from "@/lib/constants";

function ConnectWalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ show }) => {
        return (
          <Button variant="blue" size="lg" className="rounded-full px-4 font-light md:px-6" onClick={show}>
            <span className="inline md:hidden">Connect</span>
            <span className="hidden md:inline">Connect&nbsp;Wallet</span>
          </Button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

export function DetailsLayout() {
  const navigate = useNavigate();
  const { chain: selectedChainSlug } = useParams();

  const chains = useChains();
  const chain = useMemo(
    () => chains.find((chain) => getChainSlug(chain) === selectedChainSlug),
    [chains, selectedChainSlug],
  );

  const setSelectedChainSlug = useCallback(
    (value: string) => {
      void navigate(`/${value}/earn`, { replace: true });
    },
    [navigate],
  );

  return (
    <div className="bg-background">
      <Toaster theme="dark" position="bottom-left" richColors />
      <Header className="flex items-center justify-between px-5 py-3" chainId={chain?.id}>
        <div className="text-primary-foreground flex items-center gap-4">
          {WORDMARK.length > 0 ? (
            <>
              <img className="max-h-[24px]" src={WORDMARK} />
              <WatermarkSvg height={24} className="text-primary-foreground/50 w-[170px] min-w-[170px]" />
            </>
          ) : (
            <MorphoMenu />
          )}
        </div>
        <div className="flex items-center gap-2">
          <RewardsButton chainId={chain?.id} />
          <WalletMenu
            selectedChainSlug={selectedChainSlug!}
            setSelectedChainSlug={setSelectedChainSlug}
            connectWalletButton={<ConnectWalletButton />}
          />
        </div>
      </Header>
      <Outlet context={{ chain }} />
    </div>
  );
}
