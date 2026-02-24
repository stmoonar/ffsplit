// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title SplitVault - Fair revenue splitting for AI Agent collaboration
/// @notice Locks USDC payment, verifies EIP-712 signed Shapley splits, and executes permissionless settlement
contract SplitVault is EIP712 {
    using ECDSA for bytes32;

    // --- Types ---

    struct Task {
        bytes32 taskId;
        address payer;
        address[] agents;
        uint256 totalAmount;
        uint256[] shares; // basis points (1/10000)
        bool splitSubmitted;
        bool settled;
    }

    // --- Constants ---

    bytes32 public constant SPLIT_TYPEHASH = keccak256(
        "Split(bytes32 taskId,address[] agents,uint256[] shares)"
    );

    // --- State ---

    IERC20 public usdc;
    address public oracle; // Oracle public key for signature verification (not a privileged caller)
    mapping(bytes32 => Task) public tasks;
    bytes32[] public taskIds;

    // --- Events ---

    event TaskCreated(
        bytes32 indexed taskId,
        address indexed payer,
        address[] agents,
        uint256 totalAmount
    );

    event SplitSubmitted(
        bytes32 indexed taskId,
        uint256[] shares
    );

    event Settled(
        bytes32 indexed taskId,
        address[] agents,
        uint256[] payouts
    );

    // --- Errors ---

    error TaskAlreadyExists();
    error TaskNotFound();
    error SplitAlreadySubmitted();
    error AlreadySettled();
    error SharesLengthMismatch();
    error SharesSumInvalid();
    error TransferFailed();
    error NoAgents();
    error NoPayment();
    error InvalidSignature();

    // --- Constructor ---

    constructor(
        address _usdc,
        address _oracle
    ) EIP712("SplitVault", "1") {
        usdc = IERC20(_usdc);
        oracle = _oracle;
    }

    // --- Core Functions ---

    /// @notice Create a task and lock USDC payment
    /// @param taskId Unique task identifier (derived from keccak256(query, sender, nonce))
    /// @param agents Array of agent wallet addresses
    /// @param amount USDC amount to lock (caller must approve this contract first)
    function createTask(
        bytes32 taskId,
        address[] calldata agents,
        uint256 amount
    ) external {
        if (agents.length == 0) revert NoAgents();
        if (amount == 0) revert NoPayment();
        if (tasks[taskId].totalAmount != 0) revert TaskAlreadyExists();

        // Transfer USDC from payer to this contract
        // Check balance before/after to guard against fee-on-transfer tokens
        uint256 balanceBefore = usdc.balanceOf(address(this));
        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        uint256 actualAmount = usdc.balanceOf(address(this)) - balanceBefore;

        tasks[taskId] = Task({
            taskId: taskId,
            payer: msg.sender,
            agents: agents,
            totalAmount: actualAmount,
            shares: new uint256[](0),
            splitSubmitted: false,
            settled: false
        });
        taskIds.push(taskId);

        emit TaskCreated(taskId, msg.sender, agents, actualAmount);
    }

    /// @notice Submit Shapley split and settle in one call — permissionless with EIP-712 signature
    /// @param taskId Task to split and settle
    /// @param shares Array of basis points (must sum to 10000)
    /// @param signature EIP-712 signature from oracle over (taskId, agents, shares)
    function submitSplitAndSettle(
        bytes32 taskId,
        uint256[] calldata shares,
        bytes calldata signature
    ) external {
        Task storage task = tasks[taskId];
        if (task.totalAmount == 0) revert TaskNotFound();
        if (task.splitSubmitted) revert SplitAlreadySubmitted();
        if (shares.length != task.agents.length) revert SharesLengthMismatch();

        // Validate shares sum
        uint256 sum = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            sum += shares[i];
        }
        if (sum != 10000) revert SharesSumInvalid();

        // Verify EIP-712 signature from oracle
        bytes32 structHash = keccak256(abi.encode(
            SPLIT_TYPEHASH,
            taskId,
            keccak256(abi.encodePacked(task.agents)),
            keccak256(abi.encodePacked(shares))
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);
        if (signer != oracle) revert InvalidSignature();

        // Record split
        task.shares = shares;
        task.splitSubmitted = true;
        emit SplitSubmitted(taskId, shares);

        // Settle — distribute USDC to agents
        task.settled = true;
        uint256[] memory payouts = new uint256[](task.agents.length);
        uint256 distributed = 0;

        for (uint256 i = 0; i < task.agents.length; i++) {
            if (i == task.agents.length - 1) {
                // Last agent gets remainder to avoid dust
                payouts[i] = task.totalAmount - distributed;
            } else {
                payouts[i] = (task.totalAmount * task.shares[i]) / 10000;
                distributed += payouts[i];
            }

            bool transferSuccess = usdc.transfer(task.agents[i], payouts[i]);
            if (!transferSuccess) revert TransferFailed();
        }

        emit Settled(taskId, task.agents, payouts);
    }

    // --- View Functions ---

    /// @notice Get task details
    function getTask(bytes32 taskId)
        external
        view
        returns (
            address payer,
            address[] memory agents,
            uint256 totalAmount,
            uint256[] memory shares,
            bool splitSubmitted,
            bool settled
        )
    {
        Task storage task = tasks[taskId];
        return (
            task.payer,
            task.agents,
            task.totalAmount,
            task.shares,
            task.splitSubmitted,
            task.settled
        );
    }

    /// @notice Total number of tasks
    function taskCount() external view returns (uint256) {
        return taskIds.length;
    }

    /// @notice Get EIP-712 domain separator (for off-chain signature construction)
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
