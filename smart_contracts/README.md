# Smart Contracts

This folder contains the smart contracts for the Airtime project.

## Contracts

-   **Airtime.sol**: This contract allows users to deposit USDC using a permit and implements refund and withdraw logic.

## Deployment

To deploy the contracts, use the following command:

```
forge script script/Deploy.s.sol --rpc-url $BASE_GOERLI_RPC_URL --private-key $PRIVATE_KEY -vvv
```

Replace `$BASE_GOERLI_RPC_URL` with your Base Goerli RPC URL and `$PRIVATE_KEY` with your private key.
