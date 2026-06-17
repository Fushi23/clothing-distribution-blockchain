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

## Prerequisites

Install these once before running the project:

- **Node.js** 20+ (includes `npm`) — https://nodejs.org
- **MetaMask** browser extension — https://metamask.io
- A Chromium-based browser (Chrome/Edge/Brave) or Firefox for the dapp.

> This is a **local blockchain demo**. No real cryptocurrency is involved — everything runs
> on a throwaway chain on your own computer.

## Running locally

You need **2–3 terminals**. Run them from the project root unless noted.

```bash
# 0. install dependencies (once)
npm install
cd frontend-react && npm install && cd ..

# 1. start the local blockchain  (terminal A — LEAVE THIS RUNNING)
npm run node            # alias for: npx hardhat node

# 2. deploy + wire the frontend + (optional) demo data  (terminal B)
npm run compile         # npx hardhat compile
npm run deploy:local    # npx hardhat ignition deploy ... --network localhost
node scripts/export-frontend.mjs   # writes frontend-react/src/contract.js (ABI + address)
node scripts/seed-local.mjs        # OPTIONAL: approves a demo supplier + NGO and adds 3 bundles

# 3. run the frontend  (terminal C)
cd frontend-react && npm run dev    # opens on http://localhost:5173
```

Leave terminal A (the node) running the whole time. Each restart of `npm run node` is a
**brand-new empty chain**, so you must re-run the step-2 commands (deploy + export) afterwards.

## MetaMask setup (do this before using the app)

The app talks to the blockchain through MetaMask, so it must be pointed at the local chain
and have a funded account imported. Do these **in order**:

### 1. Add the local Hardhat network
Easiest: open the app in your browser, connect MetaMask, and click the **"Switch to Hardhat
Localhost"** button if it appears — it adds the network automatically.

Or add it manually in MetaMask → **Networks → Add a network → Add manually**:

| Field | Value |
| --- | --- |
| Network name | `Hardhat Localhost` |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

> ⚠️ A common gotcha: MetaMask's built-in "Localhost 8545" network often defaults to chain
> ID **1337**, which is wrong. This project uses **31337** — make sure that's the chain ID.

### 2. Import the dev accounts
When `npm run node` starts, it prints 20 test accounts with their **private keys** (these are
public, fixed Hardhat test keys — **local use only, never put real funds on them**). They are
identical on every machine. Import the ones you want to act as:

| Account | Private key | Role |
| --- | --- | --- |
| #0 | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | **Admin** — automatically the admin because it deploys the contract |
| #1 | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | No role on a fresh chain — *suggested* account to make a Supplier |
| #2 | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | No role on a fresh chain — *suggested* account to make an NGO |

> **Roles are not tied to keys.** On a fresh chain only **#0 (admin)** has a role. #1 and #2
> start with **no role** — they become Supplier/NGO only after the admin approves them (or after
> you run `scripts/seed-local.mjs`, which approves exactly these two). The keys above just tell
> you *which account to import* for each part; the role is granted later, on-chain.

In MetaMask: **account icon → Add account or hardware wallet → Import account → paste a key**.
Rename them (e.g. "BCDS Admin", "BCDS Supplier", "BCDS NGO") so you don't mix them up.
Make sure you're on the **Hardhat Localhost** network — each account should show ~10000 ETH.

### 3. Connect and use
1. In the app, click **Connect MetaMask** and pick an account.
2. The UI shows panels for whatever role that account holds. A brand-new address (incl. your
   own personal MetaMask account) has **no role** and only sees the **"Request platform access"**
   form — apply, then approve it from the Admin account (or run `seed-local.mjs`).
3. Switch accounts in MetaMask to switch roles (refresh the page after switching).

### 4. After restarting the node — reset MetaMask history ⚠️
Whenever you restart `npm run node` (or reset the chain), the chain history starts over, but
MetaMask still remembers the old transaction counts and will throw **"nonce too high"** errors.
Fix it per account:

**MetaMask → Settings → Advanced → "Clear activity tab data"** (newer versions call it
**"Delete activity and nonce data"**) → confirm. Do this for each account you use, then refresh
the app. You do **not** need to re-import accounts or re-add the network.

## Testing

```bash
npx hardhat test            # all tests
npx hardhat test solidity   # Solidity unit tests only
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| App shows **"Could not read contract / could not decode result data"** and all stats are 0 | MetaMask is on the wrong network | Switch to **Hardhat Localhost (chain 31337)** — use the in-app button |
| Red **"Wrong network"** banner | Same as above | Click **Switch to Hardhat Localhost** |
| A transaction "succeeds" but nothing changes on the page | Tx was sent to a chain with no contract (wrong network) | Switch to chain 31337, then retry |
| **"nonce too high"** / **"nonce has already been used"** | Node was restarted; MetaMask has stale history | MetaMask → Settings → Advanced → **Delete activity and nonce data**, then refresh |
| **`EADDRINUSE: address already in use 127.0.0.1:8545`** | A node is already running on that port | Don't start a second one — use the running node. To force-restart: `netstat -ano \| findstr :8545` then `taskkill /PID <pid> /F` |
| Imported account shows **0 ETH** | Wrong network selected | Switch to Hardhat Localhost; balance should show ~10000 ETH |
| Buttons do nothing / no role panels appear | Connected account has no role | Apply in-app and approve from Admin, or run `node scripts/seed-local.mjs` |
| Frontend can't find the contract after a fresh deploy | `contract.js` not regenerated | Run `node scripts/export-frontend.mjs` again |

## Notes

- Claiming is **free** (gas only) — there is no payment/escrow; this is relief distribution.
- QR scanning uses the device camera (needs camera permission) with a manual-paste fallback.
- `getAllBundles` / `getAllApplicants` return full arrays for simple demo-scale dashboards;
  for production scale you'd paginate or index events off-chain instead.
