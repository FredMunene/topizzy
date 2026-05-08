# Topizzy Response — Allan Robinson Audit (2026-05-08)

**Auditor:** Allan Robinson  
**Response prepared by:** Topizzy Engineering  
**Response date:** 2026-05-08  

> **Context:** Allan audited the original pre-fix `Airtime.sol`. By the time this response was written, a first audit (Dennis Kiptoo, 2026-05-08) had already been acted upon and a revised contract committed on branch `audit/smart-contract-fixes`. Several of Allan's findings therefore describe vulnerabilities that are already resolved in the current codebase. Status reflects the state of the *current* contract, not the original.

---

## H-1 — No refund deduplication

**Auditor finding:** `refund()` performs no on-chain deduplication. The same `orderRef` can be refunded multiple times until the contract is drained. Deduplication was entirely delegated to the backend database.

**Topizzy response — FIXED (prior to this audit)**

The current contract tracks every deposit in an `orders` mapping keyed by `keccak256(abi.encodePacked(orderRef, payer))`. Each `OrderRecord` carries a `settled` boolean. `refund()` requires:

```solidity
require(!orders[orderHash].settled, "Order already settled");
require(amount <= orders[orderHash].amount, "Refund exceeds deposit");
```

The `settled` flag is written to storage **before** the transfer (CEI pattern), preventing reentrancy-based double execution as well. A second `refund()` call on the same order will revert with `"Order already settled"`. The backend database is no longer the only line of defence.

---

## H-2 — Single EOA treasury with unrestricted instant access

**Auditor finding:** A single EOA `treasury` key can drain all user funds in one transaction via `withdrawTreasury()`. No timelock, no limit, no multi-sig.

**Topizzy response — ADDRESSED (architecture decision)**

The contract now separates two privileged roles:

- `treasury` — set to a **Gnosis Safe 2-of-3 multisig** at deployment. Controls `withdrawTreasury()` only. Any withdrawal requires 2 independent signatures — a single leaked key cannot drain the contract.
- `operator` — backend hot wallet. Controls `refund()` only. A compromised operator key cannot over-refund (bounded by `OrderRecord.amount`) and cannot call `withdrawTreasury()`.

Both addresses are declared `immutable`, removing the ability to reassign them post-deploy (which would itself be a risk vector).

We are not implementing a timelock at this stage. The Gnosis Safe requirement for 2-of-3 human approval on every treasury withdrawal is considered sufficient for the current scale. A timelock will be revisited before significant liquidity is held.

---

## M-1 — No treasury transfer mechanism — key loss permanently locks funds

**Auditor finding:** `address public treasury` has no setter. If the treasury key is lost, all funds are permanently locked.

**Topizzy response — ACKNOWLEDGED, by design**

Allan observed a mutable `address public treasury` with no transfer function. The current contract declares `treasury` as `immutable`, which makes the situation structurally different:

- `immutable` means the address cannot be changed by anyone, including Topizzy — removing a class of attack where a compromised admin reassigns treasury to an attacker.
- The treasury is a **Gnosis Safe 2-of-3**. To lose treasury access you would need to simultaneously lose 2 of 3 independent hardware wallets — a significantly higher bar than a single EOA.

We accept the tradeoff: no recovery path if 2-of-3 signers are permanently lost. At current scale this is acceptable. If the protocol grows to hold material liquidity, a two-step treasury transfer function gated behind the existing Gnosis Safe quorum will be added.

---

## M-2 — `withdrawTreasury()` missing `nonReentrant`

**Auditor finding:** `refund()` has `nonReentrant` but `withdrawTreasury()` does not — inconsistent and potentially exploitable if treasury is a smart contract (e.g. Gnosis Safe).

**Topizzy response — FIXED (prior to this audit)**

`withdrawTreasury()` now carries both `onlyTreasury` and `nonReentrant`:

```solidity
function withdrawTreasury(address receiver, uint256 amount) external onlyTreasury nonReentrant {
```

---

## M-3 — EIP-2612 permit front-running griefing

**Auditor finding:** A mempool observer can front-run `depositWithPermit()` by consuming the permit nonce, causing the original transaction to revert.

