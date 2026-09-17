import { NextRequest } from 'next/server';

// --- Supabase mock: dispatch by table + query shape ---
const mockTxSelect = jest.fn(); // airtime_transactions .select().eq().single() — transaction lookup
const mockTxUpdate = jest.fn().mockResolvedValue({ error: null }); // airtime_transactions .update().eq()
const mockOrderUpdate = jest.fn().mockResolvedValue({ error: null }); // orders .update().eq() — resolved value
const mockOrderUpdatePayload = jest.fn(); // spy on the object passed to orders .update(...)

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'orders') {
        return {
          update: jest.fn((payload: unknown) => {
            mockOrderUpdatePayload(payload);
            return { eq: (...args: unknown[]) => mockOrderUpdate(...args) };
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: (...args: unknown[]) => mockTxSelect(...args),
        update: jest.fn(() => ({ eq: (...args: unknown[]) => mockTxUpdate(...args) })),
      };
    }),
  })),
}));

// --- viem mock ---
const mockWaitForTransactionReceipt = jest.fn().mockResolvedValue({ status: 'success' });
const mockWriteContract = jest.fn().mockResolvedValue('0xrefundtx');

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      waitForTransactionReceipt: (...args: unknown[]) => mockWaitForTransactionReceipt(...args),
    })),
    createWalletClient: jest.fn(() => ({
      writeContract: (...args: unknown[]) => mockWriteContract(...args),
    })),
  };
});

jest.mock('viem/accounts', () => ({
  privateKeyToAccount: jest.fn((pk: string) => ({ address: '0xOperator', privateKey: pk })),
}));

// --- lib/chains mock ---
const FAKE_CHAIN = { id: 8453 };
const CONTRACT_ADDRESS = '0xAirtimeContract000000000000000000000001';
const mockGetChainConfigById = jest.fn();
jest.mock('@/lib/chains', () => ({
  getChainConfigById: (...args: unknown[]) => mockGetChainConfigById(...args),
}));

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-db-id-1',
    order_ref: 'abc12345',
    amount_usdc: 0.83,
    service_fee_usdc: 0.05,
    wallet_address: '0xUserWallet00000000000000000000000000001',
    chain_id: 8453,
    ...overrides,
  };
}

function baseTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-db-id-1',
    order_id: 'order-db-id-1',
    orders: baseOrder(),
    ...overrides,
  };
}

function makeRequest(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest('http://localhost/api/airtime/status', { method: 'POST', body: fd });
}

