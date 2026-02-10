/// <reference types="vitest/config" />
import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

const safeCspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://*.hypha.sh https://*.coinmarketcap.com;
    font-src 'self';
    connect-src 'self' https://*.morpho.org https://avalanche.gateway.tenderly.co https://api.avax.network https://avalanche.drpc.org https://*.walletconnect.com https://api.merkl.xyz https://www.google.com wss://*.walletconnect.com wss://*.walletconnect.org;
    media-src 'self' blob: https://cdn.morpho.org;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' https://*.walletconnect.org/ https://*.walletconnect.com;
    frame-ancestors 'self' https://app.safe.global;
    upgrade-insecure-requests;
    block-all-mixed-content;
`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [svgr(), tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    cors: true,
    allowedHosts: true,
    headers: {
      "Content-Security-Policy": safeCspHeader.replace(/\n/g, ""),
    },
  },
  preview: {
    cors: true,
    allowedHosts: true,
  },
  test: {
    include: ["./test/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globalSetup: ["./test/global-setup.ts"],
  },
});
