// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Airtime} from "../src/Airtime.sol";
import {IAllowanceTransfer} from "../src/interfaces/IAllowanceTransfer.sol";
import {ERC20Permit} from "lib/openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockUSDC is ERC20Permit {
    constructor() ERC20("USD Coin", "USDC") ERC20Permit("USD Coin") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockPermit2 is IAllowanceTransfer {
    using SafeERC20 for IERC20;

    struct StoredPermit {
        address token;
        uint256 amount;
        uint256 deadline;
        bool used;
    }

    mapping(address => mapping(uint256 => StoredPermit)) public permits;

    function setPermit(address owner, uint256 nonce, address token, uint256 amount, uint256 deadline) external {
        permits[owner][nonce] = StoredPermit({
            token: token,
            amount: amount,
            deadline: deadline,
            used: false
        });
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata /* signature */
    ) external override {
        StoredPermit storage stored = permits[owner][permit.nonce];
        require(stored.token != address(0), "Permit not found");
        require(stored.token == permit.permitted.token, "Permit token mismatch");
        require(stored.amount >= transferDetails.requestedAmount, "Permit amount too small");
        require(block.timestamp <= stored.deadline, "Permit expired");
        require(!stored.used, "Permit already used");

        stored.used = true;
        IERC20(permit.permitted.token).safeTransferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }
}

contract AirtimeTest is Test {
    Airtime public airtime;
    MockUSDC public usdc;
    MockPermit2 public permit2;
    address public user;
    address public treasury;
    uint256 public userPrivateKey;

    function setUp() public {
        treasury = address(0xBEEF);
        usdc = new MockUSDC();
        permit2 = new MockPermit2();
        airtime = new Airtime(address(usdc), treasury, address(permit2));

        userPrivateKey = 0x1234567890123456789012345678901234567890123456789012345678901234;
        user = vm.addr(userPrivateKey);

        usdc.mint(user, 1000 ether);

        vm.prank(user);
        usdc.approve(address(permit2), type(uint256).max);
    }

    function testConstructorRevertsWhenPermit2Zero() public {
        vm.expectRevert("Invalid permit2 address");
        new Airtime(address(usdc), treasury, address(0));
    }

    function testDepositWithPermit() public {
        uint256 amount = 100 ether;
        uint256 deadline = block.timestamp + 1 hours;
        string memory orderRef = "ORDER-2612";

        bytes32 domainSeparator = usdc.DOMAIN_SEPARATOR();
        bytes32 permitTypehash =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash =
            keccak256(abi.encode(permitTypehash, user, address(airtime), amount, usdc.nonces(user), deadline));
        bytes32 messageHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, messageHash);

        vm.prank(user);
        airtime.depositWithPermit(orderRef, amount, deadline, v, r, s);

        assertEq(usdc.balanceOf(address(airtime)), amount, "Incorrect balance");
        assertEq(airtime.depositCounter(), 1, "Deposit counter mismatch");
    }

    function testDepositWithPermit2() public {
        uint256 amount = 50 ether;
        uint256 nonce = 1;
        uint256 deadline = block.timestamp + 1 hours;
        string memory orderRef = "ORDER-PERMIT2";

        permit2.setPermit(user, nonce, address(usdc), amount, deadline);

        IAllowanceTransfer.PermitTransferFrom memory permit = IAllowanceTransfer.PermitTransferFrom({
            permitted: IAllowanceTransfer.TokenPermissions({token: address(usdc), amount: amount}),
            nonce: nonce,
            deadline: deadline
        });

        vm.prank(user);
        airtime.depositWithPermit2(orderRef, permit, "");

        assertEq(usdc.balanceOf(address(airtime)), amount, "Permit2 balance mismatch");
        assertEq(airtime.depositCounter(), 1, "Deposit counter mismatch after Permit2");
    }

    function testDepositWithPermit2RevertsForExpiredPermit() public {
        uint256 amount = 10 ether;
        uint256 nonce = 2;
        uint256 deadline = block.timestamp - 1;
        string memory orderRef = "EXPIRED";

        IAllowanceTransfer.PermitTransferFrom memory permit = IAllowanceTransfer.PermitTransferFrom({
            permitted: IAllowanceTransfer.TokenPermissions({token: address(usdc), amount: amount}),
            nonce: nonce,
            deadline: deadline
        });

        vm.expectRevert("Permit expired");
        vm.prank(user);
        airtime.depositWithPermit2(orderRef, permit, "");
    }

    function testDepositWithPermit2RevertsForInvalidToken() public {
        uint256 amount = 20 ether;
        uint256 nonce = 3;
        uint256 deadline = block.timestamp + 1 hours;
        string memory orderRef = "BAD-TOKEN";

        IAllowanceTransfer.PermitTransferFrom memory permit = IAllowanceTransfer.PermitTransferFrom({
            permitted: IAllowanceTransfer.TokenPermissions({token: address(0xDEAD), amount: amount}),
            nonce: nonce,
            deadline: deadline
        });

        vm.expectRevert("Invalid permit token");
        vm.prank(user);
        airtime.depositWithPermit2(orderRef, permit, "");
    }

    function testDepositWithPermit2CannotReuseNonce() public {
        uint256 amount = 30 ether;
        uint256 nonce = 4;
        uint256 deadline = block.timestamp + 1 hours;
        string memory orderRef = "NONCE-REUSE";

        permit2.setPermit(user, nonce, address(usdc), amount, deadline);

        IAllowanceTransfer.PermitTransferFrom memory permit = IAllowanceTransfer.PermitTransferFrom({
            permitted: IAllowanceTransfer.TokenPermissions({token: address(usdc), amount: amount}),
            nonce: nonce,
            deadline: deadline
        });

        vm.prank(user);
        airtime.depositWithPermit2(orderRef, permit, "");

        vm.expectRevert("Permit already used");
        vm.prank(user);
        airtime.depositWithPermit2(orderRef, permit, "");
    }
}
