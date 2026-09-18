import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
};

// next/jest appends its own transformIgnorePatterns entries rather than
// letting ours replace them, and Jest's ignore check is OR-across-the-array
// — so its broad "/node_modules/(?!...)" default still matches wagmi's ESM
// build even if we also list a pattern that allows it. Post-process the
// generated config to fully replace the array instead: wagmi's root export
// (plus some of its own deps, and onchainkit/farcaster) ship ESM-only builds
// with no CJS fallback, so they need to be transformed rather than skipped.
async function finalConfig() {
  const generated = await createJestConfig(config)();
  return {
    ...generated,
    transformIgnorePatterns: [
      '/node_modules/(?!(?:wagmi|@wagmi|@coinbase/onchainkit|@farcaster)/)',
    ],
  };
}

export default finalConfig;
