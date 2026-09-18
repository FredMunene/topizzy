import { NextRequest } from 'next/server';

const mockSingle = jest.fn();
const mockUpsert = jest.fn().mockResolvedValue({ data: null, error: null });

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: (...args: unknown[]) => mockSingle(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    })),
  },
}));

// Fake timers so the deliberate 500ms debounce delay doesn't slow the suite,
// and to keep test runs deterministic.
jest.useFakeTimers();

async function callGet(url: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require('@/app/api/prices/route');
  const resultPromise = GET(new NextRequest(url));
  await jest.advanceTimersByTimeAsync(500);
  return resultPromise;
}

describe('GET /api/prices', () => {
  const ORIGINAL_ENV = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_SUPABASE_ANON_KEY: 'anon-key',
      SERVICE_FEE: '0.05',
    };
    // Real .env values would otherwise leak in and make the spread math
    // (and therefore the expected prices below) environment-dependent.
    delete process.env.PRICE_SPREAD;
    delete process.env.PRICE_SPREAD_KES;
    delete process.env.PRICE_SPREAD_UGX;
    delete process.env.PRICE_SPREAD_ZAR;
    mockSingle.mockReset();
    mockUpsert.mockClear();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = originalFetch;
  });

  it('returns 500 when required Supabase env vars are missing', async () => {
    delete process.env.NEXT_SUPABASE_URL;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callGet('http://localhost/api/prices?currency=KES');
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Service configuration error');
    errorSpy.mockRestore();
  });

  it('returns the cached DB price when it is less than 15 seconds old, without calling Coinbase', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { price: 128.5, updated_at: new Date().toISOString() },
      error: null,
    });
    const res = await callGet('http://localhost/api/prices?currency=KES');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, price: 128.5, serviceFee: 0.05 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('defaults to KES when no currency query param is given', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { price: 128.5, updated_at: new Date().toISOString() },
      error: null,
    });
    const res = await callGet('http://localhost/api/prices');
    const json = await res.json();
    expect(json.price).toBe(128.5);
  });

  it('fetches a fresh rate from Coinbase, applies the spread, and upserts it when the DB price is stale', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { price: 100, updated_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { rates: { KES: '129.1700' } } }),
    });
    const res = await callGet('http://localhost/api/prices?currency=KES');
    expect(res.status).toBe(200);
    const json = await res.json();
    // 129.17 * (1 - 0.005) = 128.52415 → toFixed(2) = "128.52"
    expect(json.price).toBeCloseTo(128.52, 2);
    expect(json.serviceFee).toBe(0.05);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'USDC', currency: 'KES', price: json.price }),
      { onConflict: 'token,currency' }
    );
  });

  it('falls back to the existing DB price when Coinbase responds but omits the requested currency', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { price: 100, updated_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { rates: {} } }),
    });
    const res = await callGet('http://localhost/api/prices?currency=KES');
    const json = await res.json();
    expect(json.price).toBe(100);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('falls back to the existing DB price when Coinbase responds with a non-ok status', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { price: 100, updated_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    const res = await callGet('http://localhost/api/prices?currency=KES');
    const json = await res.json();
    expect(json.price).toBe(100);
  });

  it('falls back to 0 when Coinbase fails and there is no existing DB price', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));
    const res = await callGet('http://localhost/api/prices?currency=KES');
    const json = await res.json();
    expect(json.price).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('reuses the in-flight request for the same currency instead of calling Coinbase twice', async () => {
    mockSingle.mockResolvedValue({
      data: { price: 100, updated_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    });
    let resolveFetch: (value: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveFetch = resolve; })
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/prices/route');
    const first = GET(new NextRequest('http://localhost/api/prices?currency=KES'));
    await jest.advanceTimersByTimeAsync(500);
    // Second request starts while the first's Coinbase fetch is still pending.
    const second = GET(new NextRequest('http://localhost/api/prices?currency=KES'));
    await jest.advanceTimersByTimeAsync(500);

    resolveFetch({ ok: true, json: async () => ({ data: { rates: { KES: '130.00' } } }) });

    const [firstRes, secondRes] = await Promise.all([first, second]);
    const [firstJson, secondJson] = await Promise.all([firstRes.json(), secondRes.json()]);
    expect(firstJson.price).toBe(secondJson.price);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('applies the default spread for a currency with no dedicated spread env var', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { price: 1, updated_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { rates: { NGN: '1600.00' } } }),
    });
    const res = await callGet('http://localhost/api/prices?currency=NGN');
    const json = await res.json();
    // Default spread is 0.005: 1600 * 0.995 = 1592
    expect(json.price).toBeCloseTo(1592, 1);
  });

  it('returns 500 with a fallback price when the DB lookup throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSingle.mockRejectedValueOnce(new Error('db unreachable'));
    const res = await callGet('http://localhost/api/prices?currency=KES');
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.using_fallback).toBe(true);
    expect(json.price).toBe(0);
    errorSpy.mockRestore();
  });

  it('stringifies a non-Error thrown value in the error response', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSingle.mockImplementationOnce(() => { throw 'raw string failure'; });
    const res = await callGet('http://localhost/api/prices?currency=KES');
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.details).toBe('raw string failure');
    errorSpy.mockRestore();
  });

  it('defaults the service fee to 0.05 when SERVICE_FEE is unset', async () => {
    delete process.env.SERVICE_FEE;
    mockSingle.mockResolvedValueOnce({
      data: { price: 128.5, updated_at: new Date().toISOString() },
      error: null,
    });
    const res = await callGet('http://localhost/api/prices?currency=KES');
    const json = await res.json();
    expect(json.serviceFee).toBe(0.05);
  });
});
