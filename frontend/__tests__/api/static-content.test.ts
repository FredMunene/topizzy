import { GET as getPrivacy } from '@/app/api/privacy/route';
import { GET as getTerms } from '@/app/api/terms/route';
import { GET as getFaqs } from '@/app/api/faqs/route';
import { GET as getGeo } from '@/app/api/geo/route';
import { POST as postLog } from '@/app/api/log/route';
import { NextRequest } from 'next/server';

describe('GET /api/privacy', () => {
  it('returns the privacy policy sections with a cache header', async () => {
    const res = await getPrivacy();
    expect(res.headers.get('Cache-Control')).toMatch(/public/);
    const json = await res.json();
    expect(json.lastUpdated).toBeTruthy();
    expect(Array.isArray(json.sections)).toBe(true);
    expect(json.sections.length).toBeGreaterThan(0);
    expect(json.sections[0]).toHaveProperty('heading');
    expect(json.sections[0]).toHaveProperty('body');
  });
});

describe('GET /api/terms', () => {
  it('returns the terms sections with a cache header', async () => {
    const res = await getTerms();
    expect(res.headers.get('Cache-Control')).toMatch(/public/);
    const json = await res.json();
    expect(json.lastUpdated).toBeTruthy();
    expect(Array.isArray(json.sections)).toBe(true);
    expect(json.sections.length).toBeGreaterThan(0);
  });
});

describe('GET /api/faqs', () => {
  it('returns the faq list', async () => {
    const res = await getFaqs();
    const json = await res.json();
    expect(Array.isArray(json.faqs)).toBe(true);
    expect(json.faqs.length).toBeGreaterThan(0);
    expect(json.faqs[0]).toHaveProperty('question');
    expect(json.faqs[0]).toHaveProperty('answer');
    expect(json.faqs[0]).toHaveProperty('category');
  });
});

describe('GET /api/geo', () => {
  it('reads geo headers set by the edge network', async () => {
    const req = new NextRequest('http://localhost/api/geo', {
      headers: {
        'x-vercel-ip-country': 'KE',
        'x-vercel-ip-country-region': 'Nairobi',
        'x-vercel-ip-city': 'Nairobi',
      },
    });
    const res = await getGeo(req);
    const json = await res.json();
    expect(json).toEqual({ country: 'KE', region: 'Nairobi', city: 'Nairobi' });
  });

  it('returns empty strings when geo headers are absent', async () => {
    const req = new NextRequest('http://localhost/api/geo');
    const res = await getGeo(req);
    const json = await res.json();
    expect(json).toEqual({ country: '', region: '', city: '' });
  });
});

describe('POST /api/log', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('logs an info message and returns ok', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await postLog(makeRequest({ level: 'info', message: 'hello' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(logSpy).toHaveBeenCalledWith('hello');
    logSpy.mockRestore();
  });

  it('logs an error message with meta serialized inline', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await postLog(makeRequest({ level: 'error', message: 'boom', meta: { orderRef: 'abc' } }));
    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith('boom {"orderRef":"abc"}');
    errorSpy.mockRestore();
  });

  it('returns 400 when level is missing', async () => {
    const res = await postLog(makeRequest({ message: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is missing', async () => {
    const res = await postLog(makeRequest({ level: 'info' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is null', async () => {
    const res = await postLog(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the request body is not valid JSON', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const req = new NextRequest('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await postLog(req);
    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});
