export const AIRTIME_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {"name": "_ERC20TokenAddress", "type": "address", "internalType": "address"},
      {"name": "_treasury", "type": "address", "internalType": "address"}
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approveAndDeposit",
    "inputs": [
      {"name": "depositRef", "type": "string", "internalType": "string"},
      {"name": "amount", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [{"name": "depositId", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositWithAuthorization",
    "inputs": [
      {"name": "depositRef", "type": "string", "internalType": "string"},
      {"name": "from", "type": "address", "internalType": "address"},
      {"name": "amount", "type": "uint256", "internalType": "uint256"},
      {"name": "validAfter", "type": "uint256", "internalType": "uint256"},
      {"name": "validBefore", "type": "uint256", "internalType": "uint256"},
      {"name": "nonce", "type": "bytes32", "internalType": "bytes32"},
      {"name": "v", "type": "uint8", "internalType": "uint8"},
      {"name": "r", "type": "bytes32", "internalType": "bytes32"},
      {"name": "s", "type": "bytes32", "internalType": "bytes32"}
    ],
    "outputs": [{"name": "depositId", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {"name": "depositRef", "type": "string", "internalType": "string"},
      {"name": "amount", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [{"name": "depositId", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [
      {"name": "orderRef", "type": "string", "internalType": "string"},
      {"name": "receiver", "type": "address", "internalType": "address"},
      {"name": "amount", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [{"name": "", "type": "address", "internalType": "address"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdrawTreasury",
    "inputs": [
      {"name": "receiver", "type": "address", "internalType": "address"},
      {"name": "amount", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositCounter",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdcToken",
    "inputs": [],
    "outputs": [{"name": "", "type": "address", "internalType": "address"}],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "OrderPaid",
    "inputs": [
      {"name": "orderRef", "type": "string", "indexed": false, "internalType": "string"},
      {"name": "payer", "type": "address", "indexed": false, "internalType": "address"},
      {"name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256"}
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Refunded",
    "inputs": [
      {"name": "orderRef", "type": "string", "indexed": false, "internalType": "string"},
      {"name": "receiver", "type": "address", "indexed": false, "internalType": "address"},
      {"name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256"}
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryWithdrawal",
    "inputs": [
      {"name": "receiver", "type": "address", "indexed": false, "internalType": "address"},
      {"name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256"}
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [{"name": "token", "type": "address", "internalType": "address"}]
  }
] as const