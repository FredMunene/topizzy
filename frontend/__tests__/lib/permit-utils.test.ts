import {
  normalizeV,
  normalizeSignature,
  parseStandard65Byte,
  parseCompact64Byte,
  parseSignature,
} from '@/lib/permit-utils';

// 64 hex chars of filler for r/s components
const R = ('0x' + 'a'.repeat(64)) as `0x${string}`;
const ZERO_64 = '0'.repeat(64);
const ONES_64 = 'f'.repeat(64);

// A valid standard 65-byte (130 hex char) sig: r(64) + s(64) + v(2) with v=1b (27)
const SIG_V27 = 'a'.repeat(64) + 'b'.repeat(64) + '1b'; // 130 chars, v=0x1b=27
const SIG_V28 = 'a'.repeat(64) + 'b'.repeat(64) + '1c'; // v=0x1c=28
const SIG_V0  = 'a'.repeat(64) + 'b'.repeat(64) + '00'; // v=0 → normalised to 27
const SIG_V1  = 'a'.repeat(64) + 'b'.repeat(64) + '01'; // v=1 → normalised to 28

// ------------------------------------------------------------------
describe('normalizeV', () => {
  it('maps 0 → 27', () => expect(normalizeV(0)).toBe(27));
  it('maps 1 → 28', () => expect(normalizeV(1)).toBe(28));
  it('keeps 27 as 27', () => expect(normalizeV(27)).toBe(27));
  it('keeps 28 as 28', () => expect(normalizeV(28)).toBe(28));

  it('strips chain-ID embedding for v=0x101b (27 embedded)', () => {
    // 0x101b & 0xff = 0x1b = 27
    expect(normalizeV(0x101b)).toBe(27);
  });

  it('strips chain-ID embedding for v=0x101c (28 embedded)', () => {
    expect(normalizeV(0x101c)).toBe(28);
  });

  it('handles deeply embedded values recursively', () => {
    // 0x10000 & 0xff = 0 → normalizeV(0) → 27
    expect(normalizeV(0x10000)).toBe(27);
  });
});

// ------------------------------------------------------------------
describe('normalizeSignature', () => {
  it('strips 0x prefix', () => {
    const input = '0x' + 'a'.repeat(130);
    expect(normalizeSignature(input)).toBe('a'.repeat(130));
  });

  it('accepts input without 0x prefix', () => {
    const input = 'a'.repeat(130);
    expect(normalizeSignature(input)).toBe('a'.repeat(130));
  });

  it('throws on empty string', () => {
    expect(() => normalizeSignature('')).toThrow('Empty signature');
  });

  it('trims leading and trailing zeros', () => {
    const core = 'abc123';
    const padded = '0'.repeat(10) + core + '0'.repeat(10);
    expect(normalizeSignature(padded)).toBe(core);
  });

  it('falls back to centre-slice when trimming produces empty result', () => {
    // All-zeros string: trimming zeros gives empty → falls back to slice
    const allZeros = '0x' + '0'.repeat(200);
    // Should not throw; result may be empty string but no crash
    expect(() => normalizeSignature(allZeros)).not.toThrow();
  });
});

// ------------------------------------------------------------------
describe('parseStandard65Byte', () => {
  it('extracts s from chars 64–128', () => {
    const s = SIG_V27; // a*64 + b*64 + 1b
    const result = parseStandard65Byte(s, R);
    expect(result.s).toBe('0x' + 'b'.repeat(64));
  });

  it('extracts r as-is', () => {
    const result = parseStandard65Byte(SIG_V27, R);
    expect(result.r).toBe(R);
  });

  it('parses v=0x1b as 27', () => {
    expect(parseStandard65Byte(SIG_V27, R).v).toBe(27);
  });

  it('parses v=0x1c as 28', () => {
    expect(parseStandard65Byte(SIG_V28, R).v).toBe(28);
  });

  it('normalises v=0x00 to 27', () => {
    expect(parseStandard65Byte(SIG_V0, R).v).toBe(27);
  });

  it('normalises v=0x01 to 28', () => {
    expect(parseStandard65Byte(SIG_V1, R).v).toBe(28);
  });
});

// ------------------------------------------------------------------
describe('parseCompact64Byte', () => {
  it('extracts v=27 when high bit of vs word is 0', () => {
    // vs word where high bit (bit 255) = 0 → v = 27
    // Build a 128-char vs hex where the top bit is 0 (first nibble < 8)
    const vsLowBit = '7' + 'f'.repeat(63); // high nibble 7 → binary 0111, bit255=0
    const compact = ZERO_64 + vsLowBit; // r(64) + vs(64) = 128 chars
    const result = parseCompact64Byte(compact, R);
    expect(result.v).toBe(27);
  });

  it('extracts v=28 when high bit of vs word is 1', () => {
    // vs word where high bit (bit 255) = 1 → v = 28
    const vsHighBit = '8' + '0'.repeat(63); // high nibble 8 → binary 1000, bit255=1
    const compact = ZERO_64 + vsHighBit;
    const result = parseCompact64Byte(compact, R);
    expect(result.v).toBe(28);
  });

  it('strips the high bit from the s component', () => {
    // vs = 0x8000...0001 → v=28, s should have high bit cleared → 0x0000...0001
    const vsHighBit = '8' + '0'.repeat(62) + '1'; // bit255=1, s=1
    const compact = ZERO_64 + vsHighBit;
    const result = parseCompact64Byte(compact, R);
    expect(result.s).toBe('0x' + '0'.repeat(63) + '1');
  });

  it('returns r unchanged', () => {
    const compact = ZERO_64 + '7' + 'f'.repeat(63);
    const result = parseCompact64Byte(compact, R);
    expect(result.r).toBe(R);
  });
});

// ------------------------------------------------------------------
describe('parseSignature', () => {
  it('parses a standard 65-byte hex signature (with 0x)', () => {
    const sig = '0x' + SIG_V27;
    const result = parseSignature(sig);
    expect(result.v).toBe(27);
    expect(result.r).toBe('0x' + 'a'.repeat(64));
    expect(result.s).toBe('0x' + 'b'.repeat(64));
  });

  it('parses a standard 65-byte hex signature (without 0x)', () => {
    const result = parseSignature(SIG_V28);
    expect(result.v).toBe(28);
  });

  it('parses a compact 64-byte hex signature', () => {
    // 128 hex chars, high bit = 0 → v=27
    const compact = 'a'.repeat(64) + '7' + 'f'.repeat(63);
    const result = parseSignature(compact);
    expect(result.v).toBe(27);
    expect(result.r).toBe('0x' + 'a'.repeat(64));
  });

  it('throws on a signature that is neither 128 nor 130 chars after normalisation', () => {
    const bad = 'a'.repeat(60); // too short
    expect(() => parseSignature(bad)).toThrow(/Unexpected signature length/);
  });

  it('throws on an empty signature', () => {
    expect(() => parseSignature('')).toThrow('Empty signature');
  });
});
