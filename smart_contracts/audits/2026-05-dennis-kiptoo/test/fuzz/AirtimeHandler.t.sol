// SPDX-License-Identifier: MIT
// AirtimeHandler.t.sol — controls invariant fuzzer state
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Airtime} from "../../src/Airtime.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

contract AirtimeHandler is Test {
    Airtime public airtime;
    MockUSDC public usdc;
    address public treasury;

    // Ghost variables
    uint256 public totalDeposited;
    uint256 public totalRefunded;
    uint256 public totalWithdrawn;
    uint256 public initialDepositCounter;
    uint256 public depositOrderSeed;
    string[] public usedOrderRefs;

    // Track users for state consistency
    address[] public usersWithDeposits;
    mapping(address => uint256) public userDeposits;
    mapping(string => uint256) public orderAmounts;
    mapping(string => bool) public orderRefunded;

    uint256 constant MAX_DEPOSIT = 10_000e6;
    uint256 constant MAX_USERS = 10;

    constructor(Airtime _airtime, MockUSDC _usdc, address _treasury) {
        airtime = _airtime;
        usdc = _usdc;
        treasury = _treasury;
        initialDepositCounter = 0; // depositCounter removed in L-01 fix
    }

    function deposit(uint256 userSeed, uint256 amount) external {
        amount = bound(amount, 1e6, MAX_DEPOSIT);

        address user = address(uint160(bound(userSeed, 1, MAX_USERS) + 1000));
        string memory orderRef = _genOrderRef(depositOrderSeed++);

        usdc.mint(user, amount);
        vm.startPrank(user);
        usdc.approve(address(airtime), amount);
        airtime.deposit(orderRef, amount);
        vm.stopPrank();

        // Update ghost variables
        totalDeposited += amount;
        userDeposits[user] += amount;
        orderAmounts[orderRef] = amount;

        if (userDeposits[user] == amount) {
            usersWithDeposits.push(user);
        }
    }

    // ── Handler: refund (treasury action) ───────────────────
    function refund(uint256 userSeed, uint256 refundSeed) external {
        if (usersWithDeposits.length == 0) return;

        address user = usersWithDeposits[userSeed % usersWithDeposits.length];
        uint256 deposited = userDeposits[user];
        if (deposited == 0) return;

        // Refund up to what the user deposited (correct behaviour)
        uint256 amount = bound(refundSeed, 1, deposited);
        string memory orderRef = _genOrderRef(refundSeed);

        if (usdc.balanceOf(address(airtime)) < amount) return;

        vm.prank(treasury);
        airtime.refund(orderRef, user, amount);

        // Update ghost variables
        totalRefunded += amount;
        userDeposits[user] -= amount;
    }

    // ── Handler: treasury withdrawal ────────────────────────
    function withdraw(uint256 amount) external {
        uint256 balance = usdc.balanceOf(address(airtime));
        if (balance == 0) return;

        amount = bound(amount, 1, balance);

        vm.prank(treasury);
        airtime.withdrawTreasury(treasury, amount);

        totalWithdrawn += amount;
    }

    // ── Helper ───────────────────────────────────────────────
    function _genOrderRef(uint256 seed) internal pure returns (string memory) {
        return string(abi.encodePacked("order-", uint2str(seed % 1000)));
    }

    function uint2str(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        uint256 temp = n;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buf = new bytes(digits);
        while (n != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + (n % 10)));
            n /= 10;
        }
        return string(buf);
    }

    function refundExistingOrder(uint256 refSeed, uint256 amount) external {
        if (usedOrderRefs.length == 0) return;

        // Pick an already-used ref — simulates double refund attempt
        string memory orderRef = usedOrderRefs[refSeed % usedOrderRefs.length];
        amount = bound(amount, 1, 10_000e6);

        if (usdc.balanceOf(address(airtime)) < amount) return;

        // With C-01 present: this succeeds — invariant will BREAK
        // With C-01 fixed: this should revert
        vm.prank(treasury);
        try airtime.refund(orderRef, treasury, amount) {
            totalRefunded += amount; // if it succeeds, track it
        } catch {
            // Expected after fix — double refund correctly reverts
        }
    }
}
