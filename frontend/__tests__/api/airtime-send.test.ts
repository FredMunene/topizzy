import { NextRequest } from 'next/server';

// --- Supabase mock: dispatch by table + query shape, not call position ---
const mockOrderSelect = jest.fn(); // orders .select().eq().single()
const mockOrderUpdate = jest.fn().mockResolvedValue({ error: null }); // orders .update().eq()
const mockRecentTxSelect = jest.fn().mockResolvedValue({ data: [], error: null }); // airtime_transactions recent-attempt check
const mockPriorTxsSelect = jest.fn().mockResolvedValue({ data: [], error: null }); // airtime_transactions prior-success check
const mockTxInsert = jest.fn().mockResolvedValue({ error: null }); // airtime_transactions .insert()

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'orders') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: (...args: unknown[]) => mockOrderSelect(...args),
          update: jest.fn(() => ({
            eq: (...args: unknown[]) => mockOrderUpdate(...args),
          })),
        };
      }
      // airtime_transactions
      return {
        select: jest.fn((cols: string) => {
          if (typeof cols === 'string' && cols.includes('created_at')) {
            return {
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: (...args: unknown[]) => mockRecentTxSelect(...args),
            };
          }
          return {
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            limit: (...args: unknown[]) => mockPriorTxsSelect(...args),
          };
        }),
        insert: (...args: unknown[]) => mockTxInsert(...args),
      };
    }),
  })),
}));

// --- viem mock: control the on-chain verification/refund path ---
const mockWaitForTransactionReceipt = jest.fn();
const mockWriteContract = jest.fn();

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

// --- lib/chains mock: decouple from real env-driven chain config ---
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
    phone_number: '+254712345678',
    amount: 100,
    amount_usdc: 0.83,
    service_fee_usdc: 0.05,
    status: 'pending',
    currency: 'KES',
    wallet_address: '0xUserWallet00000000000000000000000000001',
    tx_hash: null,
    refund_tx_hash: null,
    chain_id: 8453,
    ...overrides,
  };
}

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/airtime/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makeReceipt(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    logs: [{ address: CONTRACT_ADDRESS }],
    ...overrides,
  };
}

