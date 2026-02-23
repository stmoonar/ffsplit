export const SPLIT_VAULT_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_oracle",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AlreadySettled",
    type: "error",
  },
  {
    inputs: [],
    name: "NoAgents",
    type: "error",
  },
  {
    inputs: [],
    name: "NoPayment",
    type: "error",
  },
  {
    inputs: [],
    name: "OnlyOracle",
    type: "error",
  },
  {
    inputs: [],
    name: "SharesLengthMismatch",
    type: "error",
  },
  {
    inputs: [],
    name: "SharesSumInvalid",
    type: "error",
  },
  {
    inputs: [],
    name: "SplitAlreadySubmitted",
    type: "error",
  },
  {
    inputs: [],
    name: "SplitNotSubmitted",
    type: "error",
  },
  {
    inputs: [],
    name: "TaskAlreadyExists",
    type: "error",
  },
  {
    inputs: [],
    name: "TaskNotFound",
    type: "error",
  },
  {
    inputs: [],
    name: "TransferFailed",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "address[]",
        name: "agents",
        type: "address[]",
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "payouts",
        type: "uint256[]",
      },
    ],
    name: "Settled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "shares",
        type: "uint256[]",
      },
    ],
    name: "SplitSubmitted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address[]",
        name: "agents",
        type: "address[]",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256",
      },
    ],
    name: "TaskCreated",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
      {
        internalType: "address[]",
        name: "agents",
        type: "address[]",
      },
    ],
    name: "createTask",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
    ],
    name: "getTask",
    outputs: [
      {
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        internalType: "address[]",
        name: "agents",
        type: "address[]",
      },
      {
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256",
      },
      {
        internalType: "uint256[]",
        name: "shares",
        type: "uint256[]",
      },
      {
        internalType: "bool",
        name: "splitSubmitted",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "settled",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "oracle",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
    ],
    name: "settle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
      {
        internalType: "uint256[]",
        name: "shares",
        type: "uint256[]",
      },
    ],
    name: "submitSplit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "taskCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "taskIds",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "tasks",
    outputs: [
      {
        internalType: "bytes32",
        name: "taskId",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "splitSubmitted",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "settled",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
