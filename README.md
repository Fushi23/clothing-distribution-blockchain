# Blockchain Clothing Distribution System (BCDS)

A blockchain web app for distributing donated / reused clothing to people in need.
Suppliers donate **categorized, QR-tagged bundles**; certified NGOs claim them from a
public dashboard and **scan the bag's QR code on arrival** to confirm delivery on-chain.

## Roles

| Role | Who | Can do |
| --- | --- | --- |
| **Admin** | platform authority (deployer) | Approve/reject applications, pause the platform |
| **Supplier** | approved donor | Create donation bundles, print QR labels, cancel unclaimed bundles |
| **NGO** | certified relief org | Claim available bundles, release claims, scan QR to confirm receipt |

Suppliers and NGOs **apply in-app** and must be **approved by the admin** before they can act.

## Workflow

```
apply → admin approves → SUPPLIER creates bundle (gets unique QR)
      → NGO claims bundle → bag delivered physically
      → NGO scans QR → contract verifies hash → status = Delivered
```

The QR encodes `bcds:<bundleId>:<qrHash>`. `confirmReceipt` only succeeds when the scanned
hash matches the on-chain hash for the bundle assigned to that NGO — the cryptographic proof
that the correct bag arrived.

## Project layout

```
contracts/ClothingDistribution.sol   the smart contract
test/BCDS_Testing.ts                 20 integration tests
ignition/modules/ClothingDistribution.ts   deployment module
scripts/export-frontend.mjs          writes ABI + address into the frontend
scripts/seed-local.mjs               seeds demo accounts + sample bundles
frontend-react/                      React + Vite + ethers + MetaMask dapp
```

## Running locally

You need **4 terminals** (or run the node/build in the background).

```bash
# 0. install (once)
npm install
cd frontend-react && npm install && cd ..

# 1. start a local chain  (terminal A — leave running)
npx hardhat node

# 2. compile + deploy + wire the frontend + seed demo data  (terminal B)
npx hardhat compile
npx hardhat ignition deploy ignition/modules/ClothingDistribution.ts --network localhost
node scripts/export-frontend.mjs   # writes frontend-react/src/contract.js
node scripts/seed-local.mjs        # optional: demo supplier, NGO, 3 bundles

# 3. run the frontend  (terminal C)
cd frontend-react && npm run dev
```

Then in the browser:

1. Add the Hardhat network to MetaMask (RPC `http://127.0.0.1:8545`, chain id `31337`) and
   import a dev account private key (printed by `hardhat node`).
   - Account #0 = admin, #1 = supplier (seeded), #2 = NGO (seeded).
2. Connect the wallet — the UI shows panels for whatever role(s) your address holds.
3. New addresses see an **Apply for access** panel; approve them from the admin account.

## Testing

```bash
npx hardhat test            # all tests
npx hardhat test solidity   # Solidity unit tests only
```

## Notes

- Claiming is **free** (gas only) — there is no payment/escrow; this is relief distribution.
- QR scanning uses the device camera (needs camera permission) with a manual-paste fallback.
- `getAllBundles` / `getAllApplicants` return full arrays for simple demo-scale dashboards;
  for production scale you'd paginate or index events off-chain instead.
