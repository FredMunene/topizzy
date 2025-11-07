# Implementing EIP-3009: transferWithAuthorization

## 📚 References
- [EIP-3009 spec – Transfer With Authorization](https://eipsinsight.com/eips/eip-3009)
- [Gasless tx/ Transfer with Authorization – ERC20 (Venly)](https://docs.venly.io/docs/gasless-tx-transfer-with-authorization-erc20)
- [A Practical Guide to Meta-transactions and Atomic Interactions](https://afrodev.space/meta-transactions-and-atomic-interactions)

---

## 🧑‍💻 Implementation Guide

### 1. Smart Contract Side
If you’re using a token like USDC (which implements EIP‑3009), you don’t need to write `transferWithAuthorization` yourself.  
You only need to handle deposits in your own contract.

```solidity
event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

function transferWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

Example contract using USDC:

```solidity
IERC20 public immutable usdc;

mapping(address => uint256) public balances;

constructor(address _usdc) {
    usdc = IERC20(_usdc);
}

function depositViaAuthorization(
    address from,
    uint256 amount,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
) external {
    ITransferWithAuthorization(address(usdc)).transferWithAuthorization(
        from,
        address(this),
        amount,
        validAfter,
        validBefore,
        nonce,
        v, r, s
    );

    balances[from] += amount;
    emit Deposit(from, amount);
}
```

### 2. Frontend / User Signing Flow

The user signs an EIP‑712 message off-chain representing the transfer authorization.

```json
{
  "types": {
    "EIP712Domain": [
      {"name":"name","type":"string"},
      {"name":"version","type":"string"},
      {"name":"chainId","type":"uint256"},
      {"name":"verifyingContract","type":"address"}
    ],
    "TransferWithAuthorization": [
      {"name":"from","type":"address"},
      {"name":"to","type":"address"},
      {"name":"value","type":"uint256"},
      {"name":"validAfter","type":"uint256"},
      {"name":"validBefore","type":"uint256"},
      {"name":"nonce","type":"bytes32"}
    ]
  },
  "primaryType": "TransferWithAuthorization",
  "domain": {
    "name": "USD Coin",
    "version": "2",
    "chainId": 8453,
    "verifyingContract": "0xUSDC_CONTRACT_ADDRESS"
  },
  "message": {
    "from": "0xUSER_ADDRESS",
    "to": "0xYOUR_CONTRACT_ADDRESS",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "1699500000",
    "nonce": "0xSOME_RANDOM_BYTES32"
  }
}
```

The user signs once, and you collect `v`, `r`, `s`.

### 3. Relayer / Transaction Submission

Your backend or facilitator submits the signed message to the blockchain:

```js
const token = new ethers.Contract(USDC_ADDRESS, tokenAbi, relayerSigner);
const tx = await token.transferWithAuthorization(
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonce,
  v, r, s,
  { gasLimit: 100000 }
);
await tx.wait();
```

### 4. Integrating With App Logic

- Once the deposit is complete, update internal balances or grant access.
- For refunds or withdrawals, call `usdc.safeTransfer(user, amount)`.
- Handle nonces and expirations properly.

### 5. Security & Best Practices

- Verify the token supports EIP‑3009 (`transferWithAuthorization`).
- Use random nonces and expiry times.
- Validate the sender, recipient, and value on the backend.
- Audit all contracts and relayers handling user signatures.

---

## 🎯 Summary

- EIP‑3009 enables **one‑signature, gasless USDC transfers**.
- **Frontend:** user signs an EIP‑712 message.
- **Backend:** relayer calls `transferWithAuthorization`.
- **Smart contract:** receives tokens and updates logic.
- Ideal for apps offering gasless deposits or subscriptions.

---
