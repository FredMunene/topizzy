#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load ABI
const abiPath = path.join(__dirname, 'out/Airtime.sol/Airtime.json');
const contractData = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
const abi = contractData.abi;

// ERC20 ABI for balance checking
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

async function getContractBalance(contractAddress, rpcUrl) {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(contractAddress, abi, provider);
        
        // Get USDC token address from contract
        const usdcAddress = await contract.usdcToken();
        
        // Create USDC contract instance
        const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, provider);
        
        // Get balance and token info
        const balance = await usdcContract.balanceOf(contractAddress);
        const decimals = await usdcContract.decimals();
        const symbol = await usdcContract.symbol();
        
        return {
            balance,
            decimals,
            symbol,
            formatted: ethers.formatUnits(balance, decimals)
        };
    } catch (error) {
        console.error('❌ Error getting balance:', error.message);
        throw error;
    }
}

async function withdrawTreasury(contractAddress, receiverAddress, amount, privateKey, rpcUrl) {
    try {
        // Connect to provider
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Create wallet
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // Create contract instance
        const contract = new ethers.Contract(contractAddress, abi, wallet);
        
        // Check current balance
        console.log('📊 Checking contract balance...');
        const balanceInfo = await getContractBalance(contractAddress, rpcUrl);
        console.log(`Current balance: ${balanceInfo.formatted} ${balanceInfo.symbol}`);
        
        // Convert amount to wei
        const amountWei = ethers.parseUnits(amount.toString(), balanceInfo.decimals);
        
        // Check if sufficient balance
        if (amountWei > balanceInfo.balance) {
            throw new Error(`Insufficient balance. Requested: ${amount} ${balanceInfo.symbol}, Available: ${balanceInfo.formatted} ${balanceInfo.symbol}`);
        }
        
        const remainingBalance = parseFloat(balanceInfo.formatted) - amount;
        console.log(`After withdrawal: ${remainingBalance.toFixed(6)} ${balanceInfo.symbol} will remain`);
        
        console.log(`\n💸 Withdrawing ${amount} ${balanceInfo.symbol} to ${receiverAddress}...`);
        console.log(`Contract: ${contractAddress}`);
        console.log(`Amount (wei): ${amountWei.toString()}`);
        
        // Call withdrawTreasury function
        const tx = await contract.withdrawTreasury(receiverAddress, amountWei);
        
        console.log(`\n📤 Transaction sent: ${tx.hash}`);
        console.log('⏳ Waiting for confirmation...');
        
        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        console.log(`\n✅ Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
        
        // Show new balance
        console.log('\n📊 Withdrawal completed successfully!');
        const newBalance = await getContractBalance(contractAddress, rpcUrl);
        console.log(`Remaining balance: ${newBalance.formatted} ${newBalance.symbol}`);
        console.log(`✅ Successfully transferred ${amount} ${newBalance.symbol} to ${receiverAddress}`);
        
        return receipt;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

// CLI interface
function showUsage() {
    console.log(`
Usage: node withdraw-cli.js <command> [options]

Commands:
  balance
    - Check contract balance
    
  withdraw <receiver_address> <amount> <private_key>
    - Withdraw funds from treasury

Arguments:
  receiver_address  - Wallet address to receive the funds
  amount           - Amount to withdraw (in token units, e.g., 100 for 100 USDC)
  private_key      - Private key of the treasury wallet (must be treasury owner)

Environment Variables (required in .env):
  CONTRACT_ADDRESS  - Address of the Airtime contract
  RPC_URL          - RPC endpoint URL

Examples:
  node withdraw-cli.js balance
  node withdraw-cli.js withdraw 0x5678... 100 0xabcd...
`);
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        showUsage();
        process.exit(1);
    }
    
    const command = args[0];
    
    if (command === 'balance') {
        if (args.length !== 1) {
            showUsage();
            process.exit(1);
        }
        
        const contractAddress = process.env.CONTRACT_ADDRESS;
        const rpcUrl = process.env.RPC_URL;
        
        if (!contractAddress || !rpcUrl) {
            console.error('❌ CONTRACT_ADDRESS and RPC_URL must be set in .env file');
            process.exit(1);
        }
        
        if (!ethers.isAddress(contractAddress)) {
            console.error('❌ Invalid contract address in .env');
            process.exit(1);
        }
        
        try {
            const balanceInfo = await getContractBalance(contractAddress, rpcUrl);
            console.log(`\n📊 Contract Balance`);
            console.log(`Contract: ${contractAddress}`);
            console.log(`Balance: ${balanceInfo.formatted} ${balanceInfo.symbol}`);
            console.log(`Raw balance: ${balanceInfo.balance.toString()}`);
        } catch (error) {
            process.exit(1);
        }
        
    } else if (command === 'withdraw') {
        if (args.length !== 4) {
            showUsage();
            process.exit(1);
        }
        
        const [, receiverAddress, amount, privateKey] = args;
        const contractAddress = process.env.CONTRACT_ADDRESS;
        const rpcUrl = process.env.RPC_URL;
        
        if (!contractAddress || !rpcUrl) {
            console.error('❌ CONTRACT_ADDRESS and RPC_URL must be set in .env file');
            process.exit(1);
        }
        
        // Validate inputs
        if (!ethers.isAddress(contractAddress)) {
            console.error('❌ Invalid contract address');
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
            await withdrawTreasury(contractAddress, receiverAddress, parseFloat(amount), privateKey, rpcUrl);
        } catch (error) {
            process.exit(1);
        }
        
    } else {
        console.error('❌ Unknown command:', command);
        showUsage();
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { withdrawTreasury, getContractBalance };