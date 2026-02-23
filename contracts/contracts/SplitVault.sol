// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SplitVault - Fair revenue splitting for AI Agent collaboration
/// @notice Locks payment, accepts Shapley-based split ratios from Oracle, and executes settlement
contract SplitVault {
    // --- Types ---

    struct Task {
        bytes32 taskId;
        address payer;
        address[] agents;
        uint256 totalAmount;
        uint256[] shares; // basis points (1/10000), set by Oracle
        bool splitSubmitted;
        bool settled;
    }

    // --- State ---

    address public oracle;
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

    error OnlyOracle();
    error TaskAlreadyExists();
    error TaskNotFound();
    error SplitAlreadySubmitted();
    error SplitNotSubmitted();
    error AlreadySettled();
    error SharesLengthMismatch();
    error SharesSumInvalid();
    error TransferFailed();
    error NoAgents();
    error NoPayment();

    // --- Modifiers ---

    modifier onlyOracle() {
        if (msg.sender != oracle) revert OnlyOracle();
        _;
    }

    // --- Constructor ---

    constructor(address _oracle) {
        oracle = _oracle;
    }

    // --- Core Functions ---

    /// @notice Create a task and lock ETH payment
    /// @param taskId Unique task identifier
    /// @param agents Array of agent wallet addresses
    function createTask(
        bytes32 taskId,
        address[] calldata agents
    ) external payable {
        if (agents.length == 0) revert NoAgents();
        if (msg.value == 0) revert NoPayment();
        if (tasks[taskId].totalAmount != 0) revert TaskAlreadyExists();

        tasks[taskId] = Task({
            taskId: taskId,
            payer: msg.sender,
            agents: agents,
            totalAmount: msg.value,
            shares: new uint256[](0),
            splitSubmitted: false,
            settled: false
        });
        taskIds.push(taskId);

        emit TaskCreated(taskId, msg.sender, agents, msg.value);
    }

    /// @notice Oracle submits Shapley-based split ratios
    /// @param taskId Task to split
    /// @param shares Array of basis points (must sum to 10000)
    function submitSplit(
        bytes32 taskId,
        uint256[] calldata shares
    ) external onlyOracle {
        Task storage task = tasks[taskId];
        if (task.totalAmount == 0) revert TaskNotFound();
        if (task.splitSubmitted) revert SplitAlreadySubmitted();
        if (shares.length != task.agents.length) revert SharesLengthMismatch();

        uint256 sum = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            sum += shares[i];
        }
        if (sum != 10000) revert SharesSumInvalid();

        task.shares = shares;
        task.splitSubmitted = true;

        emit SplitSubmitted(taskId, shares);
    }

    /// @notice Anyone can trigger settlement after split is submitted
    /// @param taskId Task to settle
    function settle(bytes32 taskId) external {
        Task storage task = tasks[taskId];
        if (task.totalAmount == 0) revert TaskNotFound();
        if (!task.splitSubmitted) revert SplitNotSubmitted();
        if (task.settled) revert AlreadySettled();

        task.settled = true;

        uint256[] memory payouts = new uint256[](task.agents.length);
        uint256 remaining = task.totalAmount;

        for (uint256 i = 0; i < task.agents.length; i++) {
            if (i == task.agents.length - 1) {
                // Last agent gets remainder to avoid rounding dust
                payouts[i] = remaining;
            } else {
                payouts[i] = (task.totalAmount * task.shares[i]) / 10000;
                remaining -= payouts[i];
            }

            (bool success, ) = task.agents[i].call{value: payouts[i]}("");
            if (!success) revert TransferFailed();
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
}
