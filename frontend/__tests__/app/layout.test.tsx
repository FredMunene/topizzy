/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';

jest.mock('@/app/rootProvider', () => ({
  RootProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@coinbase/onchainkit/minikit', () => ({
  SafeArea: ({ children }: { children: React.ReactNode }) => <div data-testid="safe-area">{children}</div>,
}));

jest.mock('@vercel/analytics/next', () => ({
  Analytics: () => <div data-testid="analytics" />,
}));

import RootLayout, { generateMetadata } from '@/app/layout';
import { minikitConfig } from '@/minikit.config';

describe('generateMetadata', () => {
  it('builds metadata from minikitConfig', async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toEqual({
      default: 'Topizzy: Buy Airtime using USDC Onchain',
      template: '%s | Topizzy',
    });
    expect(metadata.description).toBe(minikitConfig.miniapp.description);
    expect(metadata.applicationName).toBe('Topizzy');
    expect(String(metadata.metadataBase)).toBe(new URL(minikitConfig.miniapp.homeUrl).toString());
    expect(metadata.openGraph).toMatchObject({
      title: minikitConfig.miniapp.ogTitle,
      url: minikitConfig.miniapp.homeUrl,
      siteName: 'Topizzy',
    });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.other?.['fc:miniapp']).toContain(minikitConfig.miniapp.version);
  });
});

describe('RootLayout', () => {
  // RootLayout legitimately renders <html>/<body> — real Next.js swaps these
  // in for the document's own, but RTL mounts into a <div>, so React (rightly)
  // warns about invalid nesting here even though the component itself is fine.
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('renders children inside the provider tree and safe area', () => {
    render(
      <RootLayout>
        <p>page content</p>
      </RootLayout>
    );
    expect(screen.getByTestId('safe-area')).toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('embeds JSON-LD structured data for the organization and product', () => {
    const { container } = render(
      <RootLayout>
        <p>page content</p>
      </RootLayout>
    );
    const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]'));
    expect(scripts).toHaveLength(2);
    const parsed = scripts.map((s) => JSON.parse(s.innerHTML));
    expect(parsed[0]['@type']).toBe('Organization');
    expect(parsed[1]['@type']).toBe('Product');
  });
});