describe('POST /api/airtime/status', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      TREASURY_PRIVATE_KEY: '0x' + '1'.repeat(64),
    };
    mockTxSelect.mockReset();
    mockTxUpdate.mockReset().mockResolvedValue({ error: null });
    mockOrderUpdate.mockReset().mockResolvedValue({ error: null });
    mockOrderUpdatePayload.mockReset();
    mockWaitForTransactionReceipt.mockReset().mockResolvedValue({ status: 'success' });
    mockWriteContract.mockReset().mockResolvedValue('0xrefundtx');
    mockGetChainConfigById.mockReset().mockReturnValue({
      chain: FAKE_CHAIN,
      airtimeContractAddress: CONTRACT_ADDRESS,
      displayName: 'Base',
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { process.env = ORIGINAL_ENV; });

  async function loadPOST() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('@/app/api/airtime/status/route');
    return POST as (req: NextRequest) => Promise<Response>;
  }

  it('returns 404 when no transaction matches the requestId', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Success' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the query succeeds but no transaction is returned', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Success' }));
    expect(res.status).toBe(404);
  });

  it('marks the order fulfilled on a Success callback', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Success' }));
    expect(res.status).toBe(200);
    expect(mockOrderUpdatePayload).toHaveBeenCalledWith(expect.objectContaining({ status: 'fulfilled' }));
  });

  it('logs (but does not fail the request) when marking the order fulfilled errors', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
    mockOrderUpdate.mockResolvedValueOnce({ error: { message: 'update failed' } });
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Success' }));
    expect(res.status).toBe(200);
  });

  it('logs (but does not fail the request) when updating the transaction status errors', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
    mockTxUpdate.mockResolvedValueOnce({ error: { message: 'update failed' } });
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Success' }));
    expect(res.status).toBe(200);
  });

  it('does nothing extra for a status that is neither Success nor Failed', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Pending' }));
    expect(res.status).toBe(200);
    expect(mockOrderUpdatePayload).not.toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  describe('Failed callback → refund flow', () => {
    it('refunds successfully and marks the order refunded with the tx hash', async () => {
      const POST = await loadPOST();
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      mockWriteContract.mockResolvedValueOnce('0xrefundtx123');
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(200);
      expect(mockOrderUpdatePayload).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'refunded', refund_tx_hash: '0xrefundtx123' })
      );
    });

    it('treats an empty refund tx hash as undefined (no refund_tx_hash field written)', async () => {
      const POST = await loadPOST();
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      mockWriteContract.mockResolvedValueOnce('');
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(200);
      const [updateArg] = mockOrderUpdatePayload.mock.calls[mockOrderUpdatePayload.mock.calls.length - 1];
      expect(updateArg).not.toHaveProperty('refund_tx_hash');
    });

    it('treats a missing service_fee_usdc as 0 in the refund amount', async () => {
      const POST = await loadPOST();
      mockTxSelect.mockResolvedValueOnce({
        data: baseTransaction({ orders: baseOrder({ service_fee_usdc: undefined }) }),
        error: null,
      });
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(200);
      expect(mockWriteContract).toHaveBeenCalled();
    });

    it('normalizes a treasury key without a 0x prefix', async () => {
      jest.resetModules();
      process.env.TREASURY_PRIVATE_KEY = '2'.repeat(64); // no 0x prefix
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { POST } = require('@/app/api/airtime/status/route');
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(200);
      expect(mockWriteContract).toHaveBeenCalled();
    });

    it('returns 500 "Manual refund required" when the treasury private key is unset', async () => {
      jest.resetModules();
      delete process.env.TREASURY_PRIVATE_KEY;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { POST } = require('@/app/api/airtime/status/route');
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Manual refund required');
      // Falls back to a status-only update since executeRefund never produced a tx hash.
      expect(mockOrderUpdatePayload).toHaveBeenCalledWith(
        expect.not.objectContaining({ refund_tx_hash: expect.anything() })
      );
    });

    it('returns 500 "Manual refund required" when the chain has no configured contract address', async () => {
      const POST = await loadPOST();
      mockGetChainConfigById.mockReturnValueOnce({ chain: FAKE_CHAIN, airtimeContractAddress: undefined, displayName: 'Arc' });
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(500);
    });

    it('marks refunded (without failing the request) when the on-chain refund call throws a regular Error', async () => {
      const POST = await loadPOST();
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      mockWriteContract.mockRejectedValueOnce(new Error('contract reverted'));
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(200);
      expect(mockOrderUpdatePayload).toHaveBeenCalledWith(
        expect.not.objectContaining({ refund_tx_hash: expect.anything() })
      );
    });

    it('marks refunded (without failing the request) when the on-chain refund call throws a non-Error value', async () => {
      const POST = await loadPOST();
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      mockWriteContract.mockRejectedValueOnce('a raw string failure');
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(200);
    });

    it('logs (but does not fail the request) when marking the order refunded errors', async () => {
      const POST = await loadPOST();
      mockTxSelect.mockResolvedValueOnce({ data: baseTransaction(), error: null });
      mockOrderUpdate.mockResolvedValueOnce({ error: { message: 'update failed' } });
      const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Failed' }));
      expect(res.status).toBe(200);
    });
  });

  // --- Outer catch ---

  it('returns 500 with the message for a genuine Error thrown outside the refund flow', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockRejectedValueOnce(new Error('db unreachable'));
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Success' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.details).toBe('db unreachable');
  });

  it('returns 500 with "Unknown error" for a non-Error thrown outside the refund flow', async () => {
    const POST = await loadPOST();
    mockTxSelect.mockRejectedValueOnce('raw string failure');
    const res = await POST(makeRequest({ requestId: 'ATQid_1', status: 'Success' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.details).toBe('Unknown error');
  });
});
