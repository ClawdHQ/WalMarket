// Server-side Sui client — no 'use client', safe to import in API routes.
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { WalMarketClient } from '@walmarket/sdk';

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as 'testnet' | 'mainnet' | 'devnet';

export const serverSuiClient = new SuiClient({ url: getFullnodeUrl(network) });

let _serverWalMarketClient: WalMarketClient | null = null;

export function getServerWalMarketClient(): WalMarketClient {
  if (!_serverWalMarketClient) {
    _serverWalMarketClient = new WalMarketClient(serverSuiClient, {
      packageId: process.env.NEXT_PUBLIC_WALMARKET_PACKAGE_ID ?? '',
      latestPackageId: process.env.NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID || process.env.NEXT_PUBLIC_WALMARKET_PACKAGE_ID || '',
      registryId: process.env.NEXT_PUBLIC_WALMARKET_REGISTRY_ID ?? '',
      network,
    });
  }
  return _serverWalMarketClient;
}

export const AGENT_API_PACKAGE_ID  = process.env.NEXT_PUBLIC_WALMARKET_PACKAGE_ID ?? '';
export const AGENT_API_LATEST_PKG  = process.env.NEXT_PUBLIC_WALMARKET_LATEST_PACKAGE_ID ?? AGENT_API_PACKAGE_ID;
export const AGENT_API_REGISTRY_ID = process.env.NEXT_PUBLIC_WALMARKET_REGISTRY_ID ?? '';
export const AGENT_API_NETWORK     = network;
export const AGENT_API_RPC         = getFullnodeUrl(network);
