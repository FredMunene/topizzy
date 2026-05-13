#!/usr/bin/env bash
# Usage: ./deposit.sh <order_ref> <amount_usdc>
# Example: ./deposit.sh "ORDER-001" 1
#
# Deposits USDC into the Airtime contract.
# Requires PRIVATE_KEY (user wallet) in .env.

set -e
source "$(dirname "$0")/../../.env"

REF="${1:?Usage: ./deposit.sh <order_ref> <amount_usdc>}"
AMOUNT_USDC="${2:?Usage: ./deposit.sh <order_ref> <amount_usdc>}"

# Convert USDC amount to 6-decimal integer (e.g. 1 -> 1000000)
AMOUNT=$(cast to-unit "${AMOUNT_USDC}ether" 12 | cast --to-uint256 2>/dev/null || echo $(python3 -c "print(int(${AMOUNT_USDC} * 10**6))"))

echo "=== DEPOSIT ==="
echo "Contract : $CONTRACT_ADDRESS"
echo "Ref      : $REF"
echo "Amount   : ${AMOUNT_USDC} USDC (${AMOUNT} units)"
echo ""

# Step 1 — Approve the contract to spend USDC
echo "Step 1: Approving USDC spend..."
cast send "$USDC_SEPOLIA_TOKEN_ADDRESS" \
  "approve(address,uint256)" \
  "$CONTRACT_ADDRESS" "$AMOUNT" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY"

sleep 2

# Step 2 — Deposit
echo "Step 2: Depositing..."
cast send "$CONTRACT_ADDRESS" \
  "deposit(string,uint256)(bytes32)" \
  "$REF" "$AMOUNT" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY"

echo ""
echo "Done. Check order hash in the tx logs above."
