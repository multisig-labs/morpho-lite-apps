import { getDefaultConfig as createConnectKitConfigParams } from "connectkit";
import type { Chain, HttpTransportConfig } from "viem";
import { CreateConnectorFn, createConfig as createWagmiConfig, fallback, http, type Transport } from "wagmi";
import { avalanche } from "wagmi/chains";

import { APP_DETAILS } from "@/lib/constants";

const httpConfig: HttpTransportConfig = {
  retryDelay: 0,
  timeout: 30_000,
};

function createFallbackTransport(rpcs: ({ url: string } & HttpTransportConfig)[]) {
  return fallback(
    rpcs.map((rpc) => http(rpc.url, { ...httpConfig, ...(({ url, ...rest }) => rest)(rpc) })),
    {
      retryCount: 6,
      retryDelay: 100,
    },
  );
}

const chains = [avalanche] as const;

const transports: { [K in (typeof chains)[number]["id"]]: Transport } & { [k: number]: Transport } = {
  [avalanche.id]: createFallbackTransport([
    { url: "https://api.avax.network/ext/bc/C/rpc", batch: { batchSize: 10 } },
    { url: "https://avalanche.gateway.tenderly.co", batch: { batchSize: 10 } },
    { url: "https://avalanche.drpc.org", batch: false },
  ]),
};

export function createConfig(args: {
  chains?: readonly [Chain, ...Chain[]];
  transports?: { [k: number]: Transport };
  connectors?: CreateConnectorFn[];
}) {
  return createWagmiConfig(
    createConnectKitConfigParams({
      chains: args.chains ?? chains,
      transports: args.transports ?? transports,
      connectors: args.connectors,
      walletConnectProjectId: import.meta.env.VITE_WALLET_KIT_PROJECT_ID,
      appName: APP_DETAILS.name,
      appDescription: APP_DETAILS.description,
      appUrl: APP_DETAILS.url,
      appIcon: APP_DETAILS.icon,
      batch: {
        multicall: {
          batchSize: 2 ** 16,
          wait: 100,
        },
      },
      cacheTime: 500,
      pollingInterval: 4000,
      ssr: import.meta.env.SSR,
    }),
  );
}
