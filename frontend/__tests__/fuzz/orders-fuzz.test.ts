/**
 * Property-based fuzz tests for orders API business logic.
 * fast-check generates hundreds of random inputs per property to find edge cases.
 */
import * as fc from 'fast-check';

// --- Logic mirrored from app/api/orders/route.ts ---

const dialingCodes = ['254', '255', '256', '250', '27'];

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

const SERVICE_FEE = 0.05;

function detectDialCode(phone: string): string {
  const withoutPlus = phone.startsWith('+') ? phone.slice(1) : phone;
  return dialingCodes.find(code => withoutPlus.startsWith(code)) ?? '254';
}

function isAmountValid(amount: number, dialCode: string): boolean {
  const r = amountRestrictions[dialCode] ?? amountRestrictions['254'];
  return amount >= r.lower && amount <= r.upper;
}

function calcUsdcTotal(amountLocal: number, price: number): number {
  return amountLocal / price + SERVICE_FEE;
}

// --- Fuzz tests ---

describe('Fuzz: currency detection', () => {
  it('always returns a known currency for any phone string', () => {
    fc.assert(
      fc.property(fc.string(), (phone) => {
        const code = detectDialCode(phone);
        const currency = currencyMap[code] ?? 'KES';
        expect(['KES', 'TZS', 'UGX', 'RWF', 'ZAR']).toContain(currency);
      }),
    );
  });

  it('correctly detects KES for any string starting with 254', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^254\d{6,9}$/), (digits) => {
        const code = detectDialCode(digits);
        expect(code).toBe('254');
        expect(currencyMap[code]).toBe('KES');
      }),
    );
  });

  it('correctly detects UGX for any string starting with +256', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\+256\d{6,9}$/), (phone) => {
        const code = detectDialCode(phone);
        expect(code).toBe('256');
        expect(currencyMap[code]).toBe('UGX');
      }),
    );
  });

  it('unknown prefixes always fall back to 254 (KES)', () => {
    // Strings that don't start with any known dialing code
    fc.assert(
      fc.property(
        fc.stringMatching(/^[1-9]\d{8,11}$/).filter(
          s => !dialingCodes.some(c => s.startsWith(c)),
        ),
        (phone) => {
          const code = detectDialCode(phone);
          expect(code).toBe('254');
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Fuzz: amount validation', () => {
  it('valid amounts for Kenya are always between 5 and 5000', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 5000 }), (amount) => {
        expect(isAmountValid(amount, '254')).toBe(true);
      }),
    );
  });

  it('amounts below lower bound are always rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...dialingCodes),
        (dialCode) => {
          const { lower } = amountRestrictions[dialCode];
          if (lower > 1) {
            fc.assert(
              fc.property(fc.integer({ min: 0, max: lower - 1 }), (amount) => {
                expect(isAmountValid(amount, dialCode)).toBe(false);
              }),
            );
          }
        },
      ),
    );
  });

  it('amounts above upper bound are always rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...dialingCodes),
        (dialCode) => {
          const { upper } = amountRestrictions[dialCode];
          fc.assert(
            fc.property(fc.integer({ min: upper + 1, max: upper + 100000 }), (amount) => {
              expect(isAmountValid(amount, dialCode)).toBe(false);
            }),
          );
        },
      ),
    );
  });
});

describe('Fuzz: USDC calculation', () => {
  it('total is always greater than service fee alone', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 200000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000000, noNaN: true }),
        (amount, price) => {
          const total = calcUsdcTotal(amount, price);
          expect(total).toBeGreaterThan(SERVICE_FEE);
        },
      ),
    );
  });

  it('total is always positive for positive inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 200000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000000, noNaN: true }),
        (amount, price) => {
          expect(calcUsdcTotal(amount, price)).toBeGreaterThan(0);
        },
      ),
    );
  });

  it('higher local amount always produces higher total USDC (same price)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 99999, noNaN: true }),
        fc.double({ min: 0.01, max: 1000000, noNaN: true }),
        (amount, price) => {
          const totalA = calcUsdcTotal(amount, price);
          const totalB = calcUsdcTotal(amount + 1, price);
          expect(totalB).toBeGreaterThan(totalA);
        },
      ),
    );
  });

  it('higher price always produces lower total USDC (same amount)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 200000, noNaN: true }),
        fc.float({ min: 1, max: 999999, noNaN: true }),
        (amount, price) => {
          const totalA = calcUsdcTotal(amount, price);
          const totalB = calcUsdcTotal(amount, price + 1);
          expect(totalB).toBeLessThan(totalA);
        },
      ),
    );
  });

  it('service fee is always exactly 0.05 USDC of the total', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 200000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000000, noNaN: true }),
        (amount, price) => {
          const airtimeUsdc = amount / price;
          const total = calcUsdcTotal(amount, price);
          // Fuzzer found that IEEE-754 floating point drifts past 1e-10 at
          // extreme price values (e.g. price=0.01, amount≈21000). Precision 5
          // (within 5e-6) is the realistic guarantee for this calculation.
          expect(total - airtimeUsdc).toBeCloseTo(SERVICE_FEE, 5);
        },
      ),
    );
  });
});

describe('Fuzz: phone number normalisation', () => {
  it('phone with or without leading + gives same dial code', () => {
    fc.assert(
      fc.property(fc.constantFrom(...dialingCodes), fc.stringMatching(/^\d{6,9}$/), (code, suffix) => {
        const withPlus = `+${code}${suffix}`;
        const withoutPlus = `${code}${suffix}`;
        expect(detectDialCode(withPlus)).toBe(detectDialCode(withoutPlus));
      }),
    );
  });
});
