// Seeds the locally-deployed contract with demo data so the dashboard is
// populated. Requires a running `npx hardhat node` and a completed deploy.
//
//   node scripts/seed-local.mjs
//
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const artifact = JSON.parse(
  fs.readFileSync(
    path.join(root, "artifacts/contracts/ClothingDistribution.sol/ClothingDistribution.json"),
    "utf8"
  )
);
const deployed = JSON.parse(
  fs.readFileSync(path.join(root, "ignition/deployments/chain-31337/deployed_addresses.json"), "utf8")
);
const address = deployed[Object.keys(deployed).find((k) => k.includes("ClothingDistribution"))];

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

// Well-known Hardhat dev accounts. NonceManager avoids the provider's
// getTransactionCount cache when firing sequential txs.
const admin = new ethers.NonceManager(
  new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider)
);
const supplier = new ethers.NonceManager(
  new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider)
);
const ngo = new ethers.Wallet(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  provider
);

const SUPPLIER_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const NGO_ADDR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const Category = { Shirts: 0, Pants: 1, Shoes: 2, Jackets: 3, Accessories: 4, Other: 5 };
const Condition = { New: 0, Good: 1, Fair: 2 };
const ApplicantType = { Supplier: 1, NGO: 2 };

const asAdmin = new ethers.Contract(address, artifact.abi, admin);
const asSupplier = new ethers.Contract(address, artifact.abi, supplier);

console.log("Seeding contract at", address);

let tx = await asAdmin.registerParticipant(SUPPLIER_ADDR, ApplicantType.Supplier);
await tx.wait();
console.log("  approved supplier:", SUPPLIER_ADDR);

tx = await asAdmin.registerParticipant(NGO_ADDR, ApplicantType.NGO);
await tx.wait();
console.log("  approved NGO:", NGO_ADDR);

const samples = [
  [Category.Shirts, Condition.Good, 150, "Assorted cotton t-shirts", "Warehouse KL, Bay 3"],
  [Category.Jackets, Condition.New, 60, "Children winter coats", "Penang Depot"],
  [Category.Shoes, Condition.Fair, 80, "Mixed adult sneakers", "Johor Collection Point"],
];
for (const s of samples) {
  tx = await asSupplier.createBundle(...s);
  await tx.wait();
}
console.log(`  created ${samples.length} sample bundles`);
console.log("Done. Connect MetaMask as account #0 (admin), #1 (supplier) or #2 (NGO).");
