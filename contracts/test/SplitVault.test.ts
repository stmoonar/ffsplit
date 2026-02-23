import { expect } from "chai";
import { ethers } from "hardhat";
import { SplitVault } from "../typechain-types";

describe("SplitVault", function () {
  let vault: SplitVault;
  let oracle: any, payer: any, planner: any, flight: any, hotel: any;

  const TASK_ID = ethers.id("task-test-001");

  beforeEach(async function () {
    [oracle, payer, planner, flight, hotel] = await ethers.getSigners();

    const SplitVaultFactory = await ethers.getContractFactory("SplitVault");
    vault = await SplitVaultFactory.deploy(oracle.address);
  });

  describe("createTask", function () {
    it("should create a task and lock ETH", async function () {
      const agents = [planner.address, flight.address, hotel.address];
      const payment = ethers.parseEther("0.01");

      await expect(
        vault.connect(payer).createTask(TASK_ID, agents, { value: payment })
      )
        .to.emit(vault, "TaskCreated")
        .withArgs(TASK_ID, payer.address, agents, payment);

      const task = await vault.getTask(TASK_ID);
      expect(task.payer).to.equal(payer.address);
      expect(task.agents).to.deep.equal(agents);
      expect(task.totalAmount).to.equal(payment);
      expect(task.splitSubmitted).to.be.false;
      expect(task.settled).to.be.false;
    });

    it("should revert with no payment", async function () {
      const agents = [planner.address];
      await expect(
        vault.connect(payer).createTask(TASK_ID, agents, { value: 0 })
      ).to.be.revertedWithCustomError(vault, "NoPayment");
    });

    it("should revert with no agents", async function () {
      await expect(
        vault
          .connect(payer)
          .createTask(TASK_ID, [], { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(vault, "NoAgents");
    });

    it("should revert on duplicate taskId", async function () {
      const agents = [planner.address];
      const payment = ethers.parseEther("0.01");
      await vault.connect(payer).createTask(TASK_ID, agents, { value: payment });
      await expect(
        vault.connect(payer).createTask(TASK_ID, agents, { value: payment })
      ).to.be.revertedWithCustomError(vault, "TaskAlreadyExists");
    });
  });

  describe("submitSplit", function () {
    beforeEach(async function () {
      const agents = [planner.address, flight.address, hotel.address];
      await vault
        .connect(payer)
        .createTask(TASK_ID, agents, { value: ethers.parseEther("0.01") });
    });

    it("should accept valid split from oracle", async function () {
      // Shapley: Planner 44%, Flight 29%, Hotel 27%
      const shares = [4417, 2917, 2666]; // sums to 10000
      await expect(vault.connect(oracle).submitSplit(TASK_ID, shares))
        .to.emit(vault, "SplitSubmitted")
        .withArgs(TASK_ID, shares);
    });

    it("should revert if not oracle", async function () {
      await expect(
        vault.connect(payer).submitSplit(TASK_ID, [3333, 3334, 3333])
      ).to.be.revertedWithCustomError(vault, "OnlyOracle");
    });

    it("should revert if shares don't sum to 10000", async function () {
      await expect(
        vault.connect(oracle).submitSplit(TASK_ID, [5000, 3000, 1000])
      ).to.be.revertedWithCustomError(vault, "SharesSumInvalid");
    });

    it("should revert if shares length mismatch", async function () {
      await expect(
        vault.connect(oracle).submitSplit(TASK_ID, [5000, 5000])
      ).to.be.revertedWithCustomError(vault, "SharesLengthMismatch");
    });
  });

  describe("settle", function () {
    const PAYMENT = ethers.parseEther("0.01"); // 10000000000000000 wei

    beforeEach(async function () {
      const agents = [planner.address, flight.address, hotel.address];
      await vault.connect(payer).createTask(TASK_ID, agents, { value: PAYMENT });
      // Planner 44.17%, Flight 29.17%, Hotel 26.66%
      await vault.connect(oracle).submitSplit(TASK_ID, [4417, 2917, 2666]);
    });

    it("should distribute funds according to Shapley split", async function () {
      const plannerBefore = await ethers.provider.getBalance(planner.address);
      const flightBefore = await ethers.provider.getBalance(flight.address);
      const hotelBefore = await ethers.provider.getBalance(hotel.address);

      await expect(vault.settle(TASK_ID)).to.emit(vault, "Settled");

      const plannerAfter = await ethers.provider.getBalance(planner.address);
      const flightAfter = await ethers.provider.getBalance(flight.address);
      const hotelAfter = await ethers.provider.getBalance(hotel.address);

      // Planner: 0.01 ETH * 4417/10000 = 0.004417 ETH
      expect(plannerAfter - plannerBefore).to.equal(
        (PAYMENT * 4417n) / 10000n
      );
      // Flight: 0.01 ETH * 2917/10000 = 0.002917 ETH
      expect(flightAfter - flightBefore).to.equal(
        (PAYMENT * 2917n) / 10000n
      );
      // Hotel gets remainder (avoids rounding dust)
      const expectedHotel =
        PAYMENT - (PAYMENT * 4417n) / 10000n - (PAYMENT * 2917n) / 10000n;
      expect(hotelAfter - hotelBefore).to.equal(expectedHotel);

      // Vault should be empty
      expect(
        await ethers.provider.getBalance(await vault.getAddress())
      ).to.equal(0);
    });

    it("should revert if split not submitted", async function () {
      const newTaskId = ethers.id("task-no-split");
      await vault
        .connect(payer)
        .createTask(newTaskId, [planner.address], {
          value: ethers.parseEther("0.01"),
        });
      await expect(vault.settle(newTaskId)).to.be.revertedWithCustomError(
        vault,
        "SplitNotSubmitted"
      );
    });

    it("should revert on double settle", async function () {
      await vault.settle(TASK_ID);
      await expect(vault.settle(TASK_ID)).to.be.revertedWithCustomError(
        vault,
        "AlreadySettled"
      );
    });
  });
});
