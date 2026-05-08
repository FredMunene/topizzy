// SPDX-License-Identifier: MIT
// AirtimeInvariant.t.sol
// Run: forge test --match-path test/AirtimeInvariant.t.sol -vvvv
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Airtime} from "../../src/Airtime.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {AirtimeHandler} from "./AirtimeHandler.t.sol";

contract AirtimeInvariant is StdInvariant, Test {
    Airtime public airtime;
    MockUSDC public usdc;
    AirtimeHandler public handler;
    address public treasury = makeAddr("treasury");

    function setUp() public {
        usdc = new MockUSDC();
        airtime = new Airtime(address(usdc), treasury, treasury);
        handler = new AirtimeHandler(airtime, usdc, treasury);

        // Only fuzz through the handler
        targetContract(address(handler));

        // Exclude direct contract calls — handler controls state
        excludeContract(address(airtime));
        excludeContract(address(usdc));
    }

    function invariant_SolvencyAlwaysHolds() public view {
        uint256 contractBalance = usdc.balanceOf(address(airtime));
        uint256 totalDeposited = handler.totalDeposited();
        uint256 totalRefunded = handler.totalRefunded();
        uint256 totalWithdrawn = handler.totalWithdrawn();

        assertEq(
            contractBalance,
            totalDeposited - totalRefunded - totalWithdrawn,
            "SOLVENCY: balance must equal deposited - refunded - withdrawn"
        );
    }

    // ─────────────────────────────────────────────────────────
    // INVARIANT B: Total refunded never exceeds total deposited
    // Business rule: users can't get more than deposited in total
    // NOTE: this WILL break without the C-01 fix — that's the point
    function invariant_TotalRefundedNeverExceedsTotalDeposited() public view {
        assertLe(
            handler.totalRefunded(),
            handler.totalDeposited(),
            "C-01: refunded must never exceed deposited  - BROKEN without fix"
        );
    }

    // ─────────────────────────────────────────────────────────
    // INVARIANT C: depositCounter — REMOVED (L-01 fix)
    // depositCounter was removed from the contract. Per-order accounting
    // via the orders mapping replaces it with meaningful queryable data.
    // ─────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────
    // INVARIANT D: Treasury address never changes
    // Confirms immutability (and highlights H-01 — no rotation)
    // ─────────────────────────────────────────────────────────
    function invariant_TreasuryAddressIsImmutable() public view {
        assertEq(
            airtime.treasury(),
            treasury,
            "Treasury address must never change  - H-01: no rotation possible"
        );
    }
}
