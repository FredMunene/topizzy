/**
 * Pure helpers for EIP-2612 permit signature parsing.
 * Extracted so they can be unit tested independently of the wallet/viem stack.
 */

export function normalizeV(v: number): number {
  if (v === 0) return 27;
  if (v === 1) return 28;
  if (v >= 27 && v <= 28) return v;
  // Handle chain-ID-embedded v or other wallet variants
  if (v > 28) return normalizeV(v & 0xff);
  return v;
}

export function normalizeSignature(sig: string): string {
  if (!sig) throw new Error('Empty signature');
  let s = sig.startsWith('0x') ? sig.slice(2) : sig;
  s = s.replace(/^0+/, '').replace(/0+$/, '');

  if (!s || s.length === 0) {
    const orig = sig.startsWith('0x') ? sig.slice(2) : sig;
    const start = Math.floor((orig.length - 130) / 2);
    s = orig.slice(start, start + 130).replace(/^0+/, '');
  }

  return s;
}

export function parseStandard65Byte(
  s: string,
  r: `0x${string}`,
): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const sValue = ('0x' + s.slice(64, 128)) as `0x${string}`;
  const vHex = s.slice(128, 130) || s.slice(-2);
  const v = normalizeV(Number.parseInt(vHex, 16));
  return { v, r, s: sValue };
}

export function parseCompact64Byte(
  s: string,
  r: `0x${string}`,
): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const vsHex = s.slice(64, 128);
  const vsBig = BigInt('0x' + vsHex);
  const v = ((vsBig >> 255n) & 1n) === 0n ? 27 : 28;
  const sBig = vsBig & ((1n << 255n) - 1n);
  const sHex = sBig.toString(16).padStart(64, '0');
  const sValue = ('0x' + sHex) as `0x${string}`;
  return { v, r, s: sValue };
}

export function parseSignature(sig: string): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const s = normalizeSignature(sig);

  if (!s || s.length === 0) {
    throw new Error(`Invalid signature format. Raw: ${sig}`);
  }

  if (s.length !== 130 && s.length !== 128) {
    throw new Error(`Unexpected signature length after processing: ${s.length} (raw: ${sig})`);
  }

  const r = ('0x' + s.slice(0, 64)) as `0x${string}`;
  return s.length === 130
    ? parseStandard65Byte(s, r)
    : parseCompact64Byte(s, r);
}
