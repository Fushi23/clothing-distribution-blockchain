import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  // Connect directly to your running local blockchain server node
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  // Get Account #0 to act as the contract Deployer / Owner
  const accounts = await provider.listAccounts();
  const deployer = await provider.getSigner(accounts[0].address);

  console.log("\n=================================================");
  console.log("       BCDS Smart Contract Deployment Hub");
  console.log("=================================================\n");
  console.log(`Deploying contract using account: ${deployer.address}`);

  // Path to your compiled contract artifacts file based on your sidebar image
  const artifactPath = path.resolve("./artifacts/contracts/ClothingDistribution.sol/ClothingDistribution.json");
  
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Compiled contract artifacts not found! Run 'npx hardhat compile' first.");
  }

  const contractArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = contractArtifact.abi;
  const bytecode = contractArtifact.bytecode;

  // Create a Contract Factory instance using native ethers
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);

  console.log("Sending deployment transaction to local ledger...");
  const contract = await factory.deploy();
  
  console.log("Waiting for block tracking confirmation...");
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log("\n=================================================");
  console.log(` 🎉 SUCCESS: BCDS Contract Deployed Successfully!`);
  console.log(` Contract Address: ${deployedAddress}`);
  console.log("=================================================\n");
}

main().catch((error) => {
  console.error("\nDeployment Failed:");
  console.error(error);
  process.exitCode = 1;
});