import { Address, isAddressEqual } from "viem";
import { avalanche } from "wagmi/chains";

import { graphql, FragmentOf } from "@/graphql/graphql";

export const CuratorFragment = graphql(`
  fragment Curator on Curator @_unmask {
    addresses {
      address
      chainId
    }
    image
    name
    url
  }
`);

export const MANUALLY_WHITELISTED_CURATORS: FragmentOf<typeof CuratorFragment>[] = [
  {
    addresses: [{ address: "0xf5c149aCB200f5BC8FC5e51dF4a7DEf38d64cfB2", chainId: avalanche.id }],
    image: "https://cdn.morpho.org/v2/assets/images/re7.png",
    name: "Hypha",
    url: "https://www.hypha.sh/",
  },
];

export const ADDITIONAL_OFFCHAIN_CURATORS: Record<Address, DisplayableCurators> = {};

export type VaultV2CuratorInfo = {
  name: string;
  address: Address;
  url?: string | null;
  imageSrc?: string | null;
};

export const VAULT_V2_CURATORS: Record<number, Record<string, VaultV2CuratorInfo>> = {
  [avalanche.id]: {
    "0x10f547614327d67d2f19a3d04c49550e4d07ad04": {
      name: "Hypha",
      address: "0xf5c149acb200f5bc8fc5e51df4a7def38d64cfb2",
      url: "https://www.hypha.sh/",
      imageSrc: "https://lending.hypha.sh/favicon.svg",
    },
  },
};

export function getVaultV2Curator(chainId: number | undefined, vaultAddress: Address): VaultV2CuratorInfo | undefined {
  if (chainId === undefined) return undefined;
  return VAULT_V2_CURATORS[chainId]?.[vaultAddress.toLowerCase()];
}

export type DisplayableCurators = {
  [name: string]: {
    name: string;
    roles: { name: string; address: Address }[];
    url: string | null;
    imageSrc: string | null;
    shouldAlwaysShow: boolean;
  };
};

const ROLE_NAMES = ["owner", "curator", "guardian"] as const;
export function getDisplayableCurators(
  vault: { [role in (typeof ROLE_NAMES)[number]]: Address } & { address: Address },
  curators: FragmentOf<typeof CuratorFragment>[],
  chainId: number | undefined,
) {
  const result: DisplayableCurators = {};
  for (const roleName of ROLE_NAMES) {
    for (const curator of curators) {
      const address = curator.addresses?.find(
        (entry) => entry.chainId === chainId && isAddressEqual(entry.address as Address, vault[roleName]),
      )?.address as Address | undefined;
      if (!address) continue;

      const roleNameCapitalized = `${roleName.charAt(0).toUpperCase()}${roleName.slice(1)}`;
      const shouldAlwaysShow = roleName === "owner" || roleName === "curator";
      if (result[curator.name]) {
        result[curator.name].shouldAlwaysShow ||= shouldAlwaysShow;
        result[curator.name].roles.push({ name: roleNameCapitalized, address });
      } else {
        result[curator.name] = {
          name: curator.name,
          roles: [{ name: roleNameCapitalized, address }],
          url: curator.url,
          imageSrc: curator.image,
          shouldAlwaysShow,
        };
      }
    }
  }
  if (ADDITIONAL_OFFCHAIN_CURATORS[vault.address]) {
    return { ...result, ...ADDITIONAL_OFFCHAIN_CURATORS[vault.address] };
  }
  return result;
}
