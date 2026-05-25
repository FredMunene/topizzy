import { POST } from '@/app/api/airtime/validate/route';
import { NextRequest } from 'next/server';

const mockSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: (...args: unknown[]) => mockSingle(...args),
    })),
  })),
}));

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/airtime/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  transactionId: 'txn_001',
  phoneNumber: '+254712345678',
  sourceIpAddress: '196.250.215.198',
  currencyCode: 'KES',
  amount: '100',
  requestMetadata: { orderRef: 'abc12345' },
};

describe('POST /api/airtime/validate', () => {
  beforeEach(() => mockSingle.mockReset());

  it('returns 400 when transactionId is missing', async () => {
    const { transactionId: _, ...rest } = validPayload;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.status).toBe('Failed');
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const { phoneNumber: _, ...rest } = validPayload;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('returns 400 when sourceIpAddress is missing', async () => {
    const { sourceIpAddress: _, ...rest } = validPayload;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('returns 400 when currencyCode is missing', async () => {
    const { currencyCode: _, ...rest } = validPayload;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const { amount: _, ...rest } = validPayload;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no matching order is found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.status).toBe('Failed');
  });

  it('returns 400 when order currency does not match callback currencyCode', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { currency: 'UGX', order_ref: 'abc12345' },
      error: null,
    });
    const res = await POST(makeRequest(validPayload)); // currencyCode is KES
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.status).toBe('Failed');
  });

  it('returns Validated when order currency matches', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { currency: 'KES', order_ref: 'abc12345' },
      error: null,
    });
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('Validated');
  });
});