describe('POST /api/airtime/send', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_SUPABASE_ANON_KEY: 'anon-key',
      NEXT_AFRICASTALKING_USERNAME: 'topizzy',
      NEXT_AFRICASTALKING_API_KEY: 'at-key',
      NEXT_AFRICASTALKING_URL: 'https://api.africastalking.com/version1/airtime/send',
      OPERATOR_PRIVATE_KEY: '0x' + '1'.repeat(64),
    };
    mockOrderSelect.mockReset();
    mockOrderUpdate.mockReset().mockResolvedValue({ error: null });
    mockRecentTxSelect.mockReset().mockResolvedValue({ data: [], error: null });
    mockPriorTxsSelect.mockReset().mockResolvedValue({ data: [], error: null });
    mockTxInsert.mockReset().mockResolvedValue({ error: null });
    mockWaitForTransactionReceipt.mockReset().mockResolvedValue(makeReceipt());
    mockWriteContract.mockReset();
    mockGetChainConfigById.mockReset().mockReturnValue({
      chain: FAKE_CHAIN,
      airtimeContractAddress: CONTRACT_ADDRESS,
      displayName: 'Base',
    });
    global.fetch = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function loadPOST() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('@/app/api/airtime/send/route');
    return POST as (req: NextRequest) => Promise<Response>;
  }

  function mockAtSuccess(requestId = 'ATQid_1') {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        responses: [{ status: 'Sent', requestId }],
      }),
    });
  }

  function mockAtFailure(errorMessage = 'Insufficient balance', requestId?: string) {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        responses: [{ status: 'Failed', errorMessage, requestId }],
      }),
    });
  }

  // --- Input validation ---

  it('returns 400 when orderRef is missing', async () => {
    const POST = await loadPOST();
    const res = await POST(makeRequest({ txHash: '0xabc' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when txHash is missing', async () => {
    const POST = await loadPOST();
    const res = await POST(makeRequest({ orderRef: 'abc12345' }));
    expect(res.status).toBe(400);
  });

  // --- Order lookup ---

  it('returns 404 with details when the order lookup errors', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.details).toBe('db error');
  });

  it('returns 404 without details when no order is found and there is no error', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Order not found');
    expect(json.details).toBeUndefined();
  });

  it('returns 500 when the order chain has no configured contract address', async () => {
    const POST = await loadPOST();
    mockGetChainConfigById.mockReturnValueOnce({ chain: FAKE_CHAIN, airtimeContractAddress: undefined, displayName: 'Arc' });
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
  });

  // --- Order status gating ---

  it('returns 409 when the order is already processing', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder({ status: 'processing' }), error: null });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(409);
  });

  it('returns 400 with refundTxHash when the order was already refunded', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({
      data: baseOrder({ status: 'refunded', refund_tx_hash: '0xrefund' }),
      error: null,
    });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.refundTxHash).toBe('0xrefund');
  });

  it('returns 400 with txHash when the order was already fulfilled', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({
      data: baseOrder({ status: 'fulfilled', tx_hash: '0xfulfilled' }),
      error: null,
    });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.txHash).toBe('0xfulfilled');
  });

  it('returns a generic 400 for any other non-pending status', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder({ status: 'duplicate' }), error: null });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.status).toBe('duplicate');
  });

  // --- Recent-attempt throttle ---

  it('returns 429 when airtime was attempted for this order in the last 5 minutes', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockRecentTxSelect.mockResolvedValueOnce({
      data: [{ created_at: new Date().toISOString() }],
      error: null,
    });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(429);
  });

  it('proceeds when the recent-attempt lookup itself errored (fails open)', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockRecentTxSelect.mockResolvedValueOnce({
      data: [{ created_at: new Date().toISOString() }],
      error: { message: 'lookup failed' },
    });
    mockAtSuccess();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(200);
  });

  it('proceeds when the most recent attempt is older than 5 minutes', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockRecentTxSelect.mockResolvedValueOnce({
      data: [{ created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() }],
      error: null,
    });
    mockAtSuccess();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(200);
  });

  // --- On-chain verification ---

  it('returns 400 when the transaction receipt cannot be fetched', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockWaitForTransactionReceipt.mockRejectedValueOnce(new Error('rpc timeout'));
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Could not verify transaction');
  });

  it('returns 400 when the transaction reverted on-chain', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockWaitForTransactionReceipt.mockResolvedValueOnce(makeReceipt({ status: 'reverted' }));
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Transaction failed on blockchain');
  });

  it('returns 400 when no log in the receipt matches the Airtime contract', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockWaitForTransactionReceipt.mockResolvedValueOnce(makeReceipt({ logs: [{ address: '0xSomeOtherContract' }] }));
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('OrderPaid event not found in transaction');
  });

  it('tolerates a malformed log entry while scanning for the OrderPaid event', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    // First log has no `.address` (throws on .toLowerCase()); second is the real match.
    mockWaitForTransactionReceipt.mockResolvedValueOnce(
      makeReceipt({ logs: [{}, { address: CONTRACT_ADDRESS }] })
    );
    mockAtSuccess();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(200);
  });

  // --- Successful airtime send ---

  it('returns 200 with requestId when Africa\'s Talking accepts the request', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtSuccess('ATQid_success');
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, requestId: 'ATQid_success' });
  });

  it('still returns 200 even if recording the successful transaction fails to insert', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockTxInsert.mockResolvedValueOnce({ error: { message: 'insert failed' } });
    mockAtSuccess();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(200);
  });

  // --- Africa's Talking non-JSON response ---

  it('returns 500 for a non-JSON 401 response from Africa\'s Talking', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => { throw new Error('not json'); },
      text: async () => 'Unauthorized',
    });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Authentication failed with airtime provider');
  });

  it('returns 500 for a non-JSON response with another status from Africa\'s Talking', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
      text: async () => 'Service unavailable',
    });
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Airtime service returned invalid response');
  });

  // --- Failure / refund path ---

  it('returns 409 without refunding when airtime was already sent for this order', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockPriorTxsSelect.mockResolvedValueOnce({ data: [{ provider_status: 'Sent' }], error: null });
    mockAtFailure();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.status).toBe('fulfilled');
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it('marks the order duplicate and returns 409 on AT duplicate-request throttling', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure('Duplicate Request received');
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.status).toBe('duplicate');
  });

  it('returns 500 and marks refund_failed when no treasury private key is configured', async () => {
    jest.resetModules();
    process.env.OPERATOR_PRIVATE_KEY = '';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('@/app/api/airtime/send/route');
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/contact support/i);
  });

  it('returns 500 and marks refund_failed when the configured private key is malformed', async () => {
    jest.resetModules();
    process.env.OPERATOR_PRIVATE_KEY = 'not-a-valid-key';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('@/app/api/airtime/send/route');
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
  });

  it('accepts a private key without a 0x prefix', async () => {
    jest.resetModules();
    process.env.OPERATOR_PRIVATE_KEY = '2'.repeat(64); // no 0x prefix
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('@/app/api/airtime/send/route');
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure();
    mockWriteContract.mockResolvedValueOnce('0xrefundtx');
    mockWaitForTransactionReceipt
      .mockResolvedValueOnce(makeReceipt()) // payment verification
      .mockResolvedValueOnce(makeReceipt()); // refund confirmation
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400); // refunded orders still report the original AT failure as an error
    const json = await res.json();
    expect(json.refundTxHash).toBe('0xrefundtx');
  });

  it('successfully refunds and returns 400 with the refund tx hash and original error', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure('Insufficient carrier balance');
    mockWriteContract.mockResolvedValueOnce('0xrefundtx');
    mockWaitForTransactionReceipt
      .mockResolvedValueOnce(makeReceipt()) // payment verification
      .mockResolvedValueOnce(makeReceipt()); // refund confirmation
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.refundTxHash).toBe('0xrefundtx');
    expect(json.error).toBe('Insufficient carrier balance');
  });

  it('still returns the refund result when logging the refunded-order update fails', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure();
    mockWriteContract.mockResolvedValueOnce('0xrefundtx');
    mockWaitForTransactionReceipt
      .mockResolvedValueOnce(makeReceipt())
      .mockResolvedValueOnce(makeReceipt());
    mockOrderUpdate.mockResolvedValueOnce({ error: null }); // processing update
    mockOrderUpdate.mockResolvedValueOnce({ error: { message: 'update failed' } }); // refunded update
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
  });

  it('still returns 200 even if inserting the failed-attempt transaction record errors', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure();
    mockTxInsert.mockResolvedValueOnce({ error: { message: 'insert failed' } });
    mockWriteContract.mockResolvedValueOnce('0xrefundtx');
    mockWaitForTransactionReceipt
      .mockResolvedValueOnce(makeReceipt())
      .mockResolvedValueOnce(makeReceipt());
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the refund transaction itself fails, with the Error message', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure('AT rejected the request');
    mockWaitForTransactionReceipt.mockResolvedValueOnce(makeReceipt()); // payment verification only
    mockWriteContract.mockRejectedValueOnce(new Error('refund reverted'));
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.refundError).toBe('refund reverted');
    expect(json.details).toBe('AT rejected the request');
  });

  it('returns 500 with a generic refundError when the refund throws a non-Error value', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtFailure();
    mockWaitForTransactionReceipt.mockResolvedValueOnce(makeReceipt());
    mockWriteContract.mockRejectedValueOnce('a raw string failure');
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.refundError).toBe('Unknown refund error');
  });

  it('falls back to "Unknown error" when Africa\'s Talking gives no error message at all', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ responses: [] }),
    });
    mockWaitForTransactionReceipt.mockResolvedValueOnce(makeReceipt());
    mockWriteContract.mockRejectedValueOnce(new Error('refund reverted'));
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    const json = await res.json();
    expect(json.details).toBe('Unknown error');
  });

  // --- Outer catch ---

  it('returns 500 when the request body is not valid JSON', async () => {
    const POST = await loadPOST();
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to send airtime');
  });

  it('declares the Node.js runtime and forces dynamic rendering', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const routeModule = require('@/app/api/airtime/send/route');
    expect(routeModule.runtime).toBe('nodejs');
    expect(routeModule.dynamic).toBe('force-dynamic');
  });

  it('uses "Unknown error" details when the outer catch receives a non-Error value', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockRejectedValueOnce('raw string db failure');
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.details).toBe('Unknown error');
  });

  it('includes the message when the outer catch receives a genuine Error', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockRejectedValueOnce(new Error('genuine db failure'));
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.details).toBe('genuine db failure');
  });

  // --- Remaining fallback branches ---

  it('falls back to the anon key when SUPABASE_SERVICE_ROLE_KEY is unset', async () => {
    jest.resetModules();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('@/app/api/airtime/send/route');
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder(), error: null });
    mockAtSuccess();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(200);
  });

  it('defaults to KES when the order has no currency recorded', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder({ currency: undefined }), error: null });
    mockAtSuccess();
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(200);
  });

  it('treats a missing service_fee_usdc as 0 when computing the refund amount', async () => {
    const POST = await loadPOST();
    mockOrderSelect.mockResolvedValueOnce({ data: baseOrder({ service_fee_usdc: undefined }), error: null });
    mockAtFailure();
    mockWriteContract.mockResolvedValueOnce('0xrefundtx');
    mockWaitForTransactionReceipt
      .mockResolvedValueOnce(makeReceipt())
      .mockResolvedValueOnce(makeReceipt());
    const res = await POST(makeRequest({ orderRef: 'abc12345', txHash: '0xtx' }));
    expect(res.status).toBe(400);
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: expect.arrayContaining([expect.anything(), expect.anything(), expect.anything()]) })
    );
  });

});
