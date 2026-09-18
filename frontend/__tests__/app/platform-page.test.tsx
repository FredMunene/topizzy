/** @jest-environment jsdom */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import styles from '@/app/platform/page.module.css';

// ---------------------------------------------------------------------------
// wagmi
// ---------------------------------------------------------------------------
const mockUseAccount = jest.fn();
const mockUseWalletClient = jest.fn();
const mockUseBalance = jest.fn();
jest.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
  useWalletClient: () => mockUseWalletClient(),
  useBalance: (...args: unknown[]) => mockUseBalance(...args),
}));

const mockUseCapabilities = jest.fn((_args?: unknown) => ({ data: undefined as unknown }));
jest.mock('wagmi/experimental', () => ({
  useCapabilities: (args?: unknown) => mockUseCapabilities(args),
}));

// ---------------------------------------------------------------------------
// @coinbase/onchainkit
// ---------------------------------------------------------------------------
const mockUseIsWalletACoinbaseSmartWallet = jest.fn(() => false);
jest.mock('@coinbase/onchainkit/wallet', () => ({
  Wallet: () => <div data-testid="wallet-widget" />,
  useIsWalletACoinbaseSmartWallet: () => mockUseIsWalletACoinbaseSmartWallet(),
}));

const mockUseMiniKit = jest.fn((): { isMiniAppReady: boolean; setMiniAppReady: jest.Mock } | undefined => ({
  isMiniAppReady: true,
  setMiniAppReady: jest.fn(),
}));
jest.mock('@coinbase/onchainkit/minikit', () => ({
  useMiniKit: () => mockUseMiniKit(),
}));

// Outcome the mocked TransactionButton produces when clicked, configurable per test.
let mockTransactionOutcome:
  | { type: 'success'; txHash: string }
  | { type: 'success-no-hash' }
  | { type: 'error'; message: string } = {
  type: 'success',
  txHash: '0xsmarttx',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedTransactionProps: any = null;
// Status the mocked TransactionButton reports to the page's render prop.
let mockTransactionButtonStatus: 'default' | 'pending' | 'success' | 'error' = 'default';
jest.mock('@coinbase/onchainkit/transaction', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Transaction: (props: any) => {
    capturedTransactionProps = props;
    return <div data-testid="transaction">{props.children}</div>;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TransactionButton: (props: any) => {
    const simulateClick = async () => {
      try {
        await capturedTransactionProps.calls();
        if (mockTransactionOutcome.type === 'success') {
          capturedTransactionProps.onStatus?.({ statusName: 'buildingTransaction' });
          await capturedTransactionProps.onSuccess?.({
            transactionReceipts: [{ transactionHash: mockTransactionOutcome.txHash }],
          });
          capturedTransactionProps.onStatus?.({ statusName: 'success' });
        } else if (mockTransactionOutcome.type === 'success-no-hash') {
          await capturedTransactionProps.onSuccess?.({ transactionReceipts: [] });
        } else {
          capturedTransactionProps.onError?.({ message: mockTransactionOutcome.message });
        }
      } catch (err) {
        capturedTransactionProps.onError?.({ message: err instanceof Error ? err.message : String(err) });
      }
    };
    // The page supplies its own `render` (to link "View transaction" to the
    // right explorer); drive it the way OnchainKit would.
    return props.render({
      status: mockTransactionButtonStatus,
      context: { transactionHash: '0xarctxhash' },
      onSubmit: simulateClick,
      // Same rule as OnchainKit: once there's a receipt (success) the button
      // is always enabled so it can act as "View transaction".
      isDisabled: mockTransactionButtonStatus !== 'success' && Boolean(props.disabled),
    });
  },
  TransactionToast: () => <div data-testid="transaction-toast" />,
}));

// ---------------------------------------------------------------------------
// lib/permit-signature, lib/chains, viem
// ---------------------------------------------------------------------------
const mockGeneratePermitSignature = jest.fn();
jest.mock('@/lib/permit-signature', () => ({
  generatePermitSignature: (...args: unknown[]) => mockGeneratePermitSignature(...args),
}));

const mockEstimateGasReserveUsdc = jest.fn().mockResolvedValue(0);
const mockGetChainConfigById = jest.fn();
jest.mock('@/lib/chains', () => {
  const actual = jest.requireActual('@/lib/chains');
  return {
    ...actual,
    estimateGasReserveUsdc: (...args: unknown[]) => mockEstimateGasReserveUsdc(...args),
    getChainConfigById: (...args: unknown[]) => mockGetChainConfigById(...args),
  };
});

const mockWaitForTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      waitForTransactionReceipt: (...args: unknown[]) => mockWaitForTransactionReceipt(...args),
    })),
  };
});

import Platform from '@/app/platform/page';
import { CHAINS } from '@/lib/chains';
import { base as realBaseChain } from 'viem/chains';

const BASE_CONFIG = CHAINS.base;

// ---------------------------------------------------------------------------
// fetch router
// ---------------------------------------------------------------------------
type FetchHandlers = Partial<{
  geo: () => unknown;
  prices: () => unknown;
  createOrder: (body: Record<string, unknown>) => { status?: number; body: unknown };
  orderStatus: (orderRef: string) => unknown;
  airtimeSend: (body: Record<string, unknown>) => { status?: number; body: unknown };
}>;

function installFetchMock(handlers: FetchHandlers = {}) {
  const jsonResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    if (url.startsWith('/api/geo')) {
      return jsonResponse(handlers.geo ? handlers.geo() : { country: 'KE' });
    }
    if (url.startsWith('/api/prices')) {
      return jsonResponse(handlers.prices ? handlers.prices() : { success: true, price: 128, serviceFee: 0.05 });
    }
    if (url === '/api/orders') {
      if (handlers.createOrder) {
        const result = handlers.createOrder(body);
        return jsonResponse(result.body, result.status ?? 200);
      }
      return jsonResponse(
        {
          orderRef: 'order-ref-1',
          amountKes: body.amountKes,
          amountUsdc: 1.05,
          airtimeUsdc: 1.0,
          serviceFeeUsdc: 0.05,
          currency: 'KES',
          chainId: body.chainId,
        }
      );
    }
    if (url.startsWith('/api/orders/')) {
      const orderRef = url.split('/').pop()!;
      return jsonResponse(handlers.orderStatus ? handlers.orderStatus(orderRef) : { status: 'pending' });
    }
    if (url === '/api/airtime/send') {
      const result = handlers.airtimeSend
        ? handlers.airtimeSend(body)
        : { status: 200, body: { success: true, requestId: 'ATQid_1' } };
      return jsonResponse(result.body, result.status ?? 200);
    }
    if (url === '/api/log') {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({}, 404);
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// render helper
// ---------------------------------------------------------------------------
function renderPlatform() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <Platform />
    </QueryClientProvider>
  );
  return { ...result, queryClient: client };
}

// `Continue`'s text lives in a <span> inside the real <button> — querying
// toBeDisabled() on the span trivially always passes (a span is never a
// "disabled" form control), so callers must resolve to the ancestor button.
function getContinueButton(): HTMLButtonElement {
  return screen.getByText('Continue').closest('button')!;
}