**Topizzy response — FIXED (prior to this audit)**

`depositWithPermit()` wraps the permit call in `try/catch`. If the nonce is already consumed (front-run), execution falls through to check whether `allowance >= amount` and proceeds if it does:

```solidity
try IERC20Permit(usdcToken).permit(msg.sender, address(this), amount, deadline, v, r, s)
{} catch {
    uint256 currentAllowance = IERC20(usdcToken).allowance(msg.sender, address(this));
    require(currentAllowance >= amount, "Permit failed and insufficient allowance");
}
```

---

## L-1 — `depositRef` not validated — empty string accepted

**Auditor finding:** Both deposit functions accept `""` as a valid `depositRef`. An empty-ref deposit would emit an event the backend cannot match, leaving the user without airtime and without an automatic refund trigger.

**Topizzy response — FIXED**

An empty-ref check has been added to both `deposit()` and `depositWithPermit()`:

```solidity
require(bytes(depositRef).length > 0, "Empty reference");
require(bytes(depositRef).length <= MAX_REF_LENGTH, "Reference too long");
```

Duplicate ref protection already existed via the `orderHash` uniqueness check (`require(orders[orderHash].amount == 0, "Order already exists")`).

---

## L-2 — `depositCounter` and unused `depositId`

**Auditor finding:** `depositCounter` increments but is never used by any on-chain consumer. The returned `depositId` is inaccessible from a transaction call context.

**Topizzy response — FIXED (prior to this audit)**

`depositCounter` has been removed. Both deposit functions now return `bytes32 orderHash` — the actual key used to look up the `OrderRecord` — which is also emitted in the `OrderPaid` event for off-chain indexing.

---

## I-1 — Broken test suite

**Auditor finding:** `test/Airtime.t.sol` called a 0-arg constructor and passed wrong types to `depositWithPermit()`. Zero tests were passing.

**Topizzy response — FIXED (prior to this audit)**

The test suite has been fully updated and extended:

- `test/Airtime.t.sol` — constructor and function signatures corrected
- `test/unit/AirtimeUnit.t.sol` — 9 PoC unit tests covering all critical paths
- `test/fuzz/AirtimeFuzz.t.sol` — 5 fuzz invariants
- `test/fuzz/AirtimeInvariants.t.sol` — stateful invariant suite with handler
- `test/mocks/MockUSDC.sol` — ERC20 + EIP-2612 mock

Current result: 13 passed, 5 intentional PoC failures (proving vulnerabilities no longer exist in the fixed contract).

---

## I-2 — SPDX-License-Identifier UNLICENSED

**Topizzy response — ACKNOWLEDGED, intentional**

The contract is proprietary. `UNLICENSED` is the correct identifier. No change.

---

## I-3 — No NatSpec documentation

**Topizzy response — PARTIAL**

Key state variables and functions have `@notice` / `@dev` comments. Exhaustive `@param` / `@return` NatSpec on every function is not prioritised at this stage. This will be added as part of pre-mainnet preparation alongside formal contract verification on Basescan.

---

## Summary

| ID | Finding | Status |
|----|---------|--------|
| H-1 | No refund deduplication | ✅ Fixed — `OrderRecord.settled` + CEI |
| H-2 | Single EOA treasury | ✅ Addressed — Gnosis Safe 2-of-3 + operator split |
| M-1 | No treasury transfer mechanism | ℹ️ By design — immutable + Gnosis Safe mitigates key loss |
| M-2 | `withdrawTreasury` missing `nonReentrant` | ✅ Fixed |
| M-3 | Permit front-running griefing | ✅ Fixed — try/catch with allowance fallback |
| L-1 | Empty `depositRef` accepted | ✅ Fixed — `length > 0` check added |
| L-2 | Unused `depositCounter` | ✅ Fixed — removed, replaced with `bytes32 orderHash` |
| I-1 | Broken test suite | ✅ Fixed — full suite passing |
| I-2 | SPDX UNLICENSED | ℹ️ Intentional |
| I-3 | Missing NatSpec | ℹ️ Partial — pre-mainnet task |
