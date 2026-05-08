# Topizzy Smart Contract Security Audit Report

**Prepared by:** Dennis Kiptoo — Security Researcher  
**Version:** 1.0  
**Date:** May 7, 2026  
**Contract audited:** `src/Airtime.sol`  
**Commit hash:** a20bbdfa7ac5cb4730592fe7dc799939f1998c02  
**Audit duration:** 2 days | ~100 lines of code  
**Chain:** Base (Ethereum L2)  
**Repository:** https://github.com/cableGraph/topizzy-security-audit/

---

## Executive Summary

**12 total findings: 2 Critical, 3 High, 4 Medium, 3 Low — all Open.**

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | Open |
| High | 3 | Open |
| Medium | 4 | Open |
| Low | 3 | Open |

The root cause underlying both Critical findings is the **complete absence of on-chain deposit accounting**. The contract is a pure escrow with no record of who deposited what amount, meaning all solvency guarantees depend entirely on the off-chain backend behaving correctly.

---

## Protocol Summary

Topizzy is an onchain airtime purchase tool on Base, allowing users to top up mobile airtime using USDC without off-ramping. A flat fee of $0.05 applies per transaction, with automatic refunds for failed top-ups. Supported regions: Kenya, Uganda, Rwanda, Tanzania, South Africa (in progress).

**Core escrow pattern:**
```
User --deposit USDC--> [Airtime.sol] --treasury controls--> Treasury wallet
```

**Critical business invariants:**
1. Every deposited USDC must be withdrawn by treasury OR refunded to the original depositor.
2. A failed airtime order MUST result in a full refund.
3. No user should be refunded more than they deposited.
4. The $0.05 flat fee must be extractable by treasury.
5. No user should be able to drain another user's funds.

---

## Findings

### CRITICAL

---

#### [C-01] No on-chain refund accounting — double refund drains protocol

**Severity:** Critical | **Likelihood:** High | **Impact:** High | **Status:** Open

**Description:** The `refund()` function transfers USDC to a receiver with no on-chain verification that `orderRef` has not been previously refunded. The contract stores no per-order deposit records. Treasury can call `refund()` multiple times with the same `orderRef`, and each call processes independently as long as the contract holds sufficient balance. There is also no upper bound linking `amount` to the original deposit — treasury can refund Alice 1000 USDC even if she only deposited 10 USDC, consuming other depositors' funds.

**Impact:** A single duplicate refund call or over-refund drains other depositors' funds. Users whose airtime failed cannot be refunded if their funds were consumed by a prior over-refund. No on-chain audit trail to detect or recover from this state.

**Proof of Concept (confirmed, gas: 141,036):**
```solidity
// Alice deposits 10 USDC
airtime.deposit("order-42", TEN);
// Treasury refunds order-42 legitimately
airtime.refund("order-42", alice, TEN);
// Treasury refunds order-42 AGAIN — SUCCEEDS
airtime.refund("order-42", alice, TEN);
// Alice received 20 USDC from a 10 USDC deposit
```
Also confirmed via fuzz testing: `testFuzz_C01_RefundCanExceedDeposit` across 256 random pairs. Invariant `invariant_TotalRefundedNeverExceedsTotalDeposited` was immediately broken when a `refundExistingOrder()` handler was added.

**Recommended Fix:**
```solidity
mapping(bytes32 => bool)    private s_refundedOrders;
mapping(bytes32 => uint256) private s_orderAmounts;

// In deposit(): record order amount
bytes32 orderHash = keccak256(abi.encodePacked(depositRef, msg.sender));
s_orderAmounts[orderHash] = amount;

// In refund(): add before transfer
bytes32 orderHash = keccak256(abi.encodePacked(orderRef, receiver));
require(!s_refundedOrders[orderHash],        "Order already refunded");
require(amount <= s_orderAmounts[orderHash], "Refund exceeds original deposit");
s_refundedOrders[orderHash] = true;
```

---

#### [C-02] Treasury withdrawal has no minimum balance check — refund liquidity can be drained

