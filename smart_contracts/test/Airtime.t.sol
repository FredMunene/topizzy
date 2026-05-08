// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Airtime} from "../src/Airtime.sol";
import {ERC20Permit} from "lib/openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20Permit {
    constructor() ERC20("USD Coin", "USDC") ERC20Permit("USD Coin") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AirtimeTest is Test {
    Airtime public airtime;
    MockUSDC public usdc;
    address public user;
    address public treasury;
    uint256 public userPrivateKey;

    function setUp() public {
        treasury = address(this);
        usdc = new MockUSDC();
        airtime = new Airtime(address(usdc), treasury);

        userPrivateKey = 0x1234567890123456789012345678901234567890123456789012345678901234;
        user = vm.addr(userPrivateKey);

        usdc.mint(user, 1000 ether);
    }

    function testDepositWithPermit() public {
        uint256 amount = 100 ether;
        uint256 deadline = block.timestamp + 1 hours;
        string memory depositRef = "order-01";

        bytes32 domainSeparator = usdc.DOMAIN_SEPARATOR();
        bytes32 permitTypehash = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(permitTypehash, user, address(airtime), amount, usdc.nonces(user), deadline)
        );
        bytes32 messageHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, messageHash);

        vm.prank(user);
        airtime.depositWithPermit(depositRef, amount, deadline, v, r, s);

        assertEq(usdc.balanceOf(address(airtime)), amount, "Incorrect balance");
    }
}
