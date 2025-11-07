# Airtime Payment Flow Upgrade Plan

## Goal
Move from a two-step approval + transfer flow to a single, smart-wallet-friendly transaction that still allows gas sponsorship on Base.

---

## Prerequisites / Developer Inputs
- Base project access with Coinbase CDP Paymaster (gas sponsorship) credentials.
- OnchainKit client set up with API key (already used in the repo).
- Knowledge of current Supabase tables (`orders`, `airtime_transactions`).
- Ability to deploy and test Solidity contracts via Foundry on Base Sepolia.
- Permit2 contract address on Base (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) verified.
- EOA or smart-wallet test accounts on Base Sepolia (Coinbase Smart Wallet + MetaMask) with USDC test tokens.

---

## Step-by-Step Implementation Plan

1. **Contract Enhancements**
   - Add `depositWithPermit2` to `smart_contracts/src/Airtime.sol`:
     - Accept `PermitTransferFrom` struct + signature per Uniswap Permit2 spec.
     - Call `IAllowanceTransfer.permitTransferFrom` to pull USDC and emit `OrderPaid`.
   - Write Forge tests covering EOA and ERC-1271 (simulated) signatures.
   - Deploy upgraded contract to Base Sepolia; update `.env` and ABI.

2. **Backend Updates**
   - Create a signer validation layer in `/api/airtime/send` to accept `permit2` payloads and verify order ownership.
   - Store Permit2 nonce + deadline with `orders` for replay protection.
   - Add feature flag to fall back to legacy flow until fully cut over.

3. **Frontend (Permit2 + UserOps)**
   - Build Permit2 signing helper in `frontend/lib/`:
     - Fetch nonce, set expiry, call `walletClient.signTypedData`.
   - Replace current `approveAndDeposit` call in `app/page.tsx` with a single `sendUserOperation` using OnchainKit’s AA helpers:
     - Batch call Permit2 + new deposit method.
     - Pass Coinbase gasless sponsorship config.
   - Provide fallback path for wallets without AA support (MetaMask) using the same Permit2 + `sendTransactions` batch.

4. **Testing / Rollout**
   - Run Forge tests and integration tests on Base Sepolia (both wallet types).
   - Validate gasless execution via CDP dashboard; monitor sponsored userOps.
   - Update product docs and run a staged rollout toggling the feature flag.

---

## Reference Sources
- Base AA & Paymaster docs: https://docs.base.org/assets/paymasters
- Coinbase OnchainKit + gasless userOps: https://docs.base.org/builderkits/onchainkit/features/gasless
- Uniswap Permit2 specification: https://docs.uniswap.org/contracts/permit2/overview
- ERC-4337 & Coinbase Smart Wallet behavior: https://docs.base.org/base-smart-wallet/overview

---

## Trade-offs
- **Permit2 Integration:** Extra contract code + dependency but brings ERC-1271 compatibility out of the box.
- **Gas Sponsorship Limits:** Base’s paymaster grants have caps; need monitoring and fallback to user-paid mode.
- **Complexity vs UX:** ERC-4337 batching and sponsorship add implementation complexity yet deliver single-pop-up UX.
- **Backend Relay vs Client AA:** Server-side relayers simplify client logic but introduce custody of signatures; pure client AA keeps users in control but relies on wallet AA features.

