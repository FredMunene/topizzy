#!/usr/bin/env node

/**
 * Permit2 permit payload generator.
 *
 * Creates a JSON file compatible with `airtime-contract.js deposit-permit2`.
 *
 * Example:
 *   node test_scripts/generate-permit.js --amount 10.5 --out permit.json
 *
 * Options:
 *   --amount <number>       USDC amount (required)
 *   --token <address>       Override token address (defaults to env USDC_TOKEN_ADDRESS)
 *   --nonce <uint256>       Override nonce (defaults to random 128-bit integer)
 *   --deadline <timestamp>  Unix timestamp seconds (defaults to now + valid-for)
 *   --valid-for <seconds>   TTL in seconds (default 900) used when deadline not provided
 *   --decimals <number>     Token decimals (default 6)
 *   --out <path>            Output file (default permit.json)
 */

import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { parseUnits } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf-8');
  contents.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) return;
    const key = trimmed.slice(0, equalsIndex).trim();
    const valueRaw = trimmed.slice(equalsIndex + 1).trim();
    const value = valueRaw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function parseArgs(argv) {
  const result = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        result[key] = 'true';
        i += 1;
      } else {
        result[key] = next;
        i += 2;
      }
    } else {
      result._.push(arg);
      i += 1;
    }
  }
  return result;
}

function toBigIntDecimal(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.floor(value));
  if (value.startsWith('0x') || value.startsWith('0X')) {
    return BigInt(value);
  }
  return BigInt(value);
}

function randomNonce(bits = 128) {
  const bytes = Math.ceil(bits / 8);
  return BigInt('0x' + randomBytes(bytes).toString('hex'));
}

async function main() {
  const envPath = path.resolve(__dirname, '.env');
  loadEnvFromFile(envPath);

  const args = parseArgs(process.argv.slice(2));
  const amountStr = args.amount;

  if (!amountStr) {
    console.error('Missing required --amount argument (e.g., --amount 10.5)');
    process.exit(1);
  }

  const decimals = args.decimals ? Number(args.decimals) : Number(process.env.USDC_DECIMALS || 6);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    console.error('Invalid decimals value. Provide an integer between 0 and 36.');
    process.exit(1);
  }

  let tokenAddress = args.token || process.env.USDC_TOKEN_ADDRESS;
  if (!tokenAddress) {
    console.error('Token address not provided. Use --token or set USDC_TOKEN_ADDRESS in .env.');
    process.exit(1);
  }
  if (!tokenAddress.startsWith('0x')) tokenAddress = `0x${tokenAddress}`;

  let amount;
  try {
    amount = parseUnits(amountStr, decimals);
  } catch (error) {
    console.error('Failed to parse amount:', error);
    process.exit(1);
  }

  let nonce;
  if (args.nonce) {
    try {
      nonce = toBigIntDecimal(args.nonce);
    } catch (error) {
      console.error('Invalid nonce value:', error);
      process.exit(1);
    }
  } else {
    nonce = randomNonce();
  }

  let deadline;
  if (args.deadline) {
    try {
      deadline = toBigIntDecimal(args.deadline);
    } catch (error) {
      console.error('Invalid deadline value:', error);
      process.exit(1);
    }
  } else {
    const validFor = args['valid-for'] ? Number(args['valid-for']) : 900;
    if (!Number.isFinite(validFor) || validFor <= 0) {
      console.error('valid-for must be a positive number of seconds.');
      process.exit(1);
    }
    deadline = BigInt(Math.floor(Date.now() / 1000) + Math.floor(validFor));
  }

  const permit = {
    permitted: {
      token: tokenAddress,
      amount: amount.toString()
    },
    nonce: nonce.toString(),
    deadline: deadline.toString()
  };

  const outputPath = path.resolve(process.cwd(), args.out || 'permit.json');
  fs.writeFileSync(outputPath, JSON.stringify(permit, null, 2));

  console.log('Permit2 payload written to:', outputPath);
  console.log(JSON.stringify(permit, null, 2));
  console.log('\nNext steps:');
  console.log('  1. Obtain a signature for this permit using your wallet / signer.');
  console.log('  2. Run: node test_scripts/airtime-contract.js deposit-permit2 --ref <ORDER_REF> --permit', outputPath, '--signature 0x...');
}

main().catch(error => {
  console.error('Permit generator error:', error);
  process.exit(1);
});
