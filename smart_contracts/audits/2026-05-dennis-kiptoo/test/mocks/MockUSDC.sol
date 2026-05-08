// SPDX-License-Identifier: MIT
// test/mocks/MockUSDC.sol — ERC20 + EIP-2612 permit for testing
pragma solidity ^0.8.13;

import {
    ERC20
} from "lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {
    ERC20Permit
} from "lib/openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MockUSDC is ERC20, ERC20Permit {
    constructor() ERC20("USD Coin", "USDC") ERC20Permit("USD Coin") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    // USDC uses 6 decimals
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
