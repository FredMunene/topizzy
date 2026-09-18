describe('robots()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('allows all crawlers and points at the sitemap using NEXT_PUBLIC_URL', () => {
    process.env.NEXT_PUBLIC_URL = 'https://topizzy.xyz';
    delete process.env.VERCEL_URL;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const robots = require('@/app/robots').default;
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://topizzy.xyz/sitemap.xml',
    });
  });

  it('falls back to VERCEL_URL when NEXT_PUBLIC_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_URL;
    process.env.VERCEL_URL = 'topizzy.vercel.app';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const robots = require('@/app/robots').default;
    expect(robots().sitemap).toBe('https://topizzy.vercel.app/sitemap.xml');
  });

  it('falls back to localhost when neither env var is set', () => {
    delete process.env.NEXT_PUBLIC_URL;
    delete process.env.VERCEL_URL;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const robots = require('@/app/robots').default;
    expect(robots().sitemap).toBe('http://localhost:3000/sitemap.xml');
  });
});

describe('sitemap() URL fallback', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('falls back to VERCEL_URL when NEXT_PUBLIC_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_URL;
    process.env.VERCEL_URL = 'topizzy.vercel.app';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sitemap = require('@/app/sitemap').default;
    expect(sitemap()[0].url).toBe('https://topizzy.vercel.app');
  });

  it('falls back to localhost when neither env var is set', () => {
    delete process.env.NEXT_PUBLIC_URL;
    delete process.env.VERCEL_URL;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sitemap = require('@/app/sitemap').default;
    expect(sitemap()[0].url).toBe('http://localhost:3000');
  });
});

describe('sitemap()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns one entry for the root URL', () => {
    process.env.NEXT_PUBLIC_URL = 'https://topizzy.xyz';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sitemap = require('@/app/sitemap').default;
    const entries = sitemap();
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://topizzy.xyz');
    expect(entries[0].changeFrequency).toBe('weekly');
    expect(entries[0].priority).toBe(1);
    expect(entries[0].lastModified).toBeInstanceOf(Date);
  });
});

describe('GET /.well-known/farcaster.json', () => {
  it('returns the mini app manifest', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/.well-known/farcaster.json/route');
    const res = await GET();
    const json = await res.json();
    expect(json.miniapp.name).toBe('Topizzy');
    expect(json.accountAssociation).toBeDefined();
  });
});
