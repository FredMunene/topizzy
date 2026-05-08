// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20Permit} from "lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Permit.sol";

/// @title Airtime
/// @notice USDC escrow contract for Topizzy airtime top-ups on Base.
///         Users deposit USDC which is held in escrow while the off-chain backend
///         (Africa's Talking API) fulfils the airtime order. On failure the operator
///         issues an on-chain refund.
/// @dev Two privileged roles with distinct responsibilities:
///      - treasury: Gnosis Safe 2-of-3 multisig. Controls withdrawTreasury() only.
///        Withdrawals require 2 signers — a single key cannot drain the contract.
///      - operator: backend hot wallet. Controls refund() only.
///        Blast radius is bounded by on-chain accounting — a compromised operator key
///        can only return funds to their original payers, never steal or over-refund.
/// @dev USDC only (Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913).
///      Risk: Circle can blacklist this contract or pause USDC globally,
///      rendering all funds permanently inaccessible. Mitigate by keeping
///      contract balance low via frequent treasury withdrawals.
contract Airtime is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice On-chain record of a single deposit order.
    /// @dev Keyed by keccak256(abi.encodePacked(depositRef, payer)) in the `orders` mapping.
    struct OrderRecord {
        /// @dev Address that made the deposit — only this address can receive a refund.
        address payer;
        /// @dev USDC amount deposited in token units (6 decimals). Refund cannot exceed this.
        uint256 amount;
        /// @dev True once refund() has been called for this order. Prevents double-refund.
        bool    settled;
    }

    /// @notice Emitted on every successful deposit.
    /// @param orderRef  Off-chain order reference string supplied by the caller.
    /// @param orderHash keccak256(abi.encodePacked(orderRef, payer)) — the mapping key.
    /// @param payer     Address that deposited the USDC.
    /// @param amount    USDC amount deposited (6 decimals).
    event OrderPaid(string orderRef, bytes32 indexed orderHash, address indexed payer, uint256 amount);

    /// @notice Emitted when the operator refunds a failed order.
    /// @param orderRef  Off-chain order reference that was refunded.
    /// @param receiver  Address that received the refund.
    /// @param amount    USDC amount refunded (6 decimals).
    event Refunded(string orderRef, address indexed receiver, uint256 amount);

    /// @notice Emitted when the treasury withdraws accumulated revenue.
    /// @param receiver  Address that received the withdrawal.
    /// @param amount    USDC amount withdrawn (6 decimals).
    event TreasuryWithdrawal(address indexed receiver, uint256 amount);

    /// @notice USDC token contract on Base (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913).
    address public immutable usdcToken;

    /// @notice Gnosis Safe 2-of-3 multisig. Only address permitted to call withdrawTreasury().
    address public immutable treasury;

    /// @notice Backend hot wallet. Only address permitted to call refund().
    address public immutable operator;

    /// @notice Maximum byte length of a depositRef / orderRef string.
    /// @dev Backend generates refs with nanoid(8) — 8 ASCII chars = 8 bytes.
    ///      Capped at 16 to bound calldata cost and prevent griefing via oversized strings.
    uint256 public constant MAX_REF_LENGTH = 16;

    /// @notice On-chain record for each deposit, keyed by keccak256(orderRef, payer).
    mapping(bytes32 => OrderRecord) public orders;

    /// @notice Deploy the Airtime escrow contract.
    /// @param _ERC20TokenAddress USDC token address. Must implement EIP-2612 permit.
    /// @param _treasury          Gnosis Safe 2-of-3 address that will call withdrawTreasury().
    /// @param _operator          Backend hot wallet address that will call refund().
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

    /// @notice Deposit USDC using an EIP-2612 permit signature — no prior approval transaction needed.
    /// @dev Gracefully handles permit front-running: if the permit nonce was already consumed by
    ///      a front-runner, execution falls through to check the existing allowance and proceeds
    ///      if it is sufficient. This prevents griefing without compromising security.
    /// @param depositRef Off-chain order reference generated by the backend (nanoid, max 16 bytes).
    ///                   Must be non-empty and unique per caller — duplicate (ref, caller) pairs revert.
    /// @param amount     USDC amount to deposit in token units (6 decimals). Must be > 0.
    /// @param deadline   Unix timestamp after which the permit signature expires.
    /// @param v          Permit signature component v.
    /// @param r          Permit signature component r.
    /// @param s          Permit signature component s.
    /// @return orderHash keccak256(abi.encodePacked(depositRef, msg.sender)) — the orders mapping key.
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
        require(bytes(depositRef).length > 0, "Empty reference");
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

    /// @notice Deposit USDC using a standard ERC20 approval.
    /// @dev Use this for wallets that cannot sign EIP-2612 permits (e.g. Coinbase Smart Wallet,
    ///      Gnosis Safe, hardware wallets without permit support). Caller must call
    ///      `usdc.approve(airtimeAddress, amount)` in a prior transaction.
    /// @param depositRef Off-chain order reference generated by the backend (nanoid, max 16 bytes).
    ///                   Must be non-empty and unique per caller — duplicate (ref, caller) pairs revert.
    /// @param amount     USDC amount to deposit in token units (6 decimals). Must be > 0.
    /// @return orderHash keccak256(abi.encodePacked(depositRef, msg.sender)) — the orders mapping key.
    function deposit(string memory depositRef, uint256 amount) external nonReentrant returns (bytes32 orderHash) {
        // Checks
        require(amount > 0, "Amount must be > 0");
        require(bytes(depositRef).length > 0, "Empty reference");
        require(bytes(depositRef).length <= MAX_REF_LENGTH, "Reference too long");
        orderHash = keccak256(abi.encodePacked(depositRef, msg.sender));
        require(orders[orderHash].amount == 0, "Order already exists");

        // Effects — state written before external call (CEI)
        orders[orderHash] = OrderRecord({payer: msg.sender, amount: amount, settled: false});

        // Interactions
        IERC20(usdcToken).safeTransferFrom(msg.sender, address(this), amount);

        emit OrderPaid(depositRef, orderHash, msg.sender, amount);
    }

    /// @notice Refund a user whose airtime order failed. Callable by the operator only.
    /// @dev Each order can be refunded at most once (`settled` flag). Refund amount is
    ///      capped at the original deposit amount — the operator cannot over-refund.
    ///      State is updated before the transfer to satisfy the CEI pattern.
    /// @param orderRef  Off-chain order reference — must match the ref used in the original deposit.
    /// @param receiver  Address of the original depositor. Must match orders[orderHash].payer.
    /// @param amount    USDC amount to refund (6 decimals). Must be <= the original deposit amount.
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

    /// @notice Withdraw accumulated USDC revenue to the treasury. Callable by the treasury only.
    /// @dev No per-transaction cap — the Gnosis Safe 2-of-3 quorum is the spending control.
    ///      Keep contract balance low by withdrawing frequently to limit blast radius of any
    ///      future vulnerability.
    /// @param receiver Address to send the USDC to. Typically the treasury Safe itself.
    /// @param amount   USDC amount to withdraw (6 decimals). Must be > 0.
    function withdrawTreasury(address receiver, uint256 amount) external onlyTreasury nonReentrant {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");

        IERC20(usdcToken).safeTransfer(receiver, amount);

        emit TreasuryWithdrawal(receiver, amount);
    }
}
