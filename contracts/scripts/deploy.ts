import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // For demo: deployer is also the oracle
  const oracleAddress = deployer.address;

  // Deploy MockUSDC first
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(deployer.address);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // Deploy SplitVault with USDC and Oracle addresses
  const SplitVault = await ethers.getContractFactory("SplitVault");
  const vault = await SplitVault.deploy(usdcAddress, oracleAddress);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log("SplitVault deployed to:", address);
  console.log("Oracle address:", oracleAddress);

  // Log for easy copy-paste into .env
  console.log("\n--- Add to .env.local ---");
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log(`ORACLE_ADDRESS=${oracleAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
