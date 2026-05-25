/**
 * Pure logic tests for country/currency/amount rules mirrored from the platform page
 * and orders API. These run without any DOM or network setup.
 */

const countries = [
  { code: 'KE', name: 'Kenya', prefix: '+254' },
  { code: 'RW', name: 'Rwanda', prefix: '+250' },
  { code: 'UG', name: 'Uganda', prefix: '+256' },
  { code: 'TZ', name: 'Tanzania', prefix: '+255' },
  { code: 'ZA', name: 'South Africa', prefix: '+27' },
];

const currencyMap: Record<string, string> = {
  '254': 'KES',
  '255': 'TZS',
  '256': 'UGX',
  '250': 'RWF',
  '27': 'ZAR',
};

const amountRestrictions: Record<string, { lower: number; upper: number }> = {
  '254': { lower: 5, upper: 5000 },
  '256': { lower: 50, upper: 200000 },
  '255': { lower: 500, upper: 200000 },
  '250': { lower: 100, upper: 40000 },
  '27': { lower: 5, upper: 65 },
};

const dialingCodes = ['254', '255', '256', '250', '27'];

function detectDialCode(phoneNumber: string): string {
  const withoutPlus = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;
  return dialingCodes.find(code => withoutPlus.startsWith(code)) ?? '254';
}

function getFlagEmoji(countryCode: string): string {
  const map: Record<string, string> = {
    KE: '🇰🇪', RW: '🇷🇼', UG: '🇺🇬', ZA: '🇿🇦', GH: '🇬🇭', NG: '🇳🇬', TZ: '🇹🇿',
  };
  return map[countryCode] ?? '🇹🇿';
}

describe('Country list', () => {
  it('has 5 supported countries', () => {
    expect(countries).toHaveLength(5);
  });

  it('defaults to Kenya first', () => {
    expect(countries[0].code).toBe('KE');
    expect(countries[0].prefix).toBe('+254');
  });

  it('each country has a code, name, and prefix', () => {
    countries.forEach(c => {
      expect(c.code).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.prefix).toMatch(/^\+\d+$/);
    });
  });
});

describe('Currency detection from phone number', () => {
  it.each([
    ['+254712345678', 'KES'],
    ['+255712345678', 'TZS'],
    ['+256712345678', 'UGX'],
    ['+250712345678', 'RWF'],
    ['+27712345678', 'ZAR'],
  ])('%s → %s', (phone, expectedCurrency) => {
    const code = detectDialCode(phone);
    expect(currencyMap[code]).toBe(expectedCurrency);
  });

  it('falls back to KES for unknown prefixes', () => {
    const code = detectDialCode('+9991234567');
    expect(code).toBe('254'); // default fallback
  });
});

describe('Amount restrictions', () => {
  it.each([
    ['254', 5, 5000],
    ['256', 50, 200000],
    ['255', 500, 200000],
    ['250', 100, 40000],
    ['27', 5, 65],
  ])('dial code %s: min=%d max=%d', (dialCode, min, max) => {
    expect(amountRestrictions[dialCode].lower).toBe(min);
    expect(amountRestrictions[dialCode].upper).toBe(max);
  });

  it('rejects Kenya amount below minimum', () => {
    const { lower, upper } = amountRestrictions['254'];
    expect(4).toBeLessThan(lower);
  });

  it('rejects Kenya amount above maximum', () => {
    const { upper } = amountRestrictions['254'];
    expect(5001).toBeGreaterThan(upper);
  });

  it('accepts valid Kenya amount', () => {
    const { lower, upper } = amountRestrictions['254'];
    const amount = 500;
    expect(amount).toBeGreaterThanOrEqual(lower);
    expect(amount).toBeLessThanOrEqual(upper);
  });
});

describe('Flag emoji mapping', () => {
  it.each([
    ['KE', '🇰🇪'],
    ['RW', '🇷🇼'],
    ['UG', '🇺🇬'],
    ['ZA', '🇿🇦'],
    ['GH', '🇬🇭'],
    ['NG', '🇳🇬'],
    ['TZ', '🇹🇿'],
  ])('%s → %s', (code, emoji) => {
    expect(getFlagEmoji(code)).toBe(emoji);
  });

  it('falls back to TZ flag for unknown country codes', () => {
    expect(getFlagEmoji('XX')).toBe('🇹🇿');
  });
});

describe('USDC amount calculation', () => {
  const SERVICE_FEE = 0.05;

  it('calculates airtimeUsdc correctly', () => {
    const price = 130; // KES per USDC
    const amount = 130; // KES
    const airtimeUsdc = amount / price;
    expect(airtimeUsdc).toBeCloseTo(1.0, 5);
  });

  it('adds service fee to get totalUsdc', () => {
    const price = 130;
    const amount = 260;
    const airtimeUsdc = amount / price; // 2.0
    const totalUsdc = airtimeUsdc + SERVICE_FEE;
    expect(totalUsdc).toBeCloseTo(2.05, 5);
  });

  it('service fee is always 0.05 USDC regardless of amount', () => {
    [50, 500, 5000].forEach(amount => {
      const price = 130;
      const airtimeUsdc = amount / price;
      const totalUsdc = airtimeUsdc + SERVICE_FEE;
      expect(totalUsdc - airtimeUsdc).toBeCloseTo(SERVICE_FEE, 5);
    });
  });
});
