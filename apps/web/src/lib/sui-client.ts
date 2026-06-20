'use client';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { WalMarketClient } from '@walmarket/sdk';
import { WALMARKET_PACKAGE_ID, WALMARKET_LATEST_PACKAGE_ID, WALMARKET_REGISTRY_ID, SUI_NETWORK } from './constants';

export const suiClient = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet') });

let _walmarketClient: WalMarketClient | null = null;

export function getWalMarketClient(): WalMarketClient {
  if (!_walmarketClient) {
    _walmarketClient = new WalMarketClient(suiClient, {
      packageId: WALMARKET_PACKAGE_ID,
      latestPackageId: WALMARKET_LATEST_PACKAGE_ID,
      registryId: WALMARKET_REGISTRY_ID,
      network: SUI_NETWORK,
    });
  }
  return _walmarketClient;
}
