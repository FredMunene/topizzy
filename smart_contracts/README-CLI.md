# Airtime Contract CLI

A command-line interface for interacting with the Airtime smart contract treasury functions.

## Installation

```bash
npm install
```

## Setup

Create a `.env` file with your contract address:

```bash
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
RPC_URL=https:/base_sepolia
```

## Usage

### Check Contract Balance

```bash
node withdraw-cli.js balance
```

### Withdraw Funds

```bash
node withdraw-cli.js withdraw <receiver_address> <amount> <private_key>
```

### Process Refunds

```bash
node refund-cli.js <order_ref> <receiver_address> <amount> <private_key>
```

**Examples:**
```bash
node withdraw-cli.js withdraw 0x9876543210987654321098765432109876543210 100 0xabcdef...
node refund-cli.js "ORDER123" 0x9876543210987654321098765432109876543210 50 0xabcdef...
```

## Parameters

- `receiver_address`: Wallet address that will receive the funds
- `amount`: Amount in USDC (e.g., 100 for 100 USDC)
- `private_key`: Private key of the treasury owner wallet
- `order_ref`: Order reference string for refunds

## Environment Variables

- `CONTRACT_ADDRESS`: The deployed Airtime contract address
- `RPC_URL`: Blockchain RPC endpoint URL

## Features

- ✅ Check contract balance
- ✅ Withdraw treasury funds
- ✅ Process customer refunds
- ✅ Transaction confirmation
- ✅ Gas usage display
- ✅ Input validation

## Security Notes

⚠️ **Important Security Considerations:**

1. **Private Key Safety**: Never share your private key or commit it to version control
2. **Treasury Permissions**: Only the treasury owner can withdraw funds
3. **Amount Validation**: The CLI checks for sufficient balance before attempting withdrawal
4. **Network Verification**: Always verify you're using the correct RPC URL for your target network

## Example Workflow

1. **Check Balance First:**
   ```bash
   node withdraw-cli.js balance
   ```

2. **Withdraw Funds:**
   ```bash
   node withdraw-cli.js withdraw 0x5678... 50 0xabcd...
   ```

3. **Process Refund:**
   ```bash
   node refund-cli.js "ORDER123" 0x5678... 25 0xabcd...
   ```

4. **Verify New Balance:**
   ```bash
   node withdraw-cli.js balance
   ```

## Error Handling

The CLI provides clear error messages for common issues:
- Invalid addresses
- Insufficient balance
- Invalid private key format
- Network connection issues
- Transaction failures

## Dependencies

- `ethers`: ^6.8.0 - Ethereum library for blockchain interactions