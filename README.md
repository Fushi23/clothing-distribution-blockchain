# Blockchain Clothing Distribution System (BCDS)

A blockchain web app for distributing donated / reused clothing to people in need.
Suppliers donate **categorized, QR-tagged bundles**; certified NGOs claim them from a
public dashboard and **scan the bag's QR code on arrival** to confirm delivery on-chain.

## Key features

- **Role-based access** — Admin, Supplier, and NGO each see only their own dashboard, decided
  by their on-chain role. Suppliers and NGOs **apply in-app** and are **approved by the admin**.
- **Personalized identity header** — once approved, a participant's **organization name** (the
  one they entered when applying) is shown large at the top of their dashboard.
- **Bundle donations with QR labels** — a supplier creates a categorized bundle and gets a
  **printable QR code** to attach to the physical bag.
- **QR-verified delivery** — the NGO scans the bag's QR on arrival; the contract confirms
  delivery **only if the scanned hash matches** the bundle assigned to them.
- **Camera scanner + manual fallback** — scans with the device camera (auto-detects available
  cameras, with a picker), or paste the code manually if there's no camera.
- **"Who is this from?" donor info** — the NGO sees the donor's **organization name and contact**
  on every available and claimed bundle, so they know who they're claiming from.
- **Delivery coordination** — when claiming, the NGO enters a **delivery location / meeting
  point**. The supplier then sees **who claimed the bundle, their contact, and where to send it**,
  so both sides can arrange the handoff.
- **On-chain receipts** — each claimed/delivered bundle has a **🧾 Receipt** popup showing the
  claim and delivery **transaction hashes, block numbers, and timestamps** read from chain events.
- **Public ledger + live stats** — every bundle and its status history is visible to anyone,
  with running totals (available / claimed / delivered).
- **Safety rails** — emergency `pause`/`unpause`, reentrancy guards, and a **network guard** in
  the UI that detects the wrong MetaMask network and offers a one-click switch.

## Roles

| Role | Who | Can do |
| --- | --- | --- |
| **Admin** | platform authority (deployer) | Approve/reject applications, pause the platform |
| **Supplier** | approved donor | Create donation bundles, print QR labels, cancel unclaimed bundles, see who claimed + where to deliver |
| **NGO** | certified relief org | See donor org/contact, claim available bundles, release claims, scan QR to confirm receipt, view on-chain receipts |

Suppliers and NGOs **apply in-app** and must be **approved by the admin** before they can act.

## Workflow

```
            ┌─────────┐  approve   ┌────────────┐
 apply ────►│  ADMIN  │───────────►│ SUPPLIER / │
            └─────────┘            │    NGO     │
                                   └────────────┘
 SUPPLIER: createBundle ──► [Available] ──cancel──► [Cancelled]
                                  │
 NGO: claimBundle                 ▼
                            [Claimed] ──release──► [Available]
                                  │
 NGO: scan QR + confirmReceipt    ▼
                            [Delivered]   ✅ (final)
```

A **bundle** is one physical bag of a single category. Its on-chain status moves through
`Available → Claimed → Delivered` (or `Cancelled`). Here is the full lifecycle in detail.

### Phase 0 — Onboarding (one-time per participant)
1. The **admin** is whoever deploys the contract — set automatically, no application needed.
2. A donor or relief org connects their wallet and submits **`applyForRole`** with their org
   name and contact/certification info. Their application is stored on-chain as *Pending*.
