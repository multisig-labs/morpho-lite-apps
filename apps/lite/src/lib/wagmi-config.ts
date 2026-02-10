import { getDefaultConfig as createConnectKitConfigParams, getDefaultConnectors } from "connectkit";
import type { Chain, HttpTransportConfig } from "viem";
import { CreateConnectorFn, createConfig as createWagmiConfig, fallback, http, type Transport } from "wagmi";
import { avalanche } from "wagmi/chains";
import { safe } from "wagmi/connectors";

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
  const app = {
    name: APP_DETAILS.name,
    description: APP_DETAILS.description,
    url: APP_DETAILS.url,
    icon: APP_DETAILS.icon,
  };
  const walletConnectProjectId = import.meta.env.VITE_WALLET_KIT_PROJECT_ID;

  const defaultConnectors = getDefaultConnectors({
    app,
    walletConnectProjectId,
    enableFamily: false,
  });

  const isSafeApp = typeof window !== "undefined" && window.parent !== window;
  const connectors = args.connectors
    ? args.connectors
    : isSafeApp
      ? [
          safe({
            allowedDomains: [/gnosis-safe.io$/, /app.safe.global$/],
            unstable_getInfoTimeout: 1000,
          }),
          ...defaultConnectors.filter((connector) => connector.id !== "safe"),
        ]
      : defaultConnectors;

  return createWagmiConfig(
    createConnectKitConfigParams({
      enableFamily: false,
      chains: args.chains ?? chains,
      transports: args.transports ?? transports,
      connectors,
      walletConnectProjectId,
      appName: app.name,
      appDescription: app.description,
      appUrl: app.url,
      appIcon: app.icon,
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
