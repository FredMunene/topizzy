/** @jest-environment jsdom */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
jest.mock('@coinbase/onchainkit/transaction', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Transaction: (props: any) => {
    capturedTransactionProps = props;
    return <div data-testid="transaction">{props.children}</div>;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TransactionButton: (props: any) => (
    <button
      type="button"
      data-testid="transaction-button"
      disabled={props.disabled}
      onClick={async () => {
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
      }}
    >
      {props.text}
    </button>
  ),
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
  return render(
    <QueryClientProvider client={client}>
      <Platform />
    </QueryClientProvider>
  );
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

  it('shows Connect Wallet when no wallet is connected', () => {
    mockUseAccount.mockReturnValue({ address: undefined, chain: undefined });
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

    it('shows an error for a phone number that is not 9 digits', async () => {
      renderPlatform();
      const phoneInput = screen.getByPlaceholderText('743913802');
      fireEvent.change(phoneInput, { target: { value: '12345' } });
      const amountInput = screen.getByPlaceholderText('100');
      fireEvent.change(amountInput, { target: { value: '100' } });
      await clickContinueWhenEnabled();
      expect(await screen.findByText('Phone number must be exactly 9 digits')).toBeInTheDocument();
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
      renderPlatform();
      fireEvent.change(screen.getByPlaceholderText('743913802'), { target: { value: '743913802' } });
      fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
      await clickContinueWhenEnabled();
      await screen.findByText('Confirm Payment');
      // The order-status query's first resolution (undefined -> 'pending')
      // fires an effect that resets smartFlowStarted to false. Let it settle
      // before clicking, or a click that lands just before it resolves gets
      // silently undone.
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/order-ref-1')
      ));
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
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
  });
});
