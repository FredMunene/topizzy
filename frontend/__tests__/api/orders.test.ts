import { POST } from '@/app/api/orders/route';
import { NextRequest } from 'next/server';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { price: 130 },
        error: null,
      }),
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

describe('POST /api/orders', () => {
  const validBase = {
    phoneNumber: '+254712345678',
    amountKes: 100,
    walletAddress: '0xabc123',
  };

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
});
