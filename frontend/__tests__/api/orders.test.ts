import { POST } from '@/app/api/orders/route';
import { NextRequest } from 'next/server';

// single() is called twice per request: once for the price lookup, once for
// the order insert's .select().single(). Default both to success; individual
// tests override one or the other with mockResolvedValueOnce.
const mockSingle = jest.fn().mockResolvedValue({ data: { price: 130 }, error: null });

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: (...args: unknown[]) => mockSingle(...args),
    })),
  })),
}));

// Mock nanoid
jest.mock('nanoid', () => ({ nanoid: () => 'test1234' }));

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBase = {
  phoneNumber: '+254712345678',
  amountKes: 100,
  walletAddress: '0xabc123',
};

describe('POST /api/orders', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockSingle.mockResolvedValue({ data: { price: 130 }, error: null });
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const res = await POST(makeRequest({ amountKes: 100, walletAddress: '0xabc' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing/i);
  });

  it('returns 400 when amountKes is missing', async () => {
    const res = await POST(makeRequest({ phoneNumber: '+254712345678', walletAddress: '0xabc' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when walletAddress is missing', async () => {
    const res = await POST(makeRequest({ phoneNumber: '+254712345678', amountKes: 100 }));
    expect(res.status).toBe(400);
  });

  it('resolves KES currency for Kenya (+254) numbers', async () => {
    const res = await POST(makeRequest(validBase));
    const json = await res.json();
    expect(json.currency).toBe('KES');
  });

  it('resolves UGX currency for Uganda (+256) numbers', async () => {
    const res = await POST(makeRequest({ ...validBase, phoneNumber: '+256712345678', amountKes: 5000 }));
    const json = await res.json();
    expect(json.currency).toBe('UGX');
  });

  it('resolves TZS currency for Tanzania (+255) numbers', async () => {
    const res = await POST(makeRequest({ ...validBase, phoneNumber: '+255712345678', amountKes: 10000 }));
    const json = await res.json();
    expect(json.currency).toBe('TZS');
  });

  it('resolves RWF currency for Rwanda (+250) numbers', async () => {
    const res = await POST(makeRequest({ ...validBase, phoneNumber: '+250712345678', amountKes: 1000 }));
    const json = await res.json();
    expect(json.currency).toBe('RWF');
  });

  it('returns 400 when Kenya amount is below minimum (5 KES)', async () => {
    const res = await POST(makeRequest({ ...validBase, amountKes: 1 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/between/i);
  });

  it('returns 400 when Kenya amount exceeds maximum (5000 KES)', async () => {
    const res = await POST(makeRequest({ ...validBase, amountKes: 6000 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/between/i);
  });

  it('returns 400 when Uganda amount is below minimum (50 UGX)', async () => {
    const res = await POST(makeRequest({ ...validBase, phoneNumber: '+256712345678', amountKes: 10 }));
    expect(res.status).toBe(400);
  });

  it('includes orderRef, amountUsdc, serviceFeeUsdc in success response', async () => {
    const res = await POST(makeRequest(validBase));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      orderRef: 'test1234',
      amountKes: 100,
      currency: 'KES',
    });
    expect(typeof json.amountUsdc).toBe('number');
    expect(typeof json.serviceFeeUsdc).toBe('number');
  });

  it('calculates amountUsdc correctly: airtimeUsdc = amount / price + serviceFee', async () => {
    // price mock returns 130, SERVICE_FEE defaults to 0.05
    const res = await POST(makeRequest({ ...validBase, amountKes: 130 }));
    const json = await res.json();
    // airtimeUsdc = 130 / 130 = 1.0, serviceFee = 0.05, total = 1.05
    expect(json.airtimeUsdc).toBeCloseTo(1.0, 4);
    expect(json.serviceFeeUsdc).toBeCloseTo(0.05, 4);
    expect(json.amountUsdc).toBeCloseTo(1.05, 4);
  });

  it('returns 500 when the price lookup fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'no price row' } });
    const res = await POST(makeRequest(validBase));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/latest price/i);
  });

  it('returns 500 when the order insert fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSingle
      .mockResolvedValueOnce({ data: { price: 130 }, error: null }) // price lookup succeeds
      .mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } }); // insert fails
    const res = await POST(makeRequest(validBase));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/failed to create order/i);
    errorSpy.mockRestore();
  });

  it('returns 500 when the request body is not valid JSON', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/failed to create order/i);
    errorSpy.mockRestore();
  });

  it('uses the chainId sent by the client instead of the default', async () => {
    // Arc's chain id (5042) — see lib/chains.ts
    const res = await POST(makeRequest({ ...validBase, chainId: 5042 }));
    const json = await res.json();
    expect(json.chainId).toBe(5042);
  });

  it('treats a phone number without a leading "+" the same as one with it', async () => {
    const res = await POST(makeRequest({ ...validBase, phoneNumber: '254712345678' }));
    const json = await res.json();
    expect(json.currency).toBe('KES');
  });

  it('defaults to Kenya (254/KES) for a dialing code not in the supported list', async () => {
    const res = await POST(makeRequest({ ...validBase, phoneNumber: '+999712345678' }));
    const json = await res.json();
    expect(json.currency).toBe('KES');
  });
});

describe('POST /api/orders — module-level env fallbacks', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    mockSingle.mockReset();
    mockSingle.mockResolvedValue({ data: { price: 130 }, error: null });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('falls back to the default 0.05 USDC fee when SERVICE_FEE is unset', async () => {
    delete process.env.SERVICE_FEE;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST: reloadedPOST } = require('@/app/api/orders/route');
    const res = await reloadedPOST(makeRequest(validBase));
    const json = await res.json();
    expect(json.serviceFeeUsdc).toBeCloseTo(0.05, 4);
  });

  it('falls back to the anon key when SUPABASE_SERVICE_ROLE_KEY is unset', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_SUPABASE_ANON_KEY = 'anon-key';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST: reloadedPOST } = require('@/app/api/orders/route');
    const res = await reloadedPOST(makeRequest(validBase));
    expect(res.status).toBe(200);
  });
});
