#!/usr/bin/env node

/**
 * Permit2 signature helper.
 *
 * Usage:
 *   node test_scripts/sign-permit.js --permit permit.json [--out signature.txt]
 *
 * Requirements:
 *   - `test_scripts/.env` (or exported env vars) providing:
 *       WALLET_PRIVATE_KEY, RPC_URL (optional), PERMIT2_ADDRESS, AIRTIME_CONTRACT_ADDRESS
 *   - permit JSON produced by generate-permit.js or equivalent.
 */

import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

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

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

function normalizeHex(value) {
  return value.startsWith('0x') ? value : `0x${value}`;
}

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.floor(value));
  return BigInt(value);
}

async function main() {
  const envPath = path.resolve(__dirname, '.env');
  loadEnvFromFile(envPath);

  const args = parseArgs(process.argv.slice(2));
  const permitPath = args.permit || args.file;
  if (!permitPath) {
    console.error('Usage: node test_scripts/sign-permit.js --permit permit.json [--out signature.txt]');
    process.exit(1);
  }

  const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
  const permit2Address = normalizeHex(getRequiredEnv('PERMIT2_ADDRESS'));
  const spenderAddress = normalizeHex(process.env.AIRTIME_CONTRACT_ADDRESS || getRequiredEnv('AIRTIME_CONTRACT_ADDRESS'));

  const privateKeyValue = getRequiredEnv('WALLET_PRIVATE_KEY');
  const privateKey = normalizeHex(privateKeyValue);
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl)
  });

  const permitRaw = fs.readFileSync(path.resolve(process.cwd(), permitPath), 'utf-8');
  const permit = JSON.parse(permitRaw);

  if (!permit?.permitted?.token || !permit?.permitted?.amount || !permit?.nonce || !permit?.deadline) {
    console.error('Invalid permit JSON. Expected keys: permitted.token, permitted.amount, nonce, deadline.');
    process.exit(1);
  }

  const domain = {
    name: 'Permit2',
    version: '1',
    chainId: baseSepolia.id,
    verifyingContract: permit2Address
  };

  const types = {
    PermitTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ]
  };

  const message = {
    permitted: {
      token: normalizeHex(permit.permitted.token),
      amount: toBigInt(permit.permitted.amount)
    },
    spender: spenderAddress,
    nonce: toBigInt(permit.nonce),
    deadline: toBigInt(permit.deadline)
  };

  console.log('Signing Permit2 payload with account:', account.address);
  console.log('Permit2 contract:', permit2Address);
  console.log('Spender (Airtime):', spenderAddress);

  const signature = await walletClient.signTypedData({
    domain,
    types,
    primaryType: 'PermitTransferFrom',
    message
  });

  console.log('\nSignature:', signature);

  if (args.out && args.out !== 'true') {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(outPath, signature);
    console.log('Signature written to:', outPath);
  }

  console.log('\nNext steps:');
  console.log('  node test_scripts/airtime-contract.js deposit-permit2 --ref <ORDER_REF> --permit', permitPath, '--signature', signature);
}

main().catch(error => {
  console.error('Permit signing error:', error);
  process.exit(1);
});
