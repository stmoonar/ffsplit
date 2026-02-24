import { expect } from "chai";
import { ethers } from "hardhat";
import { SplitVault, MockUSDC } from "../typechain-types";

describe("SplitVault", function () {
  let vault: SplitVault;
  let usdc: MockUSDC;
  let oracle: any, payer: any, planner: any, flight: any, hotel: any;

  const TASK_ID = ethers.id("task-test-001");
  const PAYMENT = 10_000_000n; // 10 USDC (6 decimals)

  async function signSplit(
    signer: any,
    vaultAddress: string,
    taskId: string,
    agents: string[],
    shares: bigint[]
  ): Promise<string> {
    const domain = {
      name: "SplitVault",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: vaultAddress,
    };

    const types = {
      Split: [
        { name: "taskId", type: "bytes32" },
        { name: "agents", type: "address[]" },
        { name: "shares", type: "uint256[]" },
      ],
    };

    const value = { taskId, agents, shares };

    return signer.signTypedData(domain, types, value);
  }

  beforeEach(async function () {
    [oracle, payer, planner, flight, hotel] = await ethers.getSigners();

    // Deploy MockUSDC and mint to payer
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy(payer.address);

    // Deploy SplitVault with USDC and oracle
    const SplitVaultFactory = await ethers.getContractFactory("SplitVault");
    vault = await SplitVaultFactory.deploy(
      await usdc.getAddress(),
      oracle.address
    );

    // Payer approves vault to spend USDC
    await usdc
      .connect(payer)
      .approve(await vault.getAddress(), ethers.MaxUint256);
  });

  describe("createTask", function () {
    it("should create a task and lock USDC", async function () {
      const agents = [planner.address, flight.address, hotel.address];

      await expect(
        vault.connect(payer).createTask(TASK_ID, agents, PAYMENT)
      )
        .to.emit(vault, "TaskCreated")
        .withArgs(TASK_ID, payer.address, agents, PAYMENT);

      const task = await vault.getTask(TASK_ID);
      expect(task.payer).to.equal(payer.address);
      expect(task.agents).to.deep.equal(agents);
      expect(task.totalAmount).to.equal(PAYMENT);
      expect(task.splitSubmitted).to.be.false;
      expect(task.settled).to.be.false;

      // USDC transferred to vault
      expect(await usdc.balanceOf(await vault.getAddress())).to.equal(PAYMENT);
    });

    it("should revert with no payment", async function () {
      const agents = [planner.address];
      await expect(
        vault.connect(payer).createTask(TASK_ID, agents, 0)
      ).to.be.revertedWithCustomError(vault, "NoPayment");
    });

    it("should revert with no agents", async function () {
      await expect(
        vault.connect(payer).createTask(TASK_ID, [], PAYMENT)
      ).to.be.revertedWithCustomError(vault, "NoAgents");
    });

    it("should revert on duplicate taskId", async function () {
      const agents = [planner.address];
      await vault.connect(payer).createTask(TASK_ID, agents, PAYMENT);
      await expect(
        vault.connect(payer).createTask(TASK_ID, agents, PAYMENT)
      ).to.be.revertedWithCustomError(vault, "TaskAlreadyExists");
    });
  });

  describe("submitSplitAndSettle", function () {
    const agents: string[] = [];

    beforeEach(async function () {
      agents.length = 0;
      agents.push(planner.address, flight.address, hotel.address);
      await vault.connect(payer).createTask(TASK_ID, agents, PAYMENT);
    });

    it("should accept valid EIP-712 signed split and settle", async function () {
      const shares = [4417n, 2917n, 2666n]; // sums to 10000

      const signature = await signSplit(
        oracle,
        await vault.getAddress(),
        TASK_ID,
        agents,
        shares
      );

      const plannerBefore = await usdc.balanceOf(planner.address);
      const flightBefore = await usdc.balanceOf(flight.address);
      const hotelBefore = await usdc.balanceOf(hotel.address);

      await expect(
        vault.submitSplitAndSettle(TASK_ID, shares, signature)
      )
        .to.emit(vault, "SplitSubmitted")
        .to.emit(vault, "Settled");

      const plannerAfter = await usdc.balanceOf(planner.address);
      const flightAfter = await usdc.balanceOf(flight.address);
      const hotelAfter = await usdc.balanceOf(hotel.address);

      // Planner: 10 USDC * 4417/10000 = 4.417 USDC = 4_417_000 units
      expect(plannerAfter - plannerBefore).to.equal(
        (PAYMENT * 4417n) / 10000n
      );
      // Flight: 10 USDC * 2917/10000 = 2.917 USDC
      expect(flightAfter - flightBefore).to.equal(
        (PAYMENT * 2917n) / 10000n
      );
      // Hotel gets remainder (avoids dust)
      const expectedHotel =
        PAYMENT - (PAYMENT * 4417n) / 10000n - (PAYMENT * 2917n) / 10000n;
      expect(hotelAfter - hotelBefore).to.equal(expectedHotel);

      // Vault should be empty
      expect(await usdc.balanceOf(await vault.getAddress())).to.equal(0);
    });

    it("should revert with invalid signature (wrong signer)", async function () {
      const shares = [3333n, 3334n, 3333n];

      // payer signs instead of oracle — should fail
      const signature = await signSplit(
        payer,
        await vault.getAddress(),
        TASK_ID,
        agents,
        shares
      );

      await expect(
        vault.submitSplitAndSettle(TASK_ID, shares, signature)
      ).to.be.revertedWithCustomError(vault, "InvalidSignature");
    });

    it("should revert if shares don't sum to 10000", async function () {
      const shares = [5000n, 3000n, 1000n];
      const signature = await signSplit(
        oracle,
        await vault.getAddress(),
        TASK_ID,
        agents,
        shares
      );

      await expect(
        vault.submitSplitAndSettle(TASK_ID, shares, signature)
      ).to.be.revertedWithCustomError(vault, "SharesSumInvalid");
    });

    it("should revert if shares length mismatch", async function () {
      const shares = [5000n, 5000n];
      const signature = await signSplit(
        oracle,
        await vault.getAddress(),
        TASK_ID,
        agents,
        shares
      );

      await expect(
        vault.submitSplitAndSettle(TASK_ID, shares, signature)
      ).to.be.revertedWithCustomError(vault, "SharesLengthMismatch");
    });

    it("should revert on double settlement", async function () {
      const shares = [3333n, 3334n, 3333n];
      const signature = await signSplit(
        oracle,
        await vault.getAddress(),
        TASK_ID,
        agents,
        shares
      );

      await vault.submitSplitAndSettle(TASK_ID, shares, signature);

      await expect(
        vault.submitSplitAndSettle(TASK_ID, shares, signature)
      ).to.be.revertedWithCustomError(vault, "SplitAlreadySubmitted");
    });

    it("should allow anyone to call submitSplitAndSettle (permissionless)", async function () {
      const shares = [3333n, 3334n, 3333n];
      const signature = await signSplit(
        oracle,
        await vault.getAddress(),
        TASK_ID,
        agents,
        shares
      );

      // hotel (random third party) submits — should succeed
      await expect(
        vault.connect(hotel).submitSplitAndSettle(TASK_ID, shares, signature)
      ).to.emit(vault, "Settled");
    });
  });
});
