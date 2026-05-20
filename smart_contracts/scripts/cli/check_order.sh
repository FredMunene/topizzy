#!/usr/bin/env bash
# Usage: ./check_order.sh <order_ref> <payer_address>
# Example: ./check_order.sh "ORDER-001" 0xAbc...123
#
# Reads the on-chain OrderRecord for a given (ref, payer) pair.

set -e
source "$(dirname "$0")/../../.env"

REF="${1:?Usage: ./check_order.sh <order_ref> <payer_address>}"
PAYER="${2:?Usage: ./check_order.sh <order_ref> <payer_address>}"

ORDER_HASH=$(cast keccak "$(cast abi-encode 'f(string,address)' "$REF" "$PAYER")")

echo "=== ORDER LOOKUP ==="
echo "Ref        : $REF"
echo "Payer      : $PAYER"
echo "Order hash : $ORDER_HASH"
echo ""

RESULT=$(cast call "$CONTRACT_ADDRESS" \
  "orders(bytes32)(address,uint256,bool)" \
  "$ORDER_HASH" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL")

echo "Payer    : $(echo "$RESULT" | sed -n '1p')"
echo "Amount   : $(echo "$RESULT" | sed -n '2p') units"
echo "Settled  : $(echo "$RESULT" | sed -n '3p')"