**Severity:** Critical | **Likelihood:** High | **Impact:** High | **Status:** Open

**Description:** `withdrawTreasury()` has no minimum balance check and no awareness of pending refund obligations. Treasury can withdraw 100% of the contract's USDC balance at any time — including funds belonging to users with pending orders. If orders then fail, there is no USDC left to refund users.

**Impact:** Users lose deposited funds permanently with no on-chain recourse. This is an operational race condition between withdrawal and refund processing — no malicious code required.

**Proof of Concept (confirmed, gas: 163,428):**
```solidity
// Alice and Bob each deposit 10 USDC (contract holds 20 USDC)
// Treasury withdraws everything
airtime.withdrawTreasury(treasury, 20e6);
// Airtime fails. Treasury tries to refund Alice.
airtime.refund("order-A", alice, TEN); // REVERTS — no balance
// Alice lost 10 USDC with no on-chain recourse
```

**Recommended Fix:**
```solidity
uint256 public pendingRefunds;

function setPendingRefunds(uint256 amount) external onlyTreasury {
    pendingRefunds = amount;
}

function withdrawTreasury(address receiver, uint256 amount) external onlyTreasury nonReentrant {
    uint256 available = IERC20(usdcToken).balanceOf(address(this)) - pendingRefunds;
    require(amount <= available, "Cannot withdraw pending refund liquidity");
    IERC20(usdcToken).safeTransfer(receiver, amount);
    emit TreasuryWithdrawal(receiver, amount);
}
```

---

### HIGH

---

#### [H-01] No treasury rotation mechanism — key compromise is irrecoverable

**Severity:** High | **Likelihood:** Medium | **Impact:** High | **Status:** Open

**Description:** `treasury` is set once in the constructor as `public immutable`. No `setTreasury()`, `proposeTreasury()`, or ownership transfer function exists. A compromised treasury key gives an attacker permanent, irrevocable full control over all user funds with no on-chain recovery path. The team cannot revoke access, pause the treasury role, or migrate without redeploying.

**Proof of Concept (confirmed, gas: 101,581):** Calling `setTreasury(address)` returns false (function does not exist). A prank as the attacker-controlled treasury successfully drains the contract.

**Recommended Fix:** Implement two-step treasury transfer with a 2-day delay:
```solidity
address public treasury;
address public pendingTreasury;
uint256 public treasuryTransferTime;
uint256 public constant TREASURY_DELAY = 2 days;

function proposeTreasury(address newTreasury) external onlyTreasury { ... }
function acceptTreasury() external {
    require(msg.sender == pendingTreasury, "Not pending treasury");
    require(block.timestamp >= treasuryTransferTime, "Delay not passed");
    treasury = pendingTreasury;
    pendingTreasury = address(0);
}
```

---

#### [H-02] `depositWithPermit()` vulnerable to permit front-run griefing DOS

**Severity:** High | **Likelihood:** Medium | **Impact:** High | **Status:** Open

**Description:** `depositWithPermit()` calls `permit()` using a user-supplied signature. An attacker monitoring the mempool can extract the signature and call `permit()` directly first, consuming the nonce. When the user's transaction executes, `permit()` reverts with a stale nonce error, reverting the entire deposit. Users pay gas for a guaranteed failure.

**Proof of Concept (confirmed, gas: 134,532):** Attacker front-runs user's `permit()` call; user's subsequent `depositWithPermit()` reverts with `ERC2612InvalidSigner`.

**Recommended Fix:** Wrap `permit()` in a `try/catch` and fall through to existing allowance:
```solidity
try IERC20Permit(usdcToken).permit(msg.sender, address(this), amount, deadline, v, r, s)
{} catch {
    uint256 currentAllowance = IERC20(usdcToken).allowance(msg.sender, address(this));
    require(currentAllowance >= amount, "Permit failed and insufficient allowance");
}
IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), amount);
```

---

#### [H-03] Zero per-user deposit accounting — entire protocol solvency is off-chain

