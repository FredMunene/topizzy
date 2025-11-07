# ADR 2025-11-05: Adopt Permit2 + ERC-4337 Flow for Airtime Payments

## Status
Accepted – in implementation (Base Sepolia rollout first).

## Context
- Current USDC payment flow relies on the classic `approve` then `deposit` pattern. That creates two wallet pop-ups and fails for Base Smart Wallet (AA) users because the wallet cannot sign legacy ECDSA `permit()` messages.
- We want a single confirmation, smart-wallet-compatible flow that still supports gas sponsorship (Base paymaster credits) and preserves our refund logic in `smart_contracts/src/Airtime.sol`.
- Coinbase CDP provides a Base Sepolia paymaster/bundler endpoint (`BASE_SEPOLIA_PAYMASTER_RPC` in `frontend/.env`) that we can use for testing sponsored user operations.
- Uniswap Permit2 is deployed on Base (0x000...BA3) and validates signatures through ERC-1271, making it compatible with contract wallets.

## Decision
Implement the airtime payment flow using Permit2-authorized transfers wrapped in an ERC-4337 user operation:
1. Extend `Airtime.sol` with a `depositWithPermit2` entry point that consumes `PermitTransferFrom` signatures and emits `OrderPaid`.
2. Update backend/frontend to request Permit2 signatures, batch Permit2 + deposit calls inside a single user operation, and send them via OnchainKit/AA tooling with Coinbase’s paymaster sponsoring gas.
3. Roll out on Base Sepolia first, using the new `BASE_SEPOLIA_PAYMASTER_RPC` endpoint, before promoting to Base mainnet.

## Consequences
- **Positive**
  - Single confirmation UX across EOAs and smart wallets.
  - Enables gasless transactions using Base paymaster credits.
  - Maintains on-chain audit trail and contract-side refund logic.
- **Negative**
  - Additional complexity: new contract method, Permit2 dependency, and ERC-4337 integration.
  - Paymaster quotas introduce rollout risk; we need monitoring and fallback to user-paid gas.
  - Requires Supabase schema updates (store Permit2 nonce/deadline) and new tests.

## Alternatives Considered
- **Keep legacy approve + transfer** – rejected due to smart wallet incompatibility and double pop-ups.
- **Backend relayer submitting standard tx** – reduces client work but shifts trust to the server and still needs Permit2 for ERC-1271; chosen approach keeps users in control.
- **Native USDC `permit()`** – fails for Base smart wallets because USDC verifies with `ecrecover`.

## References
- Airtime payment plan: `docs/airtime-payments-plan.md`
- Base AA & Paymaster docs: https://docs.base.org/assets/paymasters
- OnchainKit gasless guide: https://docs.base.org/builderkits/onchainkit/features/gasless
- Uniswap Permit2 spec: https://docs.uniswap.org/contracts/permit2/overview
- Base Smart Wallet overview: https://docs.base.org/base-smart-wallet/overview
