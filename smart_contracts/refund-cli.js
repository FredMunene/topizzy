#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load ABI
const abiPath = path.join(__dirname, 'out/Airtime.sol/Airtime.json');
const contractData = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
const abi = contractData.abi;

async function refund(contractAddress, orderRef, receiverAddress, amount, privateKey, rpcUrl) {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(contractAddress, abi, wallet);
        
        // Convert amount to wei (6 decimals for USDC)
        const amountWei = ethers.parseUnits(amount.toString(), 6);
        
        console.log(`💰 Processing refund...`);
        console.log(`Order: ${orderRef}`);
        console.log(`Receiver: ${receiverAddress}`);
        console.log(`Amount: ${amount} USDC`);
        
        const tx = await contract.refund(orderRef, receiverAddress, amountWei);
        
        console.log(`📤 Transaction sent: ${tx.hash}`);
        console.log('⏳ Waiting for confirmation...');
        
        const receipt = await tx.wait();
        
        console.log(`✅ Refund completed in block ${receipt.blockNumber}`);
        console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
        
        return receipt;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

function showUsage() {
    console.log(`
Usage: node refund-cli.js <order_ref> <receiver_address> <amount> <private_key>

Arguments:
  order_ref        - Order reference string
  receiver_address - Address to receive the refund
  amount          - Amount to refund (in USDC)
  private_key     - Treasury private key

Environment Variables (required in .env):
  CONTRACT_ADDRESS - Address of the Airtime contract
  RPC_URL         - RPC endpoint URL

Example:
  node refund-cli.js "ORDER123" 0x5678... 50 0xabcd...
`);
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length !== 4) {
        showUsage();
        process.exit(1);
    }
    
    const [orderRef, receiverAddress, amount, privateKey] = args;
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const rpcUrl = process.env.RPC_URL;
    
    if (!contractAddress || !rpcUrl) {
        console.error('❌ CONTRACT_ADDRESS and RPC_URL must be set in .env file');
        process.exit(1);
    }
    
    if (!ethers.isAddress(receiverAddress)) {
        console.error('❌ Invalid receiver address');
        process.exit(1);
    }
    
    if (isNaN(amount) || parseFloat(amount) <= 0) {
        console.error('❌ Invalid amount');
        process.exit(1);
    }
    
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        console.error('❌ Invalid private key format');
        process.exit(1);
    }
    
    try {
        await refund(contractAddress, orderRef, receiverAddress, parseFloat(amount), privateKey, rpcUrl);
    } catch (error) {
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { refund };