import SafeAppsSDK from "@safe-global/safe-apps-sdk";
import { withTimeout } from "viem";

const SAFE_ALLOWED_DOMAINS = [/gnosis-safe.io$/, /app.safe.global$/];

export async function initSafeApp() {
  if (typeof window === "undefined" || window.parent === window) return;

  const sdk = new SafeAppsSDK({ allowedDomains: SAFE_ALLOWED_DOMAINS });

  try {
    await withTimeout(() => sdk.safe.getInfo(), { timeout: 1000 });
  } catch {
    // Best-effort initialization to signal Safe App support.
  }
}
