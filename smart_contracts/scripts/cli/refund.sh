#!/usr/bin/env bash
# Usage: ./refund.sh <order_ref> <receiver_address> <amount_usdc>
# Example: ./refund.sh "ORDER-001" 0xAbc...123 1
#
# Issues a refund for a failed order. Must be called by the OPERATOR wallet.
# Requires PRIVATE_KEY (operator wallet) in .env.

set -e
source "$(dirname "$0")/../../.env"

REF="${1:?Usage: ./refund.sh <order_ref> <receiver_address> <amount_usdc>}"
RECEIVER="${2:?Usage: ./refund.sh <order_ref> <receiver_address> <amount_usdc>}"
AMOUNT_USDC="${3:?Usage: ./refund.sh <order_ref> <receiver_address> <amount_usdc>}"

AMOUNT=$(python3 -c "print(int(${AMOUNT_USDC} * 10**6))")

echo "=== REFUND ==="
echo "Contract : $CONTRACT_ADDRESS"
echo "Ref      : $REF"
echo "Receiver : $RECEIVER"
echo "Amount   : ${AMOUNT_USDC} USDC (${AMOUNT} units)"
echo ""

cast send "$CONTRACT_ADDRESS" \
  "refund(string,address,uint256)" \
  "$REF" "$RECEIVER" "$AMOUNT" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$OPERATOR_PRIVATE_KEY"

echo ""
echo "Refund sent."