**Severity:** High | **Likelihood:** High | **Impact:** Medium | **Status:** Open

**Description:** The contract stores no per-user or per-order deposit data (`mapping(address => uint256)`, `mapping(bytes32 => uint256)`, etc.). It cannot verify on-chain that a refund amount matches what was deposited, who originally paid, or whether an order has been settled. The global `depositCounter` is never linked to a user or amount.

**Proof of Concept (confirmed, gas: 105,328):** Treasury can call `refund("order-A", attacker, TEN)` even though Alice paid for order-A — contract accepts it, attacker receives Alice's funds.

**Recommended Fix:**
```solidity
struct OrderRecord { address payer; uint256 amount; bool settled; }
mapping(bytes32 => OrderRecord) public orders;

function deposit(string memory depositRef, uint256 amount) external nonReentrant {
    bytes32 orderHash = keccak256(abi.encodePacked(depositRef, msg.sender));
    require(orders[orderHash].amount == 0, "Order already exists");
    IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), amount);
    orders[orderHash] = OrderRecord({ payer: msg.sender, amount: amount, settled: false });
    ...
}
```

---

### MEDIUM

---

#### [M-01] `withdrawTreasury()` missing `nonReentrant` modifier

**Severity:** Medium | **Likelihood:** Low | **Impact:** High | **Status:** Open

`refund()` has `nonReentrant`; `withdrawTreasury()` performs an identical operation but does not. Low risk with USDC on Base (no reentrancy hooks), but elevated risk if the token is ever changed. **Fix:** Add `nonReentrant` to `withdrawTreasury()`.

---

#### [M-02] No minimum deposit amount — dust griefing and fee bypass

**Severity:** Medium | **Likelihood:** Medium | **Impact:** Medium | **Status:** Open

Contract accepts any deposit `> 0`. Attacker can spam 1 wei deposits, each requiring backend API calls, off-chain processing, and a treasury refund transaction. The documented $0.05 flat fee has no on-chain enforcement. **Fix:**
```solidity
uint256 public constant MIN_DEPOSIT = 100_000; // $0.10 USDC (6 decimals)
require(amount >= MIN_DEPOSIT, "Below minimum deposit");
```

---

#### [M-03] No validation that `usdcToken` supports EIP-2612 permit

**Severity:** Medium | **Likelihood:** Low | **Impact:** High | **Status:** Open

Constructor accepts any non-zero address as `_ERC20TokenAddress`. If the token does not implement EIP-2612, `depositWithPermit()` either silently succeeds (with a fallback function, potentially with zero allowance) or permanently reverts. Since `usdcToken` is `immutable`, this cannot be corrected post-deployment. **Fix:** Add `IERC20Metadata(_ERC20TokenAddress).decimals() > 0` validation in constructor.

---

#### [M-04] Unconstrained string length in `depositRef` / `orderRef`

**Severity:** Medium | **Likelihood:** Low | **Impact:** Medium | **Status:** Open

No length validation on `depositRef`/`orderRef`. Attacker can submit 100,000-byte strings: bloating chain event logs, causing backend parsing errors, SQL injection if strings are interpolated into database queries, and log injection. **Fix:**
```solidity
uint256 public constant MAX_REF_LENGTH = 64;
require(bytes(ref).length <= MAX_REF_LENGTH, "Reference too long");
```

---

### LOW

---

#### [L-01] `depositCounter` provides no security value

Never stored against a user, amount, or order. Cannot be queried for meaningful state. Costs ~20,000 gas (cold SSTORE) per deposit for zero security benefit. **Fix:** Remove entirely, or replace with meaningful per-order tracking (H-03 fix).

#### [L-02] `refund()` and `withdrawTreasury()` are functionally redundant

Both perform identical `safeTransfer` with identical `onlyTreasury` access control. `refund("drain", treasury, entireBalance)` is functionally equivalent to `withdrawTreasury(treasury, entireBalance)`. **Fix:** Consolidate into a single internal `_transferFromContract()` function.

