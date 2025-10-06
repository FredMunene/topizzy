// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20Permit} from "lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Permit.sol";

contract Airtime is ReentrancyGuard {
    using SafeERC20 for IERC20;

    event OrderPaid(string orderRef, address payer, uint256 amount);
    event Refunded(string orderRef, address receiver, uint256 amount);
    event TreasuryWithdrawal(address receiver, uint256 amount);

    address public treasury;
    uint256 public depositCounter;

    constructor() {
        treasury = msg.sender;
        depositCounter = 0;
    }

    modifier onlyTreasury() {
        require(msg.sender == treasury, "Only treasury");
        _;
    }

    function depositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 depositId) {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        
        // Execute permit for gasless approval
        IERC20Permit(token).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        
        // Transfer tokens from user to contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        depositCounter++;
        emit OrderPaid("orderRef", msg.sender, amount); // TODO: replace orderRef

        return depositCounter;
    }

    function refund(string memory orderRef, address receiver, uint256 amount) external onlyTreasury nonReentrant {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");

        IERC20(address(0)).safeTransfer(receiver, amount); // TODO: replace address(0) with token address

        emit Refunded(orderRef, receiver, amount);
    }

    function withdrawTreasury(address receiver, uint256 amount) external onlyTreasury {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");

        IERC20(address(0)).safeTransfer(receiver, amount); // TODO: replace address(0) with token address

        emit TreasuryWithdrawal(receiver, amount);
    }
}