3. The **admin** reviews applications and calls **`approveApplicant`** (grants `SUPPLIER_ROLE`
   or `NGO_ROLE`) or **`rejectApplicant`**. Only after approval can they act.
   - *Shortcut:* the admin can also `registerParticipant` to onboard someone directly, and
     `scripts/seed-local.mjs` uses this to pre-approve a demo supplier (#1) and NGO (#2).

### Phase 1 — Donation (Supplier only)
> **Only a Supplier can add bundles.** `createBundle` is restricted to `SUPPLIER_ROLE`, so
> NGOs (and the admin) **cannot** supply items. An NGO's only powers are to *claim* and
> *confirm receipt* — it is purely a recipient, never a donor.

4. An approved **supplier** calls **`createBundle`** with: category (Shirts/Pants/Shoes/
   Jackets/Accessories/Other), condition (New/Good/Fair), item count, description, and origin.
5. The contract assigns a new **bundle id** and derives a **unique QR hash**
   (`keccak256` of id + supplier + time + randomness). Status becomes **`Available`**.
6. The frontend renders that hash as a **printable QR code**. The supplier prints it and
   **sticks it on the physical bag**. This QR is the permanent link between the real bag and
   its on-chain record.
7. While still `Available`, the supplier may **`cancelBundle`** (e.g. created by mistake) →
   status `Cancelled`.

### Phase 2 — Claiming & delivery coordination (NGO)
8. Every `Available` bundle appears on the public dashboard, each showing the **donor's org name
   and contact** so the NGO knows who they're claiming from. The NGO browses / filters by
   category and clicks **Claim**.
9. Claiming requires a **delivery location / meeting point** — `claimBundle(bundleId,
   deliveryLocation)` stores where the donor should send the bag (empty is rejected).
10. Status becomes **`Claimed`**, `claimedBy` is set to that NGO, and the bundle is reserved. The
    **supplier now sees who claimed it, their contact, and the delivery address** on their
    dashboard, so the two sides can coordinate the handoff off-chain.
11. If the NGO can no longer fulfil it, it calls **`releaseClaim`** → status returns to
    `Available` (and the delivery location is cleared) for someone else.

### Phase 3 — Delivery & QR verification (NGO) — the core feature
12. The supplier sends the bag to the delivery location the NGO provided.
13. On arrival the NGO **scans the QR** on the bag (camera, or manual paste). The QR encodes
    `bcds:<bundleId>:<qrHash>`.
14. The frontend calls **`confirmReceipt(bundleId, scannedHash)`**. The contract checks **all**
    of:
    - the caller holds `NGO_ROLE`,
    - the bundle is in `Claimed` status,
    - the caller is the NGO that claimed it (`claimedBy == msg.sender`),
    - **the scanned hash matches the bundle's stored `qrHash`.**
15. If everything matches → status becomes **`Delivered`**, `deliveredAt` is recorded, and a
    `BundleDelivered` event is emitted. If the scanned bag is the wrong one (hash mismatch), the
    call **reverts** — you can't confirm delivery of a bag that isn't the one assigned.
16. Both NGO and supplier can open a **🧾 receipt** for the bundle, showing the claim/delivery
    transaction hashes, block numbers and timestamps read from chain events.

This last check is the point of the whole system: the QR scan is **cryptographic proof** that
the exact bag the supplier donated is the one that reached the NGO — recorded on a public,
tamper-proof ledger that anyone can audit.

### Identity & transparency
- Every action (`approve`, `createBundle`, `claimBundle`, `confirmReceipt`, …) is a wallet-signed
  transaction, so **who did what is provable** by address.
- All bundles and their full status history live on-chain and are visible on the public ledger
  view — nobody can fake a donation or claim a delivery happened when it didn't.

## Understanding the QR code (and testing it on one computer)

**In real life, the QR code is physical.** Think of it like a tracking sticker on a parcel:

1. The **supplier** creates a bundle, and a QR code shows up on their page. They **print it and
   stick it on the actual bag of clothes.**
2. The bag is **physically delivered** to the NGO (truck, courier, etc.).
3. When the bag arrives, the **NGO scans the QR on the bag** with a phone camera. The app checks
   it against the blockchain → if it matches, delivery is confirmed. This proves the NGO received
   the *exact* bag that was assigned to them, not a wrong or swapped one.

So normally the NGO scans a real sticker on a real bag.

**Two things that confuse people at first:**

- **Claiming does NOT need the QR.** Clicking **"Claim"** just reserves the bundle for the NGO —
  no scan involved. The QR scan is a **separate, later step** ("Confirm receipt") that represents
  the bag *physically arriving*.
- **The camera scan is only the last step.** You don't scan anything to claim or to donate.

**Testing alone on one computer?** You're playing supplier *and* NGO yourself, so there is no
real bag and no printed sticker to point a camera at. Instead, use the **manual entry** option:

1. As the **supplier**, copy the bundle's delivery code (the `bcds:<id>:<hash>` text shown with
   its QR).
2. As the **NGO**, claim the bundle, then click **"Scan QR"** → in the popup, **paste the code
   into the "Manual entry" box** instead of using the camera → confirm.

That simulates the bag arriving with its sticker. (For a real demo with a phone, you'd display
the supplier's QR on screen and scan it with the NGO's phone camera.)

## Project layout

```
contracts/ClothingDistribution.sol          the smart contract
test/BCDS_Testing.ts                        22 integration tests
ignition/modules/ClothingDistribution.ts    deployment module
scripts/export-frontend.mjs                 writes ABI + address into the frontend
scripts/seed-local.mjs                      seeds demo accounts + sample bundles
frontend-react/                             React + Vite + ethers + MetaMask dapp
  src/App.jsx                               main app: wallet, roles, panels, data loading
  src/contract.js                           auto-generated ABI + deployed address
  src/lib.js                                enums, labels, QR encode/decode, helpers
  src/styles.js                             shared inline styles
  src/components/QrImage.jsx                renders a bundle's printable QR code
  src/components/QrScannerModal.jsx         camera QR scanner + manual entry fallback
  src/components/ReceiptModal.jsx           on-chain transaction receipt popup
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
