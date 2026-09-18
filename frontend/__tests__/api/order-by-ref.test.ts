import { GET } from '@/app/api/orders/[orderRef]/route';
import { NextRequest } from 'next/server';

const mockSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: (...args: unknown[]) => mockSingle(...args),
    })),
  })),
}));

function makeRequest(orderRef: string) {
  return {
    request: new NextRequest(`http://localhost/api/orders/${orderRef}`),
    context: { params: Promise.resolve({ orderRef }) },
  };
}

describe('GET /api/orders/[orderRef]', () => {
  beforeEach(() => mockSingle.mockReset());

  it('returns the order when found', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { order_ref: 'abc12345', status: 'pending', chain_id: 8453 },
      error: null,
    });
    const { request, context } = makeRequest('abc12345');
    const res = await GET(request, context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.order_ref).toBe('abc12345');
  });

  it('returns 404 when the order does not exist', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const { request, context } = makeRequest('missing');
    const res = await GET(request, context);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Order not found');
  });

  it('returns 404 when the query succeeds but returns no data', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null });
    const { request, context } = makeRequest('missing');
    const res = await GET(request, context);
    expect(res.status).toBe(404);
  });

  it('returns 500 when the lookup throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSingle.mockRejectedValueOnce(new Error('db unreachable'));
    const { request, context } = makeRequest('abc12345');
    const res = await GET(request, context);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch order');
    errorSpy.mockRestore();
  });
});
