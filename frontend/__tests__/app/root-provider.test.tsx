/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';

const mockCreateAppWagmiConfig = jest.fn((_apiKey?: string) => ({ __fakeWagmiConfig: true }));
jest.mock('@/lib/wagmi-config', () => ({
  createAppWagmiConfig: (apiKey?: string) => mockCreateAppWagmiConfig(apiKey),
}));

jest.mock('wagmi', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="wagmi-provider">{children}</div>
  ),
}));

jest.mock('@coinbase/onchainkit', () => ({
  OnchainKitProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="onchainkit-provider">{children}</div>
  ),
}));

jest.mock('@coinbase/onchainkit/styles.css', () => ({}), { virtual: true });

import { RootProvider } from '@/app/rootProvider';

describe('RootProvider', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    mockCreateAppWagmiConfig.mockClear();
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_ONCHAINKIT_API_KEY: 'test-api-key' };
  });

  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('renders its children inside the provider tree', () => {
    render(
      <RootProvider>
        <p>hello world</p>
      </RootProvider>
    );
    expect(screen.getByTestId('wagmi-provider')).toBeInTheDocument();
    expect(screen.getByTestId('onchainkit-provider')).toBeInTheDocument();
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('builds the wagmi config once from the OnchainKit API key', () => {
    render(
      <RootProvider>
        <p>child</p>
      </RootProvider>
    );
    expect(mockCreateAppWagmiConfig).toHaveBeenCalledTimes(1);
    expect(mockCreateAppWagmiConfig).toHaveBeenCalledWith('test-api-key');
  });

  it('does not rebuild the wagmi config on rerender', () => {
    const { rerender } = render(
      <RootProvider>
        <p>child</p>
      </RootProvider>
    );
    rerender(
      <RootProvider>
        <p>child again</p>
      </RootProvider>
    );
    expect(mockCreateAppWagmiConfig).toHaveBeenCalledTimes(1);
  });
});
