#!/usr/bin/env node

/**
 * Deployment helper for the Airtime contract (JavaScript edition).
 *
 * Required env vars:
 *   RPC_URL (optional, defaults to https://sepolia.base.org)
 *   WALLET_PRIVATE_KEY
 *   USDC_TOKEN_ADDRESS
 *   TREASURY_ADDRESS
 *   PERMIT2_ADDRESS
 *
 * Example:
 *   node test_scripts/deploy-airtime.js
 */

import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
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

function requireEnv(name) {
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

async function main() {
  const envPath = path.resolve(__dirname, '.env');
  loadEnvFromFile(envPath);

  const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
  const privateKey = normalizeHex(requireEnv('WALLET_PRIVATE_KEY'));
  const usdcAddress = normalizeHex(requireEnv('USDC_TOKEN_ADDRESS'));
  const treasuryAddress = normalizeHex(requireEnv('TREASURY_ADDRESS'));
  const permit2Address = normalizeHex(requireEnv('PERMIT2_ADDRESS'));

  const artifactPath = path.resolve(__dirname, '../smart_contracts/out/Airtime.sol/Airtime.json');
  if (!fs.existsSync(artifactPath)) {
    console.error(`Contract artifact not found at ${artifactPath}. Run "cd smart_contracts && forge build" first.`);
    process.exit(1);
  }

  const artifactRaw = fs.readFileSync(artifactPath, 'utf-8');
  const artifact = JSON.parse(artifactRaw);

  const abi = artifact.abi;
  const bytecode = artifact.bytecode.object;

  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl)
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl)
  });

  console.log('Deploying Airtime contract with parameters:');
  console.log('  USDC Token:', usdcAddress);
  console.log('  Treasury  :', treasuryAddress);
  console.log('  Permit2   :', permit2Address);
  console.log('  Deployer  :', account.address);

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    account,
    args: [usdcAddress, treasuryAddress, permit2Address]
  });

  console.log('Deployment transaction hash:', hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    console.error('Deployment failed: contract address missing in receipt.');
    process.exit(1);
  }

  console.log('Airtime contract deployed at:', receipt.contractAddress);
  console.log('Block number:', receipt.blockNumber);

  const deployment = {
    network: 'base-sepolia',
    chainId: baseSepolia.id,
    rpcUrl,
    contractAddress: receipt.contractAddress,
    txHash: hash,
    deployer: account.address,
    blockNumber: receipt.blockNumber.toString(),
    timestamp: new Date().toISOString(),
    parameters: {
      usdcTokenAddress: usdcAddress,
      treasuryAddress,
      permit2Address
    }
  };

  const deploymentPath = path.resolve(__dirname, 'deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log('Saved deployment metadata to:', deploymentPath);
}

main().catch(error => {
  console.error('Deployment script error:', error);
  process.exit(1);
});
