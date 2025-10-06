export const AIRTIME_ABI = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositWithPermit",
    "inputs": [
      {"name": "token", "type": "address", "internalType": "address"},
      {"name": "amount", "type": "uint256", "internalType": "uint256"},
      {"name": "deadline", "type": "uint256", "internalType": "uint256"},
      {"name": "v", "type": "uint8", "internalType": "uint8"},
      {"name": "r", "type": "bytes32", "internalType": "bytes32"},
      {"name": "s", "type": "bytes32", "internalType": "bytes32"}
    ],
    "outputs": [{"name": "depositId", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [{"name": "orderRef", "type": "string", "internalType": "string"}],
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
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
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
  }
] as const