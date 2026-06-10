import { ethers } from "ethers";

async function main() {
  // Connect directly to your local running blockchain node via standard RPC url
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // Load the default mock accounts pre-funded by 'npx hardhat node'
  // In ethers v6, we get the signers explicitly using getSigner loop
  const accounts = await provider.listAccounts();
  const admin = await provider.getSigner(accounts[0].address);     // Account #0 Signer
  const supplier = await provider.getSigner(accounts[1].address);  // Account #1 Signer

  console.log("\n=================================================");
  console.log("  Blockchain Clothing Distribution System (BCDS)");
  console.log("=================================================\n");

  console.log("Connected Wallets:");
  console.log(`Admin     : ${admin.address}`);
  console.log(`Supplier  : ${supplier.address}\n`);

  // Hardcoded Contract Minimal ABI to run functions independently
  const abi = [
    "function addSupplier(address _supplier) external",
    "function tokenizeClothing(string memory _garmentProfile, uint8 _condition, string memory _gpsProvenance) external",
    "function getClothingItem(uint256 _itemId) external view returns (tuple(uint256 id, address supplier, string garmentProfile, uint8 condition, string gpsProvenance, bool isAllocated))"
  ];

  const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  // Attach signing instances directly
  const adminContract = new ethers.Contract(CONTRACT_ADDRESS, abi, admin);
  const supplierContract = new ethers.Contract(CONTRACT_ADDRESS, abi, supplier);

  console.log("Connecting to deployed BCDS contract...");
  console.log(`Contract Address: ${CONTRACT_ADDRESS}\n`);

  // =========================================================
  // AUTHORIZE SUPPLIER ROLE
  // =========================================================
  console.log("-------------------------------------------------");
  console.log("STEP 1 — Grant Supplier Authorization");
  console.log("-------------------------------------------------");

  const supplierRoleTx = await adminContract.addSupplier(supplier.address);
  await supplierRoleTx.wait();
  console.log("Supplier successfully authorized.\n");

  // =========================================================
  // TOKENIZE CLOTHING ITEM
  // =========================================================
  console.log("-------------------------------------------------");
  console.log("STEP 2 — Tokenize Emergency Clothing Inventory");
  console.log("-------------------------------------------------");

  const tokenizeTx = await supplierContract.tokenizeClothing(
    "Heavy Winter Blanket & Cargo Pants Bundle",
    0, // ConditionTier.Mint
    "Warehouse_Kuala_Lumpur_GPS_2.31"
  );
  const receipt = await tokenizeTx.wait();

  console.log("Inventory tokenized successfully.");
  console.log(`Transaction Hash: ${receipt.hash}\n`);

  // =========================================================
  // READ BLOCKCHAIN STATE
  // =========================================================
  console.log("-------------------------------------------------");
  console.log("STEP 3 — Read Live Blockchain State");
  console.log("-------------------------------------------------");

  const item = await adminContract.getClothingItem(1);

  console.log("Digital Twin Information:\n");
  console.log(`Item ID            : ${item[0]}`);
  console.log(`Garment Profile    : ${item[2]}`);
  console.log(`Supplier Address   : ${item[1]}`);
  console.log(`GPS Provenance     : ${item[4]}`);
  console.log(`Allocation Status  : ${item[5] ? "Allocated / Locked" : "Available in Inventory Hub"}\n`);

  console.log("=================================================");
  console.log("      BCDS Workflow Execution Complete");
  console.log("=================================================\n");
}

main().catch((error) => {
  console.error("\nExecution Failed:");
  console.error(error);
  process.exitCode = 1;
});