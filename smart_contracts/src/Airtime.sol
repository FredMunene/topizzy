// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20Permit} from "lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Permit.sol";

/// @notice Escrow contract for Topizzy airtime purchases on Base.
/// @dev Two privileged roles with distinct responsibilities:
///      - treasury: Gnosis Safe 2-of-3 multisig. Controls withdrawTreasury() only.
///        Withdrawals require 2 signers — a single key cannot drain the contract.
///      - operator: backend hot wallet. Controls refund() only.
///        Blast radius is bounded by C-01 accounting — a compromised operator key
///        can only return funds to their original payers, never steal or over-refund.
/// @dev USDC only (Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913).
///      Risk: Circle can blacklist this contract or pause USDC globally,
///      rendering all funds permanently inaccessible. Mitigate by keeping
///      contract balance low via frequent treasury withdrawals.
contract Airtime is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct OrderRecord {
        address payer;
        uint256 amount;
        bool    settled;
    }

    event OrderPaid(string orderRef, bytes32 indexed orderHash, address indexed payer, uint256 amount);
    event Refunded(string orderRef, address indexed receiver, uint256 amount);
    event TreasuryWithdrawal(address indexed receiver, uint256 amount);

    /// @dev USDC token address on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    address public immutable usdcToken;
    /// @dev Gnosis Safe 2-of-3 multisig — controls withdrawTreasury() only
    address public immutable treasury;
    /// @dev Backend hot wallet — controls refund() only
    address public immutable operator;

    uint256 public constant MAX_REF_LENGTH = 16;

    mapping(bytes32 => OrderRecord) public orders;

    constructor(address _ERC20TokenAddress, address _treasury, address _operator) {
        require(_ERC20TokenAddress != address(0), "Invalid token address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_operator != address(0), "Invalid operator address");

        // Verify token supports EIP-2612 at deploy time — reverts if not implemented
        IERC20Permit(_ERC20TokenAddress).DOMAIN_SEPARATOR();

        usdcToken = _ERC20TokenAddress;
        treasury = _treasury;
        operator = _operator;
    }

    modifier onlyTreasury() {
        require(msg.sender == treasury, "Only treasury");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Only operator");
        _;
    }

    function depositWithPermit(
        string memory depositRef,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (bytes32 orderHash) {
        // Checks
        require(amount > 0, "Amount must be > 0");
        require(bytes(depositRef).length <= MAX_REF_LENGTH, "Reference too long");
        orderHash = keccak256(abi.encodePacked(depositRef, msg.sender));
        require(orders[orderHash].amount == 0, "Order already exists");

        // Effects — state written before external calls (CEI)
        orders[orderHash] = OrderRecord({payer: msg.sender, amount: amount, settled: false});

        // Interactions
        // If permit was front-run the nonce is already consumed but allowance is set — fall through
        try IERC20Permit(usdcToken).permit(msg.sender, address(this), amount, deadline, v, r, s)
        {} catch {
            uint256 currentAllowance = IERC20(usdcToken).allowance(msg.sender, address(this));
            require(currentAllowance >= amount, "Permit failed and insufficient allowance");
        }
        IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), amount);

        emit OrderPaid(depositRef, orderHash, msg.sender, amount);
    }

    /// @notice Standard deposit for wallets that cannot sign EIP-2612 permits
    ///         (e.g. smart contract wallets, Coinbase Smart Wallet). Requires prior ERC20 approval.
    function deposit(string memory depositRef, uint256 amount) external nonReentrant returns (bytes32 orderHash) {
        // Checks
        require(amount > 0, "Amount must be > 0");
        require(bytes(depositRef).length <= MAX_REF_LENGTH, "Reference too long");
        orderHash = keccak256(abi.encodePacked(depositRef, msg.sender));
        require(orders[orderHash].amount == 0, "Order already exists");

        // Effects — state written before external call (CEI)
        orders[orderHash] = OrderRecord({payer: msg.sender, amount: amount, settled: false});

        // Interactions
        IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), amount);

        emit OrderPaid(depositRef, orderHash, msg.sender, amount);
    }

    /// @notice Called by the backend operator when an airtime order fails.
    function refund(string memory orderRef, address receiver, uint256 amount) external onlyOperator nonReentrant {
        // Checks
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");
        require(bytes(orderRef).length <= MAX_REF_LENGTH, "Reference too long");
        bytes32 orderHash = keccak256(abi.encodePacked(orderRef, receiver));
        require(orders[orderHash].payer == receiver, "Order not found for receiver");
        require(!orders[orderHash].settled, "Order already settled");
        require(amount <= orders[orderHash].amount, "Refund exceeds deposit");

        // Effects — mark settled before transfer (CEI)
        orders[orderHash].settled = true;

        // Interactions
        IERC20(usdcToken).safeTransfer(receiver, amount);

        emit Refunded(orderRef, receiver, amount);
    }

    /// @notice Called by the Gnosis Safe treasury to collect settled revenue.
    function withdrawTreasury(address receiver, uint256 amount) external onlyTreasury nonReentrant {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");

        IERC20(usdcToken).safeTransfer(receiver, amount);

        emit TreasuryWithdrawal(receiver, amount);
    }
}
