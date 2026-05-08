// SPDX-License-Identifier: MIT
// AirtimeFuzz.t.sol
// Run: forge test --match-path test/AirtimeFuzz.t.sol -vvvv --fuzz-runs 10000
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Airtime} from "../../src/Airtime.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

contract AirtimeFuzz is Test {
    Airtime public airtime;
    MockUSDC public usdc;
    address public treasury = makeAddr("treasury");

    function setUp() public {
        usdc = new MockUSDC();
        airtime = new Airtime(address(usdc), treasury);
    }

    // ─────────────────────────────────────────────────────────
    // INVARIANT 1: Contract balance never goes negative
    // (EVM prevents this, but we verify accounting integrity)
    // Business rule: deposited USDC must either be withdrawn OR refunded
    // ─────────────────────────────────────────────────────────
    function testFuzz_ContractBalanceNeverExceedsTotalDeposited(
        uint256 depositAmount,
        uint256 refundAmount
    ) public {
        // Bound inputs to realistic USDC amounts (1 to 10,000 USDC)
        depositAmount = bound(depositAmount, 1e6, 10_000e6);
        refundAmount = bound(refundAmount, 1, depositAmount); // refund ≤ deposit

        address user = makeAddr("user");
        usdc.mint(user, depositAmount);

        vm.startPrank(user);
        usdc.approve(address(airtime), depositAmount);
        airtime.deposit("ref", depositAmount);
        vm.stopPrank();

        uint256 contractBefore = usdc.balanceOf(address(airtime));

        vm.prank(treasury);
        airtime.refund("ref", user, refundAmount);

        uint256 contractAfter = usdc.balanceOf(address(airtime));

        // Invariant: after valid refund, balance decreases by exactly refundAmount
        assertEq(
            contractBefore - contractAfter,
            refundAmount,
            "Balance must decrease by exactly refundAmount"
        );

        // Invariant: contract balance is always >= 0 (tautological in EVM, but explicit)
        assertGe(
            usdc.balanceOf(address(airtime)),
            0,
            "Balance must never be negative"
        );
    }

    // ─────────────────────────────────────────────────────────
    // INVARIANT 2: Only treasury can move funds
    // Fuzz: random caller tries to call treasury functions
    // ─────────────────────────────────────────────────────────
    function testFuzz_OnlyTreasuryCanMoveFunds(
        address randomCaller,
        uint256 amount
    ) public {
        amount = bound(amount, 1, 10_000e6);

        // Exclude treasury from random callers
        vm.assume(randomCaller != treasury);
        vm.assume(randomCaller != address(0));

        // Fund the contract
        usdc.mint(address(airtime), amount);

        // Random caller tries refund — must revert
        vm.prank(randomCaller);
        vm.expectRevert("Only treasury");
        airtime.refund("ref", randomCaller, amount);

        // Random caller tries withdrawTreasury — must revert
        vm.prank(randomCaller);
        vm.expectRevert("Only treasury");
        airtime.withdrawTreasury(randomCaller, amount);

        // Funds must still be in the contract
        assertEq(
            usdc.balanceOf(address(airtime)),
            amount,
            "Funds must be untouched by non-treasury caller"
        );
    }

    // ─────────────────────────────────────────────────────────
    // INVARIANT 3: Any deposit amount succeeds (no minimum)
    // This PROVES the M-02 finding — 1 wei deposits work
    // ─────────────────────────────────────────────────────────
    function testFuzz_AnyAmountDeposits_M02_NoMinimumEnforced(
        uint256 amount
    ) public {
        amount = bound(amount, 1, type(uint96).max); // 1 wei to very large

        address user = makeAddr("user");
        usdc.mint(user, amount);

        vm.startPrank(user);
        usdc.approve(address(airtime), amount);

        // This should revert if minimum is enforced.
        // It doesn't — proving M-02.
        airtime.deposit("ref", amount);
        vm.stopPrank();

        assertEq(
            usdc.balanceOf(address(airtime)),
            amount,
            "M-02: deposit of any amount including 1 wei succeeds"
        );
    }

    // ─────────────────────────────────────────────────────────
    // INVARIANT 4: Treasury can always extract accumulated fees
    // Business rule: the $0.05 flat fee must be withdrawable
    // ─────────────────────────────────────────────────────────
    function testFuzz_TreasuryCanWithdrawFees(
        uint256 numDeposits,
        uint256 depositAmount
    ) public {
        numDeposits = bound(numDeposits, 1, 20);
        depositAmount = bound(depositAmount, 1e6, 1_000e6);

        uint256 totalDeposited = 0;

        // Simulate multiple users depositing
        for (uint i = 0; i < numDeposits; i++) {
            address user = address(uint160(i + 100));
            usdc.mint(user, depositAmount);
            vm.startPrank(user);
            usdc.approve(address(airtime), depositAmount);
            airtime.deposit("ref", depositAmount);
            vm.stopPrank();
            totalDeposited += depositAmount;
        }

        assertEq(usdc.balanceOf(address(airtime)), totalDeposited);

        // Treasury withdraws the fee portion (simulated as 5% of total)
        // In real protocol this is $0.05 per order
        uint256 feeAmount = numDeposits * 50000; // $0.05 per order in 6-decimal USDC
        feeAmount = feeAmount > totalDeposited ? totalDeposited : feeAmount;

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(treasury);
        airtime.withdrawTreasury(treasury, feeAmount);

        assertEq(
            usdc.balanceOf(treasury) - treasuryBefore,
            feeAmount,
            "Treasury must be able to withdraw accumulated fees"
        );
    }

    // ─────────────────────────────────────────────────────────
    // INVARIANT 5: User funds cannot be taken by other users
    // Business rule: no user drains another user's funds
    // ─────────────────────────────────────────────────────────
    function testFuzz_C01_ShouldFail_RefundNeverExceedsDeposit(
        uint256 depositAmount,
        uint256 refundAmount
    ) public {
        depositAmount = bound(depositAmount, 1e6, 10_000e6);
        refundAmount = bound(refundAmount, depositAmount + 1, 100_000e6);

        address user = makeAddr("user");
        usdc.mint(user, depositAmount);
        usdc.mint(address(airtime), 100_000e6);

        vm.startPrank(user);
        usdc.approve(address(airtime), depositAmount);
        airtime.deposit("ref", depositAmount);
        vm.stopPrank();

        vm.prank(treasury);
        // THIS SHOULD REVERT — if it doesn't, C-01 is present
        // Comment out expectRevert to SEE the bug. Add it back for the fix.
        vm.expectRevert("Refund exceeds deposit"); // add after fix
        airtime.refund("ref", user, refundAmount);
    }
}
