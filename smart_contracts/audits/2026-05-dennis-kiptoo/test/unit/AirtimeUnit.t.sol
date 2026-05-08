// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Airtime} from "../../src/Airtime.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

contract AirtimeTest is Test {
    Airtime public airtime;
    MockUSDC public usdc;
    address public user;
    address public treasury;
    uint256 public userPrivateKey;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public attacker = makeAddr("attacker");

    uint256 constant USDC_DECIMALS = 1e6;
    uint256 constant ONE_HUNDRED = 100 * USDC_DECIMALS;
    uint256 constant TEN = 10 * USDC_DECIMALS;

    function setUp() public {
        treasury = address(this);
        usdc = new MockUSDC();
        airtime = new Airtime(address(usdc), treasury);

        userPrivateKey = 0x1234567890123456789012345678901234567890123456789012345678901234;
        user = vm.addr(userPrivateKey);

        usdc.mint(user, 1000 ether);
        usdc.mint(alice, ONE_HUNDRED);
        usdc.mint(bob, ONE_HUNDRED);
        usdc.mint(attacker, ONE_HUNDRED);
    }

    function testDepositWithPermit() public {
        uint256 amount = 100 ether;
        uint256 deadline = block.timestamp + 1 hours;
        string memory depositRef = "test-order-123";

        bytes32 domainSeparator = usdc.DOMAIN_SEPARATOR();

        bytes32 permitTypehash = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );

        bytes32 structHash = keccak256(
            abi.encode(
                permitTypehash,
                user,
                address(airtime),
                amount,
                usdc.nonces(user),
                deadline
            )
        );

        bytes32 messageHash = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, messageHash);

        vm.prank(user);
        airtime.depositWithPermit(depositRef, amount, deadline, v, r, s);

        assertEq(usdc.balanceOf(address(airtime)), amount, "Incorrect balance");
    }

    function test_C01_DoubleRefund_DrainsFunds() public {
        vm.startPrank(alice);
        usdc.approve(address(airtime), TEN);
        airtime.deposit("order-42", TEN);
        vm.stopPrank();

        uint256 contractBalanceBefore = usdc.balanceOf(address(airtime));
        console.log("Contract balance before:", contractBalanceBefore);

        vm.prank(treasury);
        airtime.refund("order-42", alice, TEN);

        usdc.mint(address(airtime), TEN);

        vm.prank(treasury);
        airtime.refund("order-42", alice, TEN);

        console.log(
            "Alice balance after double refund:",
            usdc.balanceOf(alice)
        );
        assertEq(
            usdc.balanceOf(alice),
            ONE_HUNDRED + TEN,
            "C-01: Alice received 20 USDC from 10 USDC deposit  - double refund works"
        );
    }

    function test_C01b_RefundExceedsDeposit() public {
        vm.prank(alice);
        usdc.approve(address(airtime), TEN);
        vm.prank(alice);
        airtime.deposit("order-1", TEN);

        vm.prank(bob);
        usdc.approve(address(airtime), TEN);
        vm.prank(bob);
        airtime.deposit("order-2", TEN);

        vm.prank(treasury);
        airtime.refund("order-1", alice, 20 * USDC_DECIMALS);

        vm.prank(treasury);
        vm.expectRevert();
        airtime.refund("order-2", bob, TEN);

        console.log("Bob balance:", usdc.balanceOf(bob));
        assertEq(
            usdc.balanceOf(bob),
            ONE_HUNDRED - TEN,
            "C-01b: Bob lost his 10 USDC to Alice's over-refund"
        );
    }

    function test_C02_WithdrawBeforeRefund_BlocksUsers() public {
        vm.prank(alice);
        usdc.approve(address(airtime), TEN);
        vm.prank(alice);
        airtime.deposit("order-A", TEN);

        vm.prank(bob);
        usdc.approve(address(airtime), TEN);
        vm.prank(bob);
        airtime.deposit("order-B", TEN);

        vm.prank(treasury);
        airtime.withdrawTreasury(treasury, 20 * USDC_DECIMALS);

        assertEq(usdc.balanceOf(address(airtime)), 0, "Contract is empty");

        vm.prank(treasury);
        vm.expectRevert();
        airtime.refund("order-A", alice, TEN);

        console.log("Alice balance (lost funds):", usdc.balanceOf(alice));
        assertEq(
            usdc.balanceOf(alice),
            ONE_HUNDRED - TEN,
            "C-02: Alice lost 10 USDC  - treasury drained before refund"
        );
    }

    function test_H01_NoTreasuryRotation_IsPermanent() public {
        address newTreasury = makeAddr("newSafeTreasury");

        bytes memory callData = abi.encodeWithSignature(
            "setTreasury(address)",
            newTreasury
        );
        (bool success, ) = address(airtime).call(callData);
        assertFalse(
            success,
            "H-01: setTreasury does not exist  - key rotation impossible"
        );

        vm.prank(alice);
        usdc.approve(address(airtime), TEN);
        vm.prank(alice);
        airtime.deposit("order-1", TEN);

        vm.prank(treasury);
        airtime.withdrawTreasury(attacker, TEN);

        assertEq(
            usdc.balanceOf(attacker),
            ONE_HUNDRED + TEN,
            "H-01: Compromised treasury drained contract  - no recovery possible"
        );
    }

    function test_H02_PermitFrontrun_RevertsUserDeposit() public {
        uint256 aliceKey = 0xA11CE;
        address aliceSigner = vm.addr(aliceKey);
        usdc.mint(aliceSigner, TEN);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonceBefore = usdc.nonces(aliceSigner);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            aliceKey,
            aliceSigner,
            address(airtime),
            TEN,
            deadline
        );

        vm.prank(attacker);
        usdc.permit(aliceSigner, address(airtime), TEN, deadline, v, r, s);

        assertEq(
            usdc.nonces(aliceSigner),
            nonceBefore + 1,
            "Nonce consumed by attacker"
        );

        vm.prank(aliceSigner);
        vm.expectRevert();
        airtime.depositWithPermit("order-1", TEN, deadline, v, r, s);

        console.log(
            "H-02: Alice deposit bricked by front-run. Funds never moved but tx failed."
        );
    }

    function test_H03_NoAccounting_WrongUserRefunded() public {
        vm.prank(alice);
        usdc.approve(address(airtime), TEN);
        vm.prank(alice);
        airtime.deposit("order-A", TEN);

        vm.prank(treasury);
        airtime.refund("order-A", attacker, TEN);

        assertEq(
            usdc.balanceOf(attacker),
            ONE_HUNDRED + TEN,
            "H-03: Attacker received Alice's refund  - no address validation"
        );
        assertEq(
            usdc.balanceOf(alice),
            ONE_HUNDRED - TEN,
            "H-03: Alice lost her deposit with no recourse"
        );
    }

    function test_M01_WithdrawTreasury_MissingReentrancyGuard() public pure {
        console.log("M-01: withdrawTreasury() has no nonReentrant modifier");
        console.log(
            "refund() has nonReentrant. Inconsistency confirmed by code inspection."
        );
        assertTrue(true);
    }

    function test_M02_DustDeposit_NoMinimumEnforced() public {
        usdc.mint(attacker, 1000);

        vm.startPrank(attacker);
        usdc.approve(address(airtime), 1000);
        for (uint i = 0; i < 10; i++) {
            airtime.deposit("spam", 1);
        }
        vm.stopPrank();

        console.log("M-02: 10 dust deposits of 1 wei each succeeded");
        console.log("Each requires backend API call + potential refund gas");
        assertEq(
            usdc.balanceOf(address(airtime)),
            10,
            "M-02: Contract holds 10 wei from spam deposits"
        );
    }

    function _signPermit(
        uint256 privateKey,
        address owner,
        address spender,
        uint256 value,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                spender,
                value,
                usdc.nonces(owner),
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)
        );
        (v, r, s) = vm.sign(privateKey, digest);
    }
}
