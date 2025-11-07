// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20Permit} from "lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";

contract Airtime is ReentrancyGuard {
    using SafeERC20 for IERC20;

    event OrderPaid(string orderRef, address payer, uint256 amount);
    event Refunded(string orderRef, address receiver, uint256 amount);
    event TreasuryWithdrawal(address receiver, uint256 amount);

    address public treasury;
    uint256 public depositCounter;
    address public immutable usdcToken;  // ERC20 token address (USDC/USDT)
    address public immutable permit2;

    constructor(address _ERC20TokenAddress, address _treasury, address _permit2) {
        require(_ERC20TokenAddress != address(0), "Invalid token address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_permit2 != address(0), "Invalid permit2 address");
        
        usdcToken = _ERC20TokenAddress;
        treasury = _treasury;
        permit2 = _permit2;
        depositCounter = 0;
    }

    modifier onlyTreasury() {
        require(msg.sender == treasury, "Only treasury");
        _;
    }

    function depositWithPermit(
        string memory depositRef,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 depositId) {
        require(amount > 0, "Amount must be > 0");
        
        // Execute permit for gasless approval using stored USDC token
        IERC20Permit(usdcToken).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        
        // Transfer USDC tokens from user to contract
        IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), amount);

        depositCounter++;
        emit OrderPaid(depositRef, msg.sender, amount);

        return depositCounter;
    }

    function depositWithPermit2(
        string memory depositRef,
        IAllowanceTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external nonReentrant returns (uint256 depositId) {
        require(permit.permitted.token == usdcToken, "Invalid permit token");
        require(permit.permitted.amount > 0, "Amount must be > 0");
        require(permit.deadline >= block.timestamp, "Permit expired");

        IAllowanceTransfer.SignatureTransferDetails memory transferDetails =
            IAllowanceTransfer.SignatureTransferDetails({
                to: address(this),
                requestedAmount: permit.permitted.amount
            });

        IAllowanceTransfer(permit2).permitTransferFrom(
            permit,
            transferDetails,
            msg.sender,
            signature
        );

        depositCounter++;
        emit OrderPaid(depositRef, msg.sender, permit.permitted.amount);

        return depositCounter;
    }

    function deposit(
        string memory depositRef,
        uint256 amount
    ) external nonReentrant returns (uint256 depositId) {
        require(amount > 0, "Amount must be > 0");
        
        // Transfer USDC tokens from user to contract (requires prior approval)
        IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), amount);

        depositCounter++;
        emit OrderPaid(depositRef, msg.sender, amount);

        return depositCounter;
    }

    function refund(string memory orderRef, address receiver, uint256 amount) external onlyTreasury nonReentrant {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");

        IERC20(usdcToken).safeTransfer(receiver, amount);

        emit Refunded(orderRef, receiver, amount);
    }

    function withdrawTreasury(address receiver, uint256 amount) external onlyTreasury {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");

        IERC20(usdcToken).safeTransfer(receiver, amount);

        emit TreasuryWithdrawal(receiver, amount);
    }
}
