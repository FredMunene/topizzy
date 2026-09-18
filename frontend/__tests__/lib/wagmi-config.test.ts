// coinbaseWallet transitively pulls in several wallet SDKs (Gemini, etc.)
// shipped as ESM-only builds with no CJS fallback — irrelevant to what this
// test verifies (that createAppWagmiConfig wires the right chains/transports),
// so stub it out rather than transforming that whole dependency tree.
jest.mock('wagmi/connectors', () => ({
  coinbaseWallet: jest.fn(() => () => ({ id: 'coinbaseWallet' })),
}));

import { createAppWagmiConfig } from '@/lib/wagmi-config';
import { base } from 'wagmi/chains';
import { arc } from '@/lib/chains';

describe('createAppWagmiConfig', () => {
  it('configures both base and arc chains', () => {
    const config = createAppWagmiConfig();
    expect(config.chains.map((c) => c.id)).toEqual(expect.arrayContaining([base.id, arc.id]));
  });

  it('registers exactly one connector (Coinbase Wallet)', () => {
    const config = createAppWagmiConfig();
    expect(config.connectors).toHaveLength(1);
  });

  it('works without an OnchainKit API key', () => {
    expect(() => createAppWagmiConfig()).not.toThrow();
    expect(() => createAppWagmiConfig(undefined)).not.toThrow();
  });

  it('works with an OnchainKit API key (routes Base transport through the Coinbase RPC)', () => {
    expect(() => createAppWagmiConfig('test-api-key')).not.toThrow();
  });
});
