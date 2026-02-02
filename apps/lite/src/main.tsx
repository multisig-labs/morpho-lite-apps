import { getChainSlug } from "@morpho-org/uikit/lib/utils";
import "core-js/stable/array/iterator";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";

import "@/index.css";
import { BorrowSubPage } from "@/app/dashboard/borrow-subpage.tsx";
import { EarnSubPage } from "@/app/dashboard/earn-subpage.tsx";
import Page from "@/app/dashboard/page.tsx";
import { MarketDetailsPage } from "@/app/market/page.tsx";
import { VaultDetailsPage } from "@/app/vault/page.tsx";
import { VaultV2DetailsPage } from "@/app/vault-v2/page.tsx";
import App from "@/App.tsx";
import { DEFAULT_CHAIN } from "@/lib/constants";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <App>
              <Outlet />
            </App>
          }
        >
          <Route index element={<Navigate replace to={getChainSlug(DEFAULT_CHAIN)} />} />
          <Route path=":chain/">
            <Route index element={<Navigate replace to="earn" />} />
            <Route element={<Page />}>
              <Route path="earn" element={<EarnSubPage />} />
              <Route path="borrow" element={<BorrowSubPage />} />
            </Route>
            <Route path="market/:id" element={<MarketDetailsPage />} />
            <Route path="vault/:address" element={<VaultDetailsPage />} />
            <Route path="vault-v2/:address" element={<VaultV2DetailsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