#### [L-03] USDC centralization / blacklist dependency undocumented

Circle can blacklist any address or pause USDC globally. If `Airtime.sol` is blacklisted, all deposits, refunds, and withdrawals revert permanently — all held funds become inaccessible. **Fix:** Document this risk; consider supporting a secondary stablecoin; make `usdcToken` mutable (with proper access control) for emergency migration.

---

### Informational

- **[I-01]** Emit `depositId` return value in the `OrderPaid` event for easier off-chain reconciliation.
- **[I-02]** Verify `treasury` is declared `immutable` in the final deployed version.
- **[I-03]** `depositCounter = 0` in constructor is redundant — Solidity zero-initialises by default.
- **[I-04]** Consider an emergency `Paused` mechanism even before the H-01 treasury rotation fix is implemented.
- **[I-05]** Comment `// ERC20 token address (USDC/USDT)` suggests USDT was considered — note USDT does not revert on failed transfers on some chains (though `SafeERC20` handles this).

---

## Test Suite Analysis

**19 tests total | 50,000+ state transitions | 19/19 passed**

| Type | File | Count | Runs |
|------|------|-------|------|
| Unit PoC | `test/unit/AirtimeUnit.t.sol` | 9 | 1 each |
| Fuzz | `test/fuzz/AirtimeFuzz.t.sol` | 6 | 256 each |
| Invariant | `test/fuzz/AirtimeInvariants.t.sol` | 4 | 1000 runs × 50 depth |

**Invariant handler executed:** 16,647 deposits, 16,643 refunds, 16,710 withdrawals.

Key finding from invariant suite: `invariant_TotalRefundedNeverExceedsTotalDeposited` **broke immediately** when a `refundExistingOrder()` handler was added — Foundry produced the exact sequence `deposit("order-X", 10e6) → refund("order-X", user, 10e6) → refund("order-X", user, 10e6)` proving C-01 mechanically.

**Gas snapshot:**

| Test | Gas |
|------|-----|
| `testDepositWithPermit` | 122,938 |
| `test_C01_DoubleRefund_DrainsFunds` | 139,220 |
| `test_C01b_RefundExceedsDeposit` | 146,946 |
| `test_C02_WithdrawBeforeRefund_BlocksUsers` | 161,611 |
| `test_H01_NoTreasuryRotation_IsPermanent` | 99,872 |
| `test_H02_PermitFrontrun_RevertsUserDeposit` | 134,532 |
| `test_H03_NoAccounting_WrongUserRefunded` | 103,620 |
| `test_M01_WithdrawTreasury_MissingReentrancyGuard` | 4,477 |
| `test_M02_DustDeposit_NoMinimumEnforced` | 224,098 |

**Slither static analysis** confirmed M-01, M-02, and M-04. It did NOT detect C-01, C-02, H-01, H-02, or H-03 — all Critical and High findings required manual review.

---

## Post-Audit Recommendations

**Immediate (before any mainnet deployment):**
1. Fix C-01 — implement on-chain per-order accounting.
2. Fix C-02 — enforce minimum balance before treasury withdrawals.
3. Fix H-02 — add `try/catch` around `permit()` in `depositWithPermit()`.

**Before launch:**
4. Fix H-01 — two-step treasury rotation with 48-hour delay.
5. Fix M-01 — add `nonReentrant` to `withdrawTreasury()`.
6. Fix M-02 — enforce `MIN_DEPOSIT` on-chain.
7. Fix M-04 — enforce maximum string length on refs.

**Architecture recommendations:**
- Replace single EOA treasury with a Gnosis Safe (2-of-3 minimum).
- Add a `pause()` circuit breaker callable by a separate `guardian` address.
- Keep the `refundExistingOrder()` handler in invariant tests permanently as a regression check for C-01.
- A mitigation review is strongly recommended after fixes are implemented.

---

**Auditor:** Dennis Kiptoo | **Date:** May 7, 2026 | **Status:** Awaiting client response on all findings