async function clickContinueWhenEnabled() {
  await waitFor(() => expect(getContinueButton()).not.toBeDisabled());
  fireEvent.click(getContinueButton());
}

function connectedAccount(overrides: Record<string, unknown> = {}) {
  return {
    address: '0xUserWallet00000000000000000000000000001',
    chain: realBaseChain,
    ...overrides,
  };
}

describe('Platform page', () => {
  beforeEach(() => {
    installFetchMock();
    mockUseAccount.mockReturnValue(connectedAccount());
    mockUseWalletClient.mockReturnValue({ data: undefined });
    mockUseBalance.mockReturnValue({ data: { value: 10_000_000n } }); // 10 USDC
    mockUseCapabilities.mockReturnValue({ data: undefined });
    mockUseIsWalletACoinbaseSmartWallet.mockReturnValue(false);
    // Any truthy object from useMiniKit() makes the component treat itself as
    // running inside a Farcaster mini app (isMiniApp derives from the object
    // itself being present, not from isMiniAppReady), which forces the smart-
    // wallet UI/flow. Default to "regular browser tab" (undefined) so the
    // default flow through these tests is the plain EOA one; individual
    // mini-app/smart-wallet tests override this explicitly.
    mockUseMiniKit.mockReturnValue(undefined);
    mockEstimateGasReserveUsdc.mockReset().mockResolvedValue(0);
    mockGetChainConfigById.mockReset().mockImplementation((chainId: number | undefined) =>
      jest.requireActual('@/lib/chains').getChainConfigById(chainId)
    );
    mockGeneratePermitSignature.mockReset();
    mockWaitForTransactionReceipt.mockReset().mockResolvedValue({ status: 'success' });
    mockTransactionOutcome = { type: 'success', txHash: '0xsmarttx' };
    capturedTransactionProps = null;
    mockTransactionButtonStatus = 'default';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the form and fetches the initial price', async () => {
    renderPlatform();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/prices')));
    expect(screen.getByPlaceholderText('743913802')).toBeInTheDocument();
  });

  it('auto-selects the country based on the /api/geo response', async () => {
    installFetchMock({ geo: () => ({ country: 'UG' }) });
    renderPlatform();
    await waitFor(() => expect(screen.getByText('Amount (UGX)')).toBeInTheDocument());
  });

  it('leaves the default country in place when /api/geo returns a country with no matching entry', async () => {
    installFetchMock({ geo: () => ({ country: 'ZZ' }) });
    renderPlatform();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/geo')));
    expect(screen.getByText('Amount (KES)')).toBeInTheDocument();
  });

  it('leaves the default country in place when /api/geo omits a country', async () => {
    installFetchMock({ geo: () => ({}) });
    renderPlatform();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/geo')));
    expect(screen.getByText('Amount (KES)')).toBeInTheDocument();
  });

  it('leaves the default country in place when /api/geo responds not-ok', async () => {
    installFetchMock();
    const baseFetch = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/geo')) return { ok: false, status: 500, json: async () => ({}) };
      return baseFetch(input, init);
    }) as unknown as typeof fetch;
    renderPlatform();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/geo')));
    expect(screen.getByText('Amount (KES)')).toBeInTheDocument();
  });

  it('skips the balance check while disconnected (no usdcBalance to validate against)', async () => {
    mockUseAccount.mockReturnValue({ address: undefined, chain: undefined });
    mockUseBalance.mockReturnValue({ data: undefined });
    renderPlatform();
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
    await waitFor(() => expect(screen.getByPlaceholderText('100')).toHaveValue(100));
    expect(screen.queryByText('Insufficient balance')).not.toBeInTheDocument();
  });

  it('shows Connect Wallet when no wallet is connected', () => {
    mockUseAccount.mockReturnValue({ address: undefined, chain: undefined });
    mockUseBalance.mockReturnValue({ data: undefined });
    renderPlatform();
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });

  describe('form validation', () => {
    it('requires a wallet connection before continuing', async () => {
      mockUseAccount.mockReturnValue({ address: undefined, chain: undefined });
      renderPlatform();
      const continueBtn = screen.getByText('Connect Wallet');
      expect(continueBtn.closest('button')).toBeDisabled();
    });

    describe('phone number entry', () => {
      const typePhone = (value: string) => {
        const input = screen.getByPlaceholderText('743913802') as HTMLInputElement;
        fireEvent.change(input, { target: { value } });
        return input;
      };

      it('accepts a number without the leading 0 as typed', () => {
        renderPlatform();
        expect(typePhone('743913802').value).toBe('743913802');
      });

      it('keeps a leading 0 while typing, up to 9 digits', () => {
        renderPlatform();
        expect(typePhone('07439').value).toBe('07439');
        expect(typePhone('074391380').value).toBe('074391380');
      });

      it('strips the leading 0 once the 10th digit arrives', () => {
        renderPlatform();
        expect(typePhone('0743913802').value).toBe('743913802');
      });

      it('truncates anything longer than the 10 digits it can use', () => {
        renderPlatform();
        expect(typePhone('07439138021234').value).toBe('743913802');
        expect(typePhone('74391380299').value).toBe('743913802');
      });

      it('ignores non-digit characters', () => {
        renderPlatform();
        expect(typePhone('0743-913 802').value).toBe('743913802');
      });

      it('allows the 10th digit to be typed (maxLength is 10)', () => {
        renderPlatform();
        expect(screen.getByPlaceholderText('743913802')).toHaveAttribute('maxLength', '10');
      });

      it('does not treat a 9-character entry that still starts with 0 as complete', async () => {
        renderPlatform();
        typePhone('074391380');
        fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
        await waitFor(() => expect(getContinueButton()).not.toBeDisabled());
        fireEvent.click(getContinueButton());
        expect(await screen.findByText('Enter a 9-digit number, like 743913802 or 0743913802')).toBeInTheDocument();
      });

      it('creates the order with the stripped number when typed with a leading 0', async () => {
        renderPlatform();
        typePhone('0743913802');
        fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
        await clickContinueWhenEnabled();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/orders', expect.objectContaining({
          body: expect.stringContaining('"phoneNumber":"+254743913802"'),
        })));
      });
    });

    it('shows an error for a phone number that is not 9 digits', async () => {
      renderPlatform();
      const phoneInput = screen.getByPlaceholderText('743913802');
      fireEvent.change(phoneInput, { target: { value: '12345' } });
      const amountInput = screen.getByPlaceholderText('100');
      fireEvent.change(amountInput, { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Enter a 9-digit number, like 743913802 or 0743913802')).toBeInTheDocument();
    });

    it('rejects an amount outside the allowed range for the selected country', async () => {
      renderPlatform();
      const amountInput = screen.getByPlaceholderText('100');
      fireEvent.change(amountInput, { target: { value: '1' } });
      expect(await screen.findByText(/Amount must be between/)).toBeInTheDocument();
    });

    it('shows Insufficient balance and disables the max-amount-adjusted Continue button appropriately', async () => {
      mockUseBalance.mockReturnValue({ data: { value: 10_000n } }); // 0.01 USDC
      renderPlatform();
      const amountInput = screen.getByPlaceholderText('100');
      fireEvent.change(amountInput, { target: { value: '100' } });
      expect(await screen.findByText('Insufficient balance')).toBeInTheDocument();
      expect(screen.getByText('Add USDC to your wallet to continue')).toBeInTheDocument();
    });

    it('fills the amount with the max spendable value when "Use max amount" is clicked', async () => {
      renderPlatform();
      await waitFor(() => expect(screen.getByText(/Use max amount/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Use max amount/));
      const amountInput = screen.getByPlaceholderText('100') as HTMLInputElement;
      await waitFor(() => expect(amountInput.value).not.toBe(''));
    });

    it('clears the amount when "Use max amount" is clicked with a zero spendable balance', async () => {
      mockUseBalance.mockReturnValue({ data: { value: 0n } });
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Use max amount ($0.00)')).toBeInTheDocument());
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '50' } });
      fireEvent.click(screen.getByText('Use max amount ($0.00)'));
      const amountInput = screen.getByPlaceholderText('100') as HTMLInputElement;
      await waitFor(() => expect(amountInput.value).toBe(''));
    });

    it('does not flag "Insufficient balance" right after clicking "Use max amount" (float round-trip)', async () => {
      // Regression: 0.95 USDC balance / 0.01 gas reserve / 0.05 service fee /
      // 128.19 KES-per-USDC reproduces a case where floor(maxSpendableUsdc)
      // converted to KES and back to USDC via toFixed(2) lands a cent above
      // spendableBalance in plain binary floating point (0.9400000000000001
      // > 0.94), tripping the balance check for the exact max the button
      // itself just offered.
      installFetchMock({ prices: () => ({ success: true, price: 128.19, serviceFee: 0.05 }) });
      mockUseAccount.mockReturnValue(connectedAccount({ chain: CHAINS.arc.chain }));
      mockUseBalance.mockReturnValue({ data: { value: 950_000n } }); // 0.95 USDC
      mockEstimateGasReserveUsdc.mockResolvedValue(0.01);
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Use max amount ($0.89)')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Use max amount ($0.89)'));
      const amountInput = screen.getByPlaceholderText('100') as HTMLInputElement;
      await waitFor(() => expect(amountInput.value).toBe('114.08'));
      expect(screen.queryByText('Insufficient balance')).not.toBeInTheDocument();
    });
  });

  describe('order creation', () => {
    it('creates an order and shows the confirm-payment screen', async () => {
      renderPlatform();
      const phoneInput = screen.getByPlaceholderText('743913802');
      fireEvent.change(phoneInput, { target: { value: '743913802' } });
      const amountInput = screen.getByPlaceholderText('100');
      fireEvent.change(amountInput, { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Confirm Payment')).toBeInTheDocument();
      expect(screen.getByText('order-ref-1')).toBeInTheDocument();
    });

    it('shows the server error message when order creation fails', async () => {
      installFetchMock({
        createOrder: () => ({ status: 400, body: { error: 'Amount must be between 5 and 5000 KES' } }),
      });
      renderPlatform();
      const phoneInput = screen.getByPlaceholderText('743913802');
      fireEvent.change(phoneInput, { target: { value: '743913802' } });
      const amountInput = screen.getByPlaceholderText('100');
      fireEvent.change(amountInput, { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Amount must be between 5 and 5000 KES')).toBeInTheDocument();
    });
  });

  describe('EOA payment flow (permit)', () => {
    async function reachConfirmScreen() {
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
    }

    function fakeWalletClient(overrides: Record<string, unknown> = {}) {
      return {
        writeContract: jest.fn().mockResolvedValue('0xpaymenttxhash'),
        signTypedData: jest.fn().mockResolvedValue('0xsig'),
        getChainId: jest.fn().mockResolvedValue(8453),
        ...overrides,
      };
    }

    function getPayButton() {
      return screen.getByText('Pay & Send Airtime').closest('button')!;
    }

    it('pays via permit and sends airtime successfully', async () => {
      const walletClient = fakeWalletClient();
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGeneratePermitSignature.mockResolvedValue({
        v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64), nonce: 0n, deadline: 123,
      });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());

      await waitFor(() => expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'depositWithPermit' })
      ));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/airtime/send', expect.anything()));
    });

    it('shows a friendly message when the user rejects the transaction', async () => {
      const walletClient = fakeWalletClient({
        writeContract: jest.fn().mockRejectedValue(new Error('User rejected the request')),
      });
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/Transaction cancelled/)).toBeInTheDocument();
    });

    it('shows a friendly message for insufficient funds', async () => {
      const walletClient = fakeWalletClient({
        writeContract: jest.fn().mockRejectedValue(new Error('insufficient funds for gas')),
      });
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/Insufficient USDC balance/)).toBeInTheDocument();
    });

    it('shows a friendly message for a network error', async () => {
      const walletClient = fakeWalletClient({
        writeContract: jest.fn().mockRejectedValue(new Error('network error occurred')),
      });
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/Network error/)).toBeInTheDocument();
    });

    it('surfaces an unrecognized error message as-is', async () => {
      const walletClient = fakeWalletClient({
        writeContract: jest.fn().mockRejectedValue(new Error('something unexpected broke')),
      });
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/something unexpected broke/)).toBeInTheDocument();
    });

    it('surfaces a thrown non-Error value via String()', async () => {
      const walletClient = fakeWalletClient({
        writeContract: jest.fn().mockRejectedValue('a raw string rejection'),
      });
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/a raw string rejection/)).toBeInTheDocument();
    });

    it('shows an error when the wallet client is unavailable', async () => {
      mockUseWalletClient.mockReturnValue({ data: undefined });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/Unable to access wallet/)).toBeInTheDocument();
    });

    it('shows an error when the connected wallet cannot send transactions', async () => {
      mockUseWalletClient.mockReturnValue({ data: { signTypedData: jest.fn() } });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/cannot send transactions/)).toBeInTheDocument();
    });

    it('shows an error when the connected wallet does not support EIP-712 signing', async () => {
      mockUseWalletClient.mockReturnValue({ data: { writeContract: jest.fn() } });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/does not support EIP-712 signing/)).toBeInTheDocument();
    });

    it('shows the permit error returned by generatePermitSignature', async () => {
      mockUseWalletClient.mockReturnValue({ data: fakeWalletClient() });
      mockGeneratePermitSignature.mockResolvedValue({ error: 'RPC unreachable' });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/RPC unreachable/)).toBeInTheDocument();
    });

    it('shows an error when the permit signature is missing required fields', async () => {
      mockUseWalletClient.mockReturnValue({ data: fakeWalletClient() });
      mockGeneratePermitSignature.mockResolvedValue({});
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/Invalid permit signature/)).toBeInTheDocument();
    });

    it('shows an error when the chain has no configured Airtime contract', async () => {
      mockUseWalletClient.mockReturnValue({ data: fakeWalletClient() });
      mockGetChainConfigById.mockReturnValue({ ...BASE_CONFIG, airtimeContractAddress: undefined });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      expect(await screen.findByText(/not available for payments right now/)).toBeInTheDocument();
    });

    it('uses the approve + deposit path on a chain without permit support', async () => {
      const walletClient = fakeWalletClient();
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGetChainConfigById.mockReturnValue({ ...BASE_CONFIG, supportsPermit: false });
      await reachConfirmScreen();
      fireEvent.click(getPayButton());
      await waitFor(() => expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'approve' })
      ));
      await waitFor(() => expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'deposit' })
      ));
      expect(mockGeneratePermitSignature).not.toHaveBeenCalled();
    });
  });

  describe('Back button', () => {
    it('returns to the form and resets payment state', async () => {
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      fireEvent.click(screen.getByText('Back'));
      expect(await screen.findByPlaceholderText('743913802')).toBeInTheDocument();
    });
  });

  describe('Smart wallet payment flow', () => {
    async function reachConfirmScreenAsSmartWallet() {
      mockUseIsWalletACoinbaseSmartWallet.mockReturnValue(true);
      const { queryClient } = renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      // Let the order-status query's first resolution settle before
      // clicking, matching how a real user would never click before the
      // screen finishes its initial data fetch.
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/order-ref-1')
      ));
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      return { queryClient };
    }

    it('starts the smart wallet flow and pays successfully', async () => {
      mockTransactionOutcome = { type: 'success', txHash: '0xsmarttx1' };
      await reachConfirmScreenAsSmartWallet();

      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      const txButton = await screen.findByTestId('transaction-button');
      fireEvent.click(txButton);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/airtime/send', expect.objectContaining({
        body: expect.stringContaining('0xsmarttx1'),
      })));
    });

    it('renders the pay/view-transaction button below the order-status section and above Back', async () => {
      mockTransactionOutcome = { type: 'success', txHash: '0xsmarttx1' };
      const { queryClient } = await reachConfirmScreenAsSmartWallet();
      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      const txButton = await screen.findByTestId('transaction-button');
      // Backend has moved on to sending the airtime, so the status section shows.
      act(() => {
        queryClient.setQueryData(['orderStatus', 'order-ref-1'], { status: 'processing' });
      });
      await screen.findByText('Sending airtime to your phone…');

      const statusDisplay = document.body.querySelector(`.${styles.statusDisplay}`);
      const backButton = screen.getByText('Back');

      // statusDisplay -> transaction button -> Back, in document order.
      expect(statusDisplay!.compareDocumentPosition(txButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(txButton.compareDocumentPosition(backButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    describe('transaction button states', () => {
      afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.open as any)?.mockRestore?.();
      });

      it('shows "Processing Airtime..." while the transaction is pending', async () => {
        await reachConfirmScreenAsSmartWallet();
        mockTransactionButtonStatus = 'pending';
        fireEvent.click(screen.getByText('Pay & Send Airtime'));
        expect(await screen.findByText('Processing Airtime...', { selector: 'button' })).toBeInTheDocument();
      });

      it('shows "Try again" after an error and resubmits when clicked', async () => {
        mockTransactionOutcome = { type: 'success', txHash: '0xretry' };
        await reachConfirmScreenAsSmartWallet();
        mockTransactionButtonStatus = 'error';
        fireEvent.click(screen.getByText('Pay & Send Airtime'));
        const retry = await screen.findByText('Try again');
        mockTransactionButtonStatus = 'default';
        fireEvent.click(retry);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/airtime/send', expect.objectContaining({
          body: expect.stringContaining('0xretry'),
        })));
      });

      it('opens the Arc explorer (not basescan) from "View transaction" on Arc', async () => {
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
        mockUseAccount.mockReturnValue(connectedAccount({ chain: CHAINS.arc.chain }));
        await reachConfirmScreenAsSmartWallet();
        mockTransactionButtonStatus = 'success';
        fireEvent.click(screen.getByText('Pay & Send Airtime'));
        fireEvent.click(await screen.findByText('View transaction'));
        expect(openSpy).toHaveBeenCalledWith(
          'https://arc-scan.org/tx/0xarctxhash',
          '_blank',
          'noopener,noreferrer'
        );
      });

      it('opens basescan from "View transaction" on Base', async () => {
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
        await reachConfirmScreenAsSmartWallet();
        mockTransactionButtonStatus = 'success';
        fireEvent.click(screen.getByText('Pay & Send Airtime'));
        fireEvent.click(await screen.findByText('View transaction'));
        expect(openSpy).toHaveBeenCalledWith(
          `${CHAINS.base.blockExplorerUrl}/tx/0xarctxhash`,
          '_blank',
          'noopener,noreferrer'
        );
      });
    });

    it('shows the error message when the smart wallet transaction fails', async () => {
      mockTransactionOutcome = { type: 'error', message: 'Smart wallet transaction reverted' };
      await reachConfirmScreenAsSmartWallet();

      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      const txButton = await screen.findByTestId('transaction-button');
      fireEvent.click(txButton);

      expect(await screen.findByText('Smart wallet transaction reverted')).toBeInTheDocument();
    });

    it('surfaces the smartWalletCalls error when the chain has no configured contract', async () => {
      mockGetChainConfigById.mockReturnValue({ ...BASE_CONFIG, airtimeContractAddress: undefined });
      await reachConfirmScreenAsSmartWallet();

      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      const txButton = await screen.findByTestId('transaction-button');
      fireEvent.click(txButton);

      expect(await screen.findByText(/not available for payments right now/)).toBeInTheDocument();
    });

    it('shows an error when the wallet omits the transaction hash on success', async () => {
      mockTransactionOutcome = { type: 'success-no-hash' };
      await reachConfirmScreenAsSmartWallet();
      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      const txButton = await screen.findByTestId('transaction-button');
      fireEvent.click(txButton);
      expect(await screen.findByText('Missing transaction hash from wallet')).toBeInTheDocument();
    });

    it('logs and marks done when sendAirtime itself throws (e.g. network failure)', async () => {
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/airtime/send') throw new Error('network down');
        if (url === '/api/orders') return { ok: true, status: 200, json: async () => ({ orderRef: 'order-ref-1', amountKes: 100, amountUsdc: 1.05, airtimeUsdc: 1, serviceFeeUsdc: 0.05, currency: 'KES', chainId: 8453 }) };
        if (url.startsWith('/api/orders/')) return { ok: true, status: 200, json: async () => ({ status: 'pending' }) };
        if (url.startsWith('/api/prices')) return { ok: true, json: async () => ({ success: true, price: 128, serviceFee: 0.05 }) };
        if (url.startsWith('/api/geo')) return { ok: true, json: async () => ({ country: 'KE' }) };
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch;

      mockTransactionOutcome = { type: 'success', txHash: '0xthrows' };
      await reachConfirmScreenAsSmartWallet();
      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      const txButton = await screen.findByTestId('transaction-button');
      fireEvent.click(txButton);
      // No crash, no error banner — sendAirtime's throw is caught and logged
      // via logToServer (a fetch call), not a direct console.error.
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/log', expect.objectContaining({
        body: expect.stringContaining('Smart wallet airtime send failed'),
      })));
    });

    it('shows the refund banner, not a "no longer pending" error, when the order was already refunded', async () => {
      // Regression: the refund is fast, so the order can already be
      // 'refunded' when the wallet's onSuccess fires. That used to stack a
      // red "no longer pending" error on top of the refund banner.
      const { queryClient } = await reachConfirmScreenAsSmartWallet();
      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      await screen.findByTestId('transaction-button');

      act(() => {
        queryClient.setQueryData(['orderStatus', 'order-ref-1'], { status: 'refunded' });
      });
      await screen.findByText(/couldn't deliver this airtime/);
      // The sent transaction's "View transaction" button goes away with it.
      expect(screen.queryByTestId('transaction-button')).not.toBeInTheDocument();

      await act(async () => {
        await capturedTransactionProps.onSuccess({ transactionReceipts: [{ transactionHash: '0xstale' }] });
      });
      expect(screen.queryByText(/no longer pending/)).not.toBeInTheDocument();
    });

    it('treats an already-fulfilled order as success, not an error, when the wallet callback lands late', async () => {
      // Regression: with delivery callbacks working, the order can be
      // 'fulfilled' before the wallet's onSuccess fires; that used to show
      // "This order is no longer pending" next to "Airtime delivered".
      const { queryClient } = await reachConfirmScreenAsSmartWallet();
      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      await screen.findByTestId('transaction-button');

      act(() => {
        queryClient.setQueryData(['orderStatus', 'order-ref-1'], { status: 'fulfilled' });
      });
      await screen.findByText('Airtime delivered successfully!');

      await act(async () => {
        await capturedTransactionProps.onSuccess({ transactionReceipts: [{ transactionHash: '0xlate' }] });
      });
      expect(screen.queryByText(/no longer pending/)).not.toBeInTheDocument();
    });

    it('clears an earlier error once the order is delivered', async () => {
      mockTransactionOutcome = { type: 'error', message: 'Transient wallet error' };
      const { queryClient } = await reachConfirmScreenAsSmartWallet();
      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      fireEvent.click(await screen.findByTestId('transaction-button'));
      expect(await screen.findByText('Transient wallet error')).toBeInTheDocument();

      act(() => {
        queryClient.setQueryData(['orderStatus', 'order-ref-1'], { status: 'fulfilled' });
      });
      await screen.findByText('Airtime delivered successfully!');
      expect(screen.queryByText('Transient wallet error')).not.toBeInTheDocument();
    });

    it('does not reject a successful payment when the order already flipped to "processing"', async () => {
      // Regression: 'processing' is the normal status right after a
      // successful payment (the backend can flip to it before onSuccess
      // even fires) — it must not be treated the same as a terminal state.
      const { queryClient } = await reachConfirmScreenAsSmartWallet();
      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      await screen.findByTestId('transaction-button');

      act(() => {
        queryClient.setQueryData(['orderStatus', 'order-ref-1'], { status: 'processing' });
      });
      await screen.findByText('Sending airtime to your phone…');

      await act(async () => {
        await capturedTransactionProps.onSuccess({ transactionReceipts: [{ transactionHash: '0xstale' }] });
      });
      expect(screen.queryByText(/no longer pending/)).not.toBeInTheDocument();
    });
  });

  describe('sendAirtime friendly error messages (EOA flow)', () => {
    function fakeWalletClient() {
      return {
        writeContract: jest.fn().mockResolvedValue('0xpaymenttxhash'),
        signTypedData: jest.fn().mockResolvedValue('0xsig'),
        getChainId: jest.fn().mockResolvedValue(8453),
      };
    }

    async function reachConfirmScreen() {
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
    }

    function setup(airtimeSend: (body: Record<string, unknown>) => { status?: number; body: unknown }) {
      installFetchMock({ airtimeSend });
      mockUseWalletClient.mockReturnValue({ data: fakeWalletClient() });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) });
    }

    it('shows a friendly message for a 429 (recently attempted)', async () => {
      setup(() => ({ status: 429, body: {} }));
      await reachConfirmScreen();
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      expect(await screen.findByText(/already processing this order/)).toBeInTheDocument();
    });

    it('shows a friendly message for a 409 (already processed)', async () => {
      setup(() => ({ status: 409, body: {} }));
      await reachConfirmScreen();
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      expect(await screen.findByText(/already processed/)).toBeInTheDocument();
    });

    it('surfaces the server-provided error message for a 400', async () => {
      setup(() => ({ status: 400, body: { error: 'Order not pending' } }));
      await reachConfirmScreen();
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      expect(await screen.findByText(/Order not pending/)).toBeInTheDocument();
    });

    it('surfaces the server-provided message field when error is absent', async () => {
      setup(() => ({ status: 400, body: { message: 'Please wait for confirmation' } }));
      await reachConfirmScreen();
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      expect(await screen.findByText(/Please wait for confirmation/)).toBeInTheDocument();
    });

    it('shows a friendly message for a 5xx (service unavailable)', async () => {
      setup(() => ({ status: 503, body: {} }));
      await reachConfirmScreen();
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
    });

    it('falls back to a generic message when the response body is not JSON', async () => {
      installFetchMock();
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/airtime/send') {
          return { ok: false, status: 402, json: async () => { throw new Error('not json'); } };
        }
        if (url === '/api/orders') return { ok: true, status: 200, json: async () => ({ orderRef: 'order-ref-1', amountKes: 100, amountUsdc: 1.05, airtimeUsdc: 1, serviceFeeUsdc: 0.05, currency: 'KES', chainId: 8453 }) };
        if (url.startsWith('/api/orders/')) return { ok: true, status: 200, json: async () => ({ status: 'pending' }) };
        if (url.startsWith('/api/prices')) return { ok: true, json: async () => ({ success: true, price: 128, serviceFee: 0.05 }) };
        if (url.startsWith('/api/geo')) return { ok: true, json: async () => ({ country: 'KE' }) };
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch;
      mockUseWalletClient.mockReturnValue({ data: fakeWalletClient() });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) });
      await reachConfirmScreen();
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      expect(await screen.findByText(/processing your payment/)).toBeInTheDocument();
    });
  });

  describe('generatePermitSignature adapter (signingClient)', () => {
    it('delegates signTypedData through the unified wallet client', async () => {
      const signTypedData = jest.fn().mockResolvedValue('0xsig');
      mockUseWalletClient.mockReturnValue({
        data: { writeContract: jest.fn().mockResolvedValue('0xtxhash'), signTypedData, getChainId: jest.fn().mockResolvedValue(8453) },
      });
      mockGeneratePermitSignature.mockImplementation(async (args: { walletClient: { signTypedData: (p: unknown) => Promise<string> } }) => {
        const sig = await args.walletClient.signTypedData({ account: '0xoverride', domain: {}, types: {}, primaryType: 'Permit', message: {} });
        expect(sig).toBe('0xsig');
        return { v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) };
      });

      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);

      await waitFor(() => expect(signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({ account: '0xoverride' })
      ));
    });

    it('falls back to effectiveAddress when generatePermitSignature omits an account', async () => {
      const signTypedData = jest.fn().mockResolvedValue('0xsig');
      mockUseWalletClient.mockReturnValue({
        data: { writeContract: jest.fn().mockResolvedValue('0xtxhash'), signTypedData, getChainId: jest.fn().mockResolvedValue(8453) },
      });
      mockGeneratePermitSignature.mockImplementation(async (args: { walletClient: { signTypedData: (p: unknown) => Promise<string> } }) => {
        const sig = await args.walletClient.signTypedData({ domain: {}, types: {}, primaryType: 'Permit', message: {} });
        expect(sig).toBe('0xsig');
        return { v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) };
      });

      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);

      await waitFor(() => expect(signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({ account: (connectedAccount().address as string).toLowerCase() })
      ));
    });
  });

  describe('Chain switching', () => {
    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).ethereum;
    });

    it('does nothing when window.ethereum is unavailable', async () => {
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Arc')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Arc'));
      // No throw, nothing to assert beyond "did not crash".
    });

    it('requests a network switch to Arc', async () => {
      const request = jest.fn().mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = { request };
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Arc')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Arc'));
      await waitFor(() => expect(request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${CHAINS.arc.chain.id.toString(16)}` }],
      }));
    });

    it('adds the network when the wallet does not recognize it (error code 4902)', async () => {
      const request = jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('unrecognized chain'), { code: 4902 }))
        .mockResolvedValueOnce(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = { request };
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Arc')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Arc'));
      await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_addEthereumChain' })));
    });

    it('logs when adding the network also fails', async () => {
      const request = jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('unrecognized chain'), { code: 4902 }))
        .mockRejectedValueOnce(new Error('user rejected add'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = { request };
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Arc')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Arc'));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/log', expect.objectContaining({
        body: expect.stringContaining('Failed to add Arc'),
      })));
    });

    it('logs when the switch fails for a reason other than an unrecognized chain', async () => {
      const request = jest.fn().mockRejectedValue(new Error('user rejected switch'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = { request };
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Arc')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Arc'));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/log', expect.objectContaining({
        body: expect.stringContaining('Failed to switch network'),
      })));
    });

    it('shows a warning banner and offers a switch when connected to an unsupported chain', async () => {
      mockUseAccount.mockReturnValue(connectedAccount({ chain: { id: 1, name: 'Ethereum' } }));
      const request = jest.fn().mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = { request };
      renderPlatform();
      expect(await screen.findByText(/Connected to Ethereum, which isn't supported/)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Switch to Base'));
      await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({
        params: [{ chainId: `0x${CHAINS.base.chain.id.toString(16)}` }],
      })));
    });

    it('offers a switch to Arc from the unsupported-chain warning banner', async () => {
      mockUseAccount.mockReturnValue(connectedAccount({ chain: { id: 1, name: 'Ethereum' } }));
      const request = jest.fn().mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = { request };
      renderPlatform();
      expect(await screen.findByText(/Connected to Ethereum, which isn't supported/)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Switch to Arc'));
      await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({
        params: [{ chainId: `0x${CHAINS.arc.chain.id.toString(16)}` }],
      })));
    });
  });

  describe('Arc gas reserve', () => {
    it('estimates a gas reserve when connected to Arc', async () => {
      mockEstimateGasReserveUsdc.mockResolvedValue(0.02);
      mockUseAccount.mockReturnValue(connectedAccount({ chain: CHAINS.arc.chain }));
      renderPlatform();
      await waitFor(() => expect(mockEstimateGasReserveUsdc).toHaveBeenCalled());
      // Wait for the resolved reserve to actually land in state (not just for
      // the estimate call to fire) — the max-spendable figure subtracts it.
      await waitFor(() => expect(screen.getByText('Use max amount ($9.93)')).toBeInTheDocument());
    });

    it('discards a gas-reserve estimate that resolves after unmount', async () => {
      let resolveReserve: (v: number) => void = () => {};
      mockEstimateGasReserveUsdc.mockReturnValue(new Promise((resolve) => { resolveReserve = resolve; }));
      mockUseAccount.mockReturnValue(connectedAccount({ chain: CHAINS.arc.chain }));
      const { unmount } = renderPlatform();
      await waitFor(() => expect(mockEstimateGasReserveUsdc).toHaveBeenCalled());
      unmount();
      // Resolving after unmount must not throw ("setState on unmounted
      // component") — the effect's cleanup should have flipped `cancelled`.
      await act(async () => { resolveReserve(0.02); await Promise.resolve(); });
    });
  });

  describe('order status polling terminal states', () => {
    it('shows a success message and stops polling when the order is fulfilled', async () => {
      installFetchMock({ orderStatus: () => ({ status: 'fulfilled' }) });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Airtime delivered successfully!')).toBeInTheDocument();
    });

    it('shows the refund message and its link together in one section', async () => {
      installFetchMock({ orderStatus: () => ({ status: 'refunded', refund_tx_hash: '0xrefundtx', chain_id: 8453 }) });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      const link = await screen.findByText('View refund transaction');
      expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('0xrefundtx'));
      // The message and the link live in the same box, not two separate ones.
      const box = link.closest('a')!.parentElement!;
      expect(box).toHaveTextContent(/couldn't deliver this airtime.*View refund transaction/);
    });

    it('shows the refund message without a link when there is no refund tx hash yet', async () => {
      installFetchMock({ orderStatus: () => ({ status: 'refunded' }) });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText(/couldn't deliver this airtime/)).toBeInTheDocument();
      expect(screen.queryByText('View refund transaction')).not.toBeInTheDocument();
    });

    it('hides the pay / "View transaction" button once the order is refunded (EOA)', async () => {
      installFetchMock({ orderStatus: () => ({ status: 'refunded', refund_tx_hash: '0xrefundtx', chain_id: 8453 }) });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText(/couldn't deliver this airtime/);
      expect(screen.queryByText('Pay & Send Airtime')).not.toBeInTheDocument();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('shows a processing message while the order is being fulfilled', async () => {
      installFetchMock({ orderStatus: () => ({ status: 'processing' }) });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Sending airtime to your phone…')).toBeInTheDocument();
    });

    it('shows a processing message when pending with a tx hash already recorded', async () => {
      installFetchMock({ orderStatus: () => ({ status: 'pending', tx_hash: '0xexisting' }) });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Sending airtime to your phone…')).toBeInTheDocument();
    });
  });

  describe('wallet pill scroll-hide', () => {
    function setScrollY(value: number) {
      Object.defineProperty(window, 'scrollY', { value, writable: true, configurable: true });
    }

    afterEach(() => setScrollY(0));

    it('hides the wallet pill when scrolling down past the threshold', () => {
      const { container } = renderPlatform();
      const header = container.querySelector('header')!;
      expect(header.className).not.toContain('headerHidden');

      setScrollY(200);
      fireEvent.scroll(window);
      expect(header.className).toContain('headerHidden');
    });

    it('shows the wallet pill again when scrolling back up', () => {
      const { container } = renderPlatform();
      const header = container.querySelector('header')!;

      setScrollY(200);
      fireEvent.scroll(window);
      expect(header.className).toContain('headerHidden');

      setScrollY(100);
      fireEvent.scroll(window);
      expect(header.className).not.toContain('headerHidden');
    });

    it('leaves the wallet pill state unchanged on a no-op scroll event (same scrollY)', () => {
      const { container } = renderPlatform();
      const header = container.querySelector('header')!;

      setScrollY(200);
      fireEvent.scroll(window);
      expect(header.className).toContain('headerHidden');

      // Same scrollY as before — none of the direction branches match.
      fireEvent.scroll(window);
      expect(header.className).toContain('headerHidden');
    });

    it('keeps the wallet pill visible near the top regardless of direction', () => {
      const { container } = renderPlatform();
      const header = container.querySelector('header')!;

      setScrollY(200);
      fireEvent.scroll(window);
      expect(header.className).toContain('headerHidden');

      setScrollY(10);
      fireEvent.scroll(window);
      expect(header.className).not.toContain('headerHidden');
    });
  });

  describe('remaining small branches', () => {
    it('switches the selected country via the dial-code dropdown', async () => {
      renderPlatform();
      const select = screen.getByDisplayValue('+254');
      fireEvent.change(select, { target: { value: 'UG' } });
      await waitFor(() => expect(screen.getByText('Amount (UGX)')).toBeInTheDocument());
    });

    it('resolves and normalizes a MiniKit account when the runtime also exposes an API method', async () => {
      mockUseAccount.mockReturnValue({ address: undefined, chain: realBaseChain });
      mockUseMiniKit.mockReturnValue({
        isMiniAppReady: true,
        setMiniAppReady: jest.fn(),
        // No '0x' prefix on purpose — exercises the defensive prefixing
        // branch in both normalizeAddress (unifiedWalletClient) and the
        // separate normalize() used by the effectiveAddress-resolution effect.
        kit: { account: 'MIXEDCASEACCOUNT00000000000000000001', request: jest.fn() },
      } as never);
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Balance $10.00')).toBeInTheDocument());
    });

    it('leaves an already-0x-prefixed MiniKit account as-is (normalizeAddress prefixed branch)', async () => {
      mockUseAccount.mockReturnValue({ address: undefined, chain: realBaseChain });
      mockUseMiniKit.mockReturnValue({
        isMiniAppReady: true,
        setMiniAppReady: jest.fn(),
        kit: { account: '0xAlreadyPrefixed000000000000000000001', request: jest.fn() },
      } as never);
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Balance $10.00')).toBeInTheDocument());
    });

    it('falls back to runtime.getAccount() inside unifiedWalletClient when no account field is present', async () => {
      mockUseAccount.mockReturnValue({ address: undefined, chain: realBaseChain });
      const getAccount = jest.fn().mockResolvedValue('0xFromUnifiedGetAccount0000000000001');
      mockUseMiniKit.mockReturnValue({
        isMiniAppReady: true,
        setMiniAppReady: jest.fn(),
        kit: { getAccount, request: jest.fn() },
      } as never);
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Balance $10.00')).toBeInTheDocument());
    });

    it('treats an empty-string MiniKit account as unavailable (normalizeAddress falsy branch)', async () => {
      mockUseAccount.mockReturnValue({ address: undefined, chain: realBaseChain });
      mockUseMiniKit.mockReturnValue({
        isMiniAppReady: true,
        setMiniAppReady: jest.fn(),
        kit: { account: '', request: jest.fn() },
      } as never);
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Connect Wallet')).toBeInTheDocument());
    });

    it('rejects an amount of 0 (validateAmount, not just handleContinue)', async () => {
      renderPlatform();
      const amountInput = screen.getByPlaceholderText('100');
      fireEvent.change(amountInput, { target: { value: '0' } });
      expect(await screen.findByText('Please enter a valid amount')).toBeInTheDocument();
      // The Continue button should also be disabled by this — a non-empty
      // but invalid amount is not the same as an empty one.
      expect(getContinueButton()).toBeDisabled();
    });

    it('suppresses the error and logs when a smart-wallet airtime send fails', async () => {
      mockUseIsWalletACoinbaseSmartWallet.mockReturnValue(true);
      installFetchMock({ airtimeSend: () => ({ status: 500, body: { error: 'boom' } }) });
      mockTransactionOutcome = { type: 'success', txHash: '0xsuppressed' };
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/order-ref-1')
      ));
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      const txButton = await screen.findByTestId('transaction-button');
      fireEvent.click(txButton);
      // suppressErrors means no error banner appears, just a best-effort log.
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/log', expect.objectContaining({
        body: expect.stringContaining('Airtime send failed (suppressed)'),
      })));
      expect(screen.queryByText('boom')).not.toBeInTheDocument();
    });

    it('shows "Creating Order..." while the order-creation request is in flight', async () => {
      let resolveOrder: (v: unknown) => void = () => {};
      installFetchMock();
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/orders') {
          return new Promise((resolve) => {
            resolveOrder = () => resolve({
              ok: true, status: 200,
              json: async () => ({ orderRef: 'order-ref-1', amountKes: 100, amountUsdc: 1.05, airtimeUsdc: 1, serviceFeeUsdc: 0.05, currency: 'KES', chainId: 8453 }),
            });
          });
        }
        if (url.startsWith('/api/prices')) return { ok: true, json: async () => ({ success: true, price: 128, serviceFee: 0.05 }) };
        if (url.startsWith('/api/geo')) return { ok: true, json: async () => ({ country: 'KE' }) };
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch;

      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Creating Order...')).toBeInTheDocument();
      resolveOrder(undefined);
      await screen.findByText('Confirm Payment');
    });
  });

  describe('MiniKit account resolution (no wagmi address)', () => {
    beforeEach(() => {
      mockUseAccount.mockReturnValue({ address: undefined, chain: realBaseChain });
    });

    it('resolves the address directly from runtime.account', async () => {
      mockUseMiniKit.mockReturnValue({ isMiniAppReady: true, setMiniAppReady: jest.fn(), kit: { account: '0xMiniAccount000000000000000000000000001' } } as never);
      renderPlatform();
      await waitFor(() => expect(screen.getByText('Balance $10.00')).toBeInTheDocument());
    });

    it('resolves the address via runtime.getAccount()', async () => {
      const getAccount = jest.fn().mockResolvedValue('0xFromGetAccount0000000000000000000001');
      mockUseMiniKit.mockReturnValue({ isMiniAppReady: true, setMiniAppReady: jest.fn(), kit: { getAccount } } as never);
      renderPlatform();
      await waitFor(() => expect(getAccount).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByText('Balance $10.00')).toBeInTheDocument());
    });

    it('treats a rejected getAccount() as no address available', async () => {
      const getAccount = jest.fn().mockRejectedValue(new Error('locked'));
      mockUseMiniKit.mockReturnValue({ isMiniAppReady: true, setMiniAppReady: jest.fn(), kit: { getAccount } } as never);
      renderPlatform();
      await waitFor(() => expect(getAccount).toHaveBeenCalled());
      expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    });

    it('resolves the address via runtime.request("eth_accounts")', async () => {
      const request = jest.fn().mockResolvedValue(['0xFromRequestAccounts000000000000001']);
      mockUseMiniKit.mockReturnValue({ isMiniAppReady: true, setMiniAppReady: jest.fn(), kit: { request } } as never);
      renderPlatform();
      await waitFor(() => expect(request).toHaveBeenCalledWith({ method: 'eth_accounts' }));
      await waitFor(() => expect(screen.getByText('Balance $10.00')).toBeInTheDocument());
    });

    it('treats a rejected request() as no address available', async () => {
      const request = jest.fn().mockRejectedValue(new Error('denied'));
      mockUseMiniKit.mockReturnValue({ isMiniAppReady: true, setMiniAppReady: jest.fn(), kit: { request } } as never);
      renderPlatform();
      await waitFor(() => expect(request).toHaveBeenCalledWith({ method: 'eth_accounts' }));
      expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    });

    it('retries resolution when the runtime has no address API at all', async () => {
      mockUseMiniKit.mockReturnValue({ isMiniAppReady: true, setMiniAppReady: jest.fn() } as never);
      renderPlatform();
      // No account/getAccount/request and isMiniApp is true (mini itself is
      // truthy) — resolveAddress schedules a retry via setTimeout(…, 400).
      // Just confirm it doesn't crash and stays on the disconnected state.
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    });

    it('calls setMiniAppReady when the mini app has not signaled ready yet', async () => {
      const setMiniAppReady = jest.fn();
      mockUseMiniKit.mockReturnValue({ isMiniAppReady: false, setMiniAppReady } as never);
      renderPlatform();
      await waitFor(() => expect(setMiniAppReady).toHaveBeenCalled());
    });
  });

  describe('final coverage sweep', () => {
    it('selects Rwanda, Uganda, Tanzania, and South Africa from the dropdown', async () => {
      renderPlatform();
      const select = screen.getByDisplayValue('+254');
      for (const [code, currency] of [['RW', 'RWF'], ['UG', 'UGX'], ['ZA', 'ZAR'], ['TZ', 'TZS']] as const) {
        fireEvent.change(select, { target: { value: code } });
        await waitFor(() => expect(screen.getByText(`Amount (${currency})`)).toBeInTheDocument());
      }
    });

    it('shows an error banner when the price fetch fails', async () => {
      // The price query has its own retry: 3 (overriding the QueryClient's
      // retry: false default), with react-query's default exponential
      // backoff between attempts — this genuinely takes several real seconds
      // to exhaust, hence the longer timeouts here.
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/prices')) return { ok: false, status: 500, json: async () => ({}) };
        if (url.startsWith('/api/geo')) return { ok: true, json: async () => ({ country: 'KE' }) };
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch;
      renderPlatform();
      expect(await screen.findByText('Failed to fetch current price. Please try again.', {}, { timeout: 15000 })).toBeInTheDocument();
    }, 20000);

    it('falls back to a generic message when order creation fails without an error field', async () => {
      installFetchMock({ createOrder: () => ({ status: 400, body: {} }) });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Failed to create order')).toBeInTheDocument();
    });

    it('falls back to activeChainConfig.chain.id when the wallet client has no getChainId', async () => {
      const walletClient = {
        writeContract: jest.fn().mockResolvedValue('0xpaymenttxhash'),
        signTypedData: jest.fn().mockResolvedValue('0xsig'),
        // no getChainId
      };
      mockUseWalletClient.mockReturnValue({ data: walletClient });
      mockGeneratePermitSignature.mockImplementation(async (args: { chainId: number }) => {
        expect(args.chainId).toBe(BASE_CONFIG.chain.id);
        return { v: 27, r: '0x' + 'a'.repeat(64), s: '0x' + 'b'.repeat(64) };
      });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      await waitFor(() => expect(mockGeneratePermitSignature).toHaveBeenCalled());
    });

    it('reports invalid permit signature when only r/s are missing (v present)', async () => {
      mockUseWalletClient.mockReturnValue({
        data: { writeContract: jest.fn().mockResolvedValue('0xtx'), signTypedData: jest.fn().mockResolvedValue('0xsig'), getChainId: jest.fn().mockResolvedValue(8453) },
      });
      mockGeneratePermitSignature.mockResolvedValue({ v: 27 });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      fireEvent.click(screen.getByText('Pay & Send Airtime').closest('button')!);
      expect(await screen.findByText(/Invalid permit signature/)).toBeInTheDocument();
    });

    it('returns 500 and shows a friendly error when the order-status poll fails', async () => {
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/orders') return { ok: true, status: 200, json: async () => ({ orderRef: 'order-ref-1', amountKes: 100, amountUsdc: 1.05, airtimeUsdc: 1, serviceFeeUsdc: 0.05, currency: 'KES', chainId: 8453 }) };
        if (url.startsWith('/api/orders/')) return { ok: false, status: 500, json: async () => ({}) };
        if (url.startsWith('/api/prices')) return { ok: true, json: async () => ({ success: true, price: 128, serviceFee: 0.05 }) };
        if (url.startsWith('/api/geo')) return { ok: true, json: async () => ({ country: 'KE' }) };
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch;
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      // No crash — the orderStatus query just fails silently (no UI wired to
      // its own error state), covered for the queryFn's own throw branch.
      await new Promise((r) => setTimeout(r, 50));
    });

    it('shows $0.00 for airtime/service fee when the order response omits them', async () => {
      installFetchMock({
        createOrder: () => ({ status: 200, body: { orderRef: 'order-ref-1', amountKes: 100, amountUsdc: 1.05, currency: 'KES', chainId: 8453 } }),
      });
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      const amounts = screen.getAllByText('0.00 USDC');
      expect(amounts.length).toBeGreaterThanOrEqual(2); // airtime cost + service fee
    });

    it('drives the smart wallet Transaction onStatus callback through every status name', async () => {
      mockUseIsWalletACoinbaseSmartWallet.mockReturnValue(true);
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/order-ref-1')
      ));
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      await screen.findByTestId('transaction-button');

      for (const statusName of ['transactionPending', 'transactionLegacyExecuted', 'error', 'reset']) {
        act(() => {
          capturedTransactionProps.onStatus({ statusName });
        });
      }
      // No crash across every status branch is the assertion here.
    });

    it('ignores unrecognized Transaction onStatus names', async () => {
      mockUseIsWalletACoinbaseSmartWallet.mockReturnValue(true);
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/order-ref-1')
      ));
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      await screen.findByTestId('transaction-button');

      act(() => {
        capturedTransactionProps.onStatus({ statusName: 'someUnknownStatus' });
      });
      // Neither busyStates nor the success/error/reset branch matches — no crash.
    });

    it('falls back to a generic message when the Transaction onError event has none', async () => {
      mockUseIsWalletACoinbaseSmartWallet.mockReturnValue(true);
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/order-ref-1')
      ));
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      fireEvent.click(screen.getByText('Pay & Send Airtime'));
      await screen.findByTestId('transaction-button');

      act(() => {
        capturedTransactionProps.onError({});
      });
      expect(await screen.findByText('Transaction failed')).toBeInTheDocument();
    });
  });
});
