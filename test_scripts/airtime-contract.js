#!/usr/bin/env node

/**
 * Helper script to exercise the Airtime smart contract on Base Sepolia.
 *
 * Usage:
 *   node test_scripts/airtime-contract.js summary
 *   node test_scripts/airtime-contract.js deposit --ref REF123 --amount 10.5
 *   node test_scripts/airtime-contract.js deposit-permit2 --ref REF123 --permit permit.json --signature 0x...
 *   node test_scripts/airtime-contract.js refund --ref REF123 --receiver 0x... --amount 5
 *
 * Environment variables can be defined in test_scripts/.env or exported directly.
 */

import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
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

function loadDeploymentMetadata(filePath) {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to load deployment metadata from ${filePath}:`, error);
    return undefined;
  }
}

const ENV_PATH = path.resolve(__dirname, '.env');
loadEnvFromFile(ENV_PATH);

const DEPLOYMENT_PATH = path.resolve(__dirname, 'deployment.json');
const deploymentMetadata = loadDeploymentMetadata(DEPLOYMENT_PATH);

const AIRTIME_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'depositRef', type: 'string' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: 'depositId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'depositWithPermit2',
    inputs: [
      { name: 'depositRef', type: 'string' },
      {
        name: 'permit',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ]
          },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      { name: 'signature', type: 'bytes' }
    ],
    outputs: [{ name: 'depositId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'refund',
    inputs: [
      { name: 'orderRef', type: 'string' },
      { name: 'receiver', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'withdrawTreasury',
    inputs: [
      { name: 'receiver', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'depositCounter',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'treasury',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'usdcToken',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'permit2',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
];

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

function getEnv(name, required = true) {
  const value = process.env[name];
  if (required && (!value || value.length === 0)) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

function normalizePrivateKey(key) {
  return key.startsWith('0x') ? key : `0x${key}`;
}

function toWei(amount) {
  return parseUnits(amount, 6);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command] = args._;

  if (!command || command === 'help') {
    console.log('Usage: node test_scripts/airtime-contract.js <command> [--options]');
    console.log('Commands: summary | deposit | deposit-permit2 | refund | withdraw');
    process.exit(0);
  }

  const rpcUrl = getEnv('RPC_URL', false) || deploymentMetadata?.rpcUrl || 'https://sepolia.base.org';
  const contractAddressEnv = getEnv('AIRTIME_CONTRACT_ADDRESS', false);
  const contractAddress = contractAddressEnv || deploymentMetadata?.contractAddress;
  if (!contractAddress) {
    console.error('Missing AIRTIME_CONTRACT_ADDRESS. Set it in env or ensure deployment.json exists.');
    process.exit(1);
  }
  process.env.AIRTIME_CONTRACT_ADDRESS = contractAddress;

  const privateKey = normalizePrivateKey(getEnv('WALLET_PRIVATE_KEY'));

  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl)
  });

  const walletClient = createWalletClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
    account
  });

  if (command === 'summary') {
    const [treasury, usdc, permit2Addr, deposits] = await Promise.all([
      publicClient.readContract({ address: contractAddress, abi: AIRTIME_ABI, functionName: 'treasury' }),
      publicClient.readContract({ address: contractAddress, abi: AIRTIME_ABI, functionName: 'usdcToken' }),
      publicClient.readContract({ address: contractAddress, abi: AIRTIME_ABI, functionName: 'permit2' }),
      publicClient.readContract({ address: contractAddress, abi: AIRTIME_ABI, functionName: 'depositCounter' })
    ]);

    console.log('Airtime Contract Summary');
    console.log('------------------------');
    console.log('Contract:', contractAddress);
    console.log('RPC URL :', rpcUrl);
    console.log('Treasury:', treasury);
    console.log('USDC Token:', usdc);
    console.log('Permit2:', permit2Addr);
    console.log('Deposit Counter:', deposits.toString());
    if (deploymentMetadata) {
      console.log('Deployer:', deploymentMetadata.deployer);
      console.log('Deployment Tx:', deploymentMetadata.txHash);
      console.log('Deployed At:', deploymentMetadata.timestamp);
    }
    return;
  }

  if (command === 'deposit') {
    const depositRef = args.ref || args.reference;
    const amountStr = args.amount;
    if (!depositRef || !amountStr) {
      console.error('deposit requires --ref and --amount');
      process.exit(1);
    }
    const amount = toWei(amountStr);
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: AIRTIME_ABI,
      functionName: 'deposit',
      args: [depositRef, amount]
    });
    console.log('Deposit tx sent:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Status:', receipt.status);
    return;
  }

  if (command === 'deposit-permit2') {
    const depositRef = args.ref || args.reference;
    const permitPath = args.permit;
    const signature = args.signature;
    if (!depositRef || !permitPath || !signature) {
      console.error('deposit-permit2 requires --ref, --permit <file>, --signature 0x...');
      process.exit(1);
    }
    const permitJson = fs.readFileSync(permitPath, 'utf-8');
    const permitData = JSON.parse(permitJson);

    const permit = {
      permitted: {
        token: permitData.permitted.token,
        amount: BigInt(permitData.permitted.amount)
      },
      nonce: BigInt(permitData.nonce),
      deadline: BigInt(permitData.deadline)
    };

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: AIRTIME_ABI,
      functionName: 'depositWithPermit2',
      args: [depositRef, permit, signature]
    });
    console.log('Permit2 deposit tx:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Status:', receipt.status);
    return;
  }

  if (command === 'refund') {
    const orderRef = args.ref;
    const receiver = args.receiver;
    const amountStr = args.amount;
    if (!orderRef || !receiver || !amountStr) {
      console.error('refund requires --ref, --receiver, --amount');
      process.exit(1);
    }
    const amount = toWei(amountStr);
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: AIRTIME_ABI,
      functionName: 'refund',
      args: [orderRef, receiver, amount]
    });
    console.log('Refund tx sent:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Status:', receipt.status);
    return;
  }

  if (command === 'withdraw') {
    const receiver = args.receiver;
    const amountStr = args.amount;
    if (!receiver || !amountStr) {
      console.error('withdraw requires --receiver and --amount');
      process.exit(1);
    }
    const amount = toWei(amountStr);
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: AIRTIME_ABI,
      functionName: 'withdrawTreasury',
      args: [receiver, amount]
    });
    console.log('Withdrawal tx:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Status:', receipt.status);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});
