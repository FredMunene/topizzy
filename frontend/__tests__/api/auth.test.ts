import { NextRequest } from 'next/server';

const mockVerifyJwt = jest.fn();

// Class must be declared inside the factory — jest.mock is hoisted above
// any outer-scope class/const declarations, so referencing one from here
// would hit the temporal dead zone.
jest.mock('@farcaster/quick-auth', () => {
  class InvalidTokenError extends Error {}
  return {
    createClient: jest.fn(() => ({ verifyJwt: (...args: unknown[]) => mockVerifyJwt(...args) })),
    Errors: { InvalidTokenError },
  };
});

import { GET } from '@/app/api/auth/route';
import { Errors } from '@farcaster/quick-auth';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth', { headers });
}

describe('GET /api/auth', () => {
  beforeEach(() => mockVerifyJwt.mockReset());

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toBe('Missing token');
  });

  it('returns 401 when the Authorization header is not a Bearer token', async () => {
    const res = await GET(makeRequest({ Authorization: 'Basic abc123' }));
    expect(res.status).toBe(401);
  });

  it('returns the userFid when the token is valid', async () => {
    mockVerifyJwt.mockResolvedValueOnce({ sub: 'fid-123' });
    const res = await GET(makeRequest({ Authorization: 'Bearer good-token', origin: 'https://topizzy.xyz' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.userFid).toBe('fid-123');
    expect(mockVerifyJwt).toHaveBeenCalledWith({ token: 'good-token', domain: 'topizzy.xyz' });
  });

  it('returns 401 for an invalid token', async () => {
    mockVerifyJwt.mockRejectedValueOnce(new Errors.InvalidTokenError('bad token'));
    const res = await GET(makeRequest({ Authorization: 'Bearer bad-token' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toBe('Invalid token');
  });

  it('returns 500 with the error message for other Error instances', async () => {
    mockVerifyJwt.mockRejectedValueOnce(new Error('verifier unreachable'));
    const res = await GET(makeRequest({ Authorization: 'Bearer x' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toBe('verifier unreachable');
  });

  it('rethrows non-Error values', async () => {
    mockVerifyJwt.mockRejectedValueOnce('a raw string rejection');
    await expect(GET(makeRequest({ Authorization: 'Bearer x' }))).rejects.toBe('a raw string rejection');
  });

  describe('domain resolution (getUrlHost)', () => {
    it('uses the origin header when present and a valid URL', async () => {
      mockVerifyJwt.mockResolvedValueOnce({ sub: 'fid' });
      await GET(makeRequest({ Authorization: 'Bearer x', origin: 'https://from-origin.example' }));
      expect(mockVerifyJwt).toHaveBeenCalledWith(expect.objectContaining({ domain: 'from-origin.example' }));
    });

    it('falls back to the host header when the origin header is not a valid URL', async () => {
      mockVerifyJwt.mockResolvedValueOnce({ sub: 'fid' });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await GET(makeRequest({ Authorization: 'Bearer x', origin: 'not a url', host: 'from-host.example' }));
      expect(mockVerifyJwt).toHaveBeenCalledWith(expect.objectContaining({ domain: 'from-host.example' }));
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('falls back to the host header when origin is absent', async () => {
      mockVerifyJwt.mockResolvedValueOnce({ sub: 'fid' });
      await GET(makeRequest({ Authorization: 'Bearer x', host: 'from-host.example' }));
      expect(mockVerifyJwt).toHaveBeenCalledWith(expect.objectContaining({ domain: 'from-host.example' }));
    });

    describe('env fallback when neither origin nor host headers are present', () => {
      const ORIGINAL_ENV = process.env;

      beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
      });

      afterAll(() => {
        process.env = ORIGINAL_ENV;
      });

      it('uses NEXT_PUBLIC_URL in production', async () => {
        process.env.VERCEL_ENV = 'production';
        process.env.NEXT_PUBLIC_URL = 'https://topizzy.xyz';
        mockVerifyJwt.mockResolvedValueOnce({ sub: 'fid' });
        await GET(makeRequest({ Authorization: 'Bearer x' }));
        expect(mockVerifyJwt).toHaveBeenCalledWith(expect.objectContaining({ domain: 'topizzy.xyz' }));
      });

      it('uses VERCEL_URL outside production', async () => {
        delete process.env.VERCEL_ENV;
        process.env.VERCEL_URL = 'topizzy-preview.vercel.app';
        mockVerifyJwt.mockResolvedValueOnce({ sub: 'fid' });
        await GET(makeRequest({ Authorization: 'Bearer x' }));
        expect(mockVerifyJwt).toHaveBeenCalledWith(expect.objectContaining({ domain: 'topizzy-preview.vercel.app' }));
      });

      it('falls back to localhost when nothing else is available', async () => {
        delete process.env.VERCEL_ENV;
        delete process.env.VERCEL_URL;
        mockVerifyJwt.mockResolvedValueOnce({ sub: 'fid' });
        await GET(makeRequest({ Authorization: 'Bearer x' }));
        expect(mockVerifyJwt).toHaveBeenCalledWith(expect.objectContaining({ domain: 'localhost:3000' }));
      });
    });
  });
});
