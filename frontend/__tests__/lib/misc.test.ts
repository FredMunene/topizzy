describe('AIRTIME_ABI', () => {
  it('is a non-empty ABI array including the expected functions', async () => {
    const { AIRTIME_ABI } = await import('@/lib/airtime-abi');
    expect(Array.isArray(AIRTIME_ABI)).toBe(true);
    expect(AIRTIME_ABI.length).toBeGreaterThan(0);
    const names = AIRTIME_ABI.filter((f) => f.type === 'function').map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['deposit', 'depositWithPermit', 'refund']));
  });
});

describe('lib/supabase', () => {
  const mockCreateClient = jest.fn(() => ({ from: jest.fn() }));

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));
    process.env.NEXT_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_SUPABASE_ANON_KEY = 'anon-key';
  });

  afterEach(() => {
    jest.dontMock('@supabase/supabase-js');
  });

  it('creates a client from the public Supabase URL and anon key', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('@/lib/supabase');
    expect(mockCreateClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key');
    expect(supabase).toBeDefined();
  });
});
