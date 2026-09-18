import { createConfig, createStorage, cookieStorage, http } from 'wagmi';
import { coinbaseWallet } from 'wagmi/connectors';
import { base } from 'wagmi/chains';
import { arc } from './chains';

/**
 * Own wagmi config so we can add Arc alongside Base — OnchainKit's built-in
 * default config only knows about Base/Base Sepolia and has no override point
 * for extra chains. OnchainKitProvider detects and reuses this config when it's
 * supplied by an ancestor WagmiProvider (see app/rootProvider.tsx), so the rest
 * of OnchainKit/MiniKit behavior is unaffected.
 */
export function createAppWagmiConfig(apiKey?: string) {
  return createConfig({
    chains: [base, arc],
    connectors: [
      coinbaseWallet({
        appName: 'Topizzy',
        preference: 'all',
      }),
    ],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
      [base.id]: apiKey ? http(`https://api.developer.coinbase.com/rpc/v1/base/${apiKey}`) : http(),
      [arc.id]: http(),
    },
  });
}
