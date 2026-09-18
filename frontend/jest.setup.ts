import '@testing-library/jest-dom';

// jsdom doesn't provide TextEncoder/TextDecoder, but viem (pulled in
// transitively by wagmi) needs them at import time. Only relevant for
// @jest-environment jsdom test files; harmless no-op under node.
if (typeof globalThis.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
