import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import { styles } from "./styles";
import QrImage from "./components/QrImage";
import QrScannerModal from "./components/QrScannerModal";
import ReceiptModal from "./components/ReceiptModal";
import {
  CATEGORY,
  CONDITION,
  BUNDLE_STATUS,
  APP_STATUS,
  APPLICANT_TYPE,
  STATUS_BADGE,
  CATEGORY_ICON,
  encodeQrPayload,
  shortAddr,
  errMsg,
} from "./lib";

const LOCAL_RPC = "http://127.0.0.1:8545";
const EXPECTED_CHAIN_ID = 31337n;
const EXPECTED_CHAIN_HEX = "0x7a69"; // 31337

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [roles, setRoles] = useState({ isAdmin: false, isSupplier: false, isNgo: false });
  const [myApp, setMyApp] = useState(null);
  const [paused, setPaused] = useState(false);

  const [bundles, setBundles] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [stats, setStats] = useState({ total: 0, available: 0, claimed: 0, delivered: 0 });
  const [log, setLog] = useState("Connect MetaMask to interact. Browsing public ledger…");
  const [scanFor, setScanFor] = useState(null);
  const [receiptFor, setReceiptFor] = useState(null);

  const hasRole = roles.isAdmin || roles.isSupplier || roles.isNgo;

  // ---- providers / contract ----
  function readProvider() {
    if (typeof window.ethereum !== "undefined") return new ethers.BrowserProvider(window.ethereum);
    return new ethers.JsonRpcProvider(LOCAL_RPC);
  }
  async function writeContract() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }

  // Pull the claim/delivery transactions for a bundle from contract events,
  // used to build the on-chain receipt.
  async function fetchReceipt(bundleId) {
    const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider());
    const out = {};
    const pick = async (events) => {
      if (!events.length) return null;
      const e = events[events.length - 1];
      const blk = await e.getBlock();
      return { txHash: e.transactionHash, block: e.blockNumber, time: blk?.timestamp };
    };
    out.claim = await pick(await c.queryFilter(c.filters.BundleClaimed(bundleId)));
    out.delivery = await pick(await c.queryFilter(c.filters.BundleDelivered(bundleId)));
    return out;
  }

  // ---- data loading ----
  const loadData = useCallback(async (acct) => {
    try {
      const provider = readProvider();
      // Guard: make sure MetaMask is on the local Hardhat chain before reading.
      if (typeof window.ethereum !== "undefined") {
        const net = await provider.getNetwork();
        setChainId(net.chainId);
        if (net.chainId !== EXPECTED_CHAIN_ID) {
          setBundles([]);
          setLog(
            `Wrong network (chain ${net.chainId}). Switch MetaMask to the Hardhat Localhost network (chain 31337).`
          );
          return;
        }
      }
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      // Applicant records carry org name + contact — used to show who a bundle
      // is from, so we load them for everyone, not just the admin.
      const [all, st, isPaused, apps] = await Promise.all([
        c.getAllBundles(),
        c.getStats(),
        c.paused(),
        c.getAllApplicants(),
      ]);
      setBundles(all.map(normalizeBundle));
      setStats({
        total: Number(st[0]),
        available: Number(st[1]),
        claimed: Number(st[2]),
        delivered: Number(st[3]),
      });
      setPaused(isPaused);
      setApplicants(apps.map(normalizeApplicant));

      if (acct) {
        const r = await c.getRoles(acct);
        setRoles({ isAdmin: r[0], isSupplier: r[1], isNgo: r[2] });
        const app = await c.getApplicant(acct);
        setMyApp({ kind: Number(app.kind), orgName: app.orgName, status: Number(app.status) });
      }
    } catch (e) {
      console.error(e);
      setLog("Could not read contract. Is the local node running and the address correct? " + errMsg(e));
    }
  }, []);

  useEffect(() => {
    // loadData is async: all setState calls run after `await`, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData(account);
  }, [account, loadData]);

  // ---- wallet events ----
  useEffect(() => {
    if (typeof window.ethereum === "undefined") return;
    const onAccounts = (accs) => setAccount(accs[0] ?? null);
    const onChain = () => window.location.reload();
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, []);

  async function connect() {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask not detected! Please install the extension.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accs = await provider.send("eth_requestAccounts", []);
      setAccount(accs[0]);
      setLog(`Wallet connected: ${accs[0]}`);
    } catch {
      setLog("Connection to MetaMask rejected.");
    }
  }

  async function switchToLocalhost() {
    if (typeof window.ethereum === "undefined") return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: EXPECTED_CHAIN_HEX }],
      });
    } catch (e) {
      // 4902 = chain not added to MetaMask yet; add it then it auto-selects.
      if (e.code === 4902 || e.data?.originalError?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: EXPECTED_CHAIN_HEX,
              chainName: "Hardhat Localhost",
              rpcUrls: [LOCAL_RPC],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      } else {
        setLog("Network switch failed: " + errMsg(e));
      }
    }
  }

  const wrongNetwork = chainId !== null && chainId !== EXPECTED_CHAIN_ID;

  // address -> applicant profile (org name + contact), for "who is this from?"
  const profiles = {};
  for (const a of applicants) profiles[a.account.toLowerCase()] = a;

  // ---- generic write wrapper ----
  async function send(label, fn) {
    try {
      setLog(`${label}…`);
      const c = await writeContract();
      const tx = await fn(c);
      setLog(`${label} — broadcasting (${tx.hash.slice(0, 10)}…)`);
      await tx.wait();
      setLog(`${label} — confirmed ✅`);
      await loadData(account);
      return true;
    } catch (e) {
      setLog(`${label} failed: ${errMsg(e)}`);
      return false;
    }
  }

  return (
    <div style={styles.app}>
      <header style={styles.navbar}>
        <div style={styles.logo}>🧥 BCDS — Clothing Relief Distribution</div>
        <div style={styles.navRight}>
          {paused && <span style={{ ...styles.roleBadge, color: "#fca5a5" }}>⏸ PAUSED</span>}
          {roles.isAdmin && <span style={styles.roleBadge}>Admin</span>}
          {roles.isSupplier && <span style={styles.roleBadge}>Supplier</span>}
          {roles.isNgo && <span style={styles.roleBadge}>NGO</span>}
          <button style={account ? styles.connectedBtn : styles.connectBtn} onClick={connect}>
            {account ? `${shortAddr(account)} ✅` : "Connect MetaMask"}
          </button>
        </div>
      </header>

      <main style={styles.body}>
        <div style={styles.banner}>
          <span style={{ fontSize: 13 }}>
            <strong>Account:</strong> {account || "Not connected"}
            {account && !hasRole && myApp?.status === 1 && " — application pending admin approval"}
          </span>
          <div style={styles.log}>{log}</div>
        </div>

        {wrongNetwork && (
          <div style={{ ...styles.card, borderLeft: "5px solid #dc2626", marginBottom: 22 }}>
            <h3 style={{ ...styles.cardTitle, color: "#dc2626" }}>⚠️ Wrong network</h3>
            <p style={styles.cardSub}>
              MetaMask is on chain {String(chainId)}, but this app lives on the Hardhat Localhost
              chain (31337). Switch networks, then import a dev account from the <code>hardhat node</code> output.
            </p>
            <button style={{ ...styles.btn }} onClick={switchToLocalhost}>
              Switch to Hardhat Localhost
            </button>
          </div>
        )}

        {hasRole && !wrongNetwork && (
          <IdentityHeader account={account} roles={roles} myApp={myApp} />
        )}

        <StatBar stats={stats} />

        {account && !wrongNetwork && !hasRole && <ApplyPanel myApp={myApp} onApply={send} />}
        {roles.isAdmin && !wrongNetwork && (
          <AdminPanel applicants={applicants} paused={paused} onAction={send} />
        )}
        {roles.isSupplier && !wrongNetwork && (
          <SupplierPanel account={account} bundles={bundles} profiles={profiles} onAction={send} />
        )}
        {roles.isNgo && !wrongNetwork && (
          <NgoPanel
            account={account}
            bundles={bundles}
            profiles={profiles}
            onAction={send}
            onScan={setScanFor}
            onReceipt={setReceiptFor}
          />
        )}

        <LedgerBoard bundles={bundles} />
      </main>

      {scanFor && (
        <QrScannerModal
          onClose={() => setScanFor(null)}
          onResult={async ({ qrHash }) => {
            const id = scanFor;
            setScanFor(null);
            await send(`Confirming receipt of bundle #${id}`, (c) => c.confirmReceipt(id, qrHash));
          }}
        />
      )}

      {receiptFor && (
        <ReceiptModal
          bundle={receiptFor}
          donor={profiles[receiptFor.supplier?.toLowerCase()]}
          fetchReceipt={fetchReceipt}
          onClose={() => setReceiptFor(null)}
        />
      )}
    </div>
  );
}

// ============================================================
//                       SUB-COMPONENTS
// ============================================================

function IdentityHeader({ account, roles, myApp }) {
  const roleLabel = roles.isAdmin
    ? "Platform Administrator"
    : roles.isSupplier
    ? "Supplier"
    : roles.isNgo
    ? "NGO"
    : "";
  const name = myApp?.orgName?.trim();

  return (
    <div
      style={{
        background: "linear-gradient(90deg,#0f172a 0%,#1e3a8a 100%)",
        color: "#fff",
        borderRadius: 12,
        padding: "22px 26px",
        marginBottom: 22,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#93c5fd" }}>
          Welcome
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
          {name || roleLabel || "—"}
        </div>
        <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4 }}>
          {roleLabel} · {shortAddr(account)}
        </div>
      </div>
      <div style={{ fontSize: 44 }}>
        {roles.isAdmin ? "🛡️" : roles.isSupplier ? "📦" : "🌍"}
      </div>
    </div>
  );
}

function StatBar({ stats }) {
  const cells = [
    ["Total bundles", stats.total],
    ["Available", stats.available],
    ["Claimed", stats.claimed],
    ["Delivered", stats.delivered],
  ];
  return (
    <div style={styles.statRow}>
      {cells.map(([label, num]) => (
        <div key={label} style={styles.statCard}>
          <div style={styles.statNum}>{num}</div>
          <div style={styles.statLabel}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function ApplyPanel({ myApp, onApply }) {
  const [kind, setKind] = useState(String(APPLICANT_TYPE.Supplier));
  const [org, setOrg] = useState("");
  const [contact, setContact] = useState("");

  const rejected = myApp?.status === 3;
  const pending = myApp?.status === 1;

  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>🪪 Request platform access</h3>
      <p style={styles.cardSub}>
        Suppliers and NGOs must be approved by the admin. NGOs should provide verifiable
        certification details so the admin can confirm you are a relief organization.
      </p>
      {pending ? (
        <div style={styles.pill}>Application pending — waiting for admin approval.</div>
      ) : (
        <>
          {rejected && (
            <div style={{ ...styles.pill, backgroundColor: "#fed7d7", color: "#742a2a", marginBottom: 12 }}>
              Previous application was rejected. You may re-apply.
            </div>
          )}
          <div style={styles.formGroup}>
            <label style={styles.label}>Role</label>
            <select style={styles.input} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value={APPLICANT_TYPE.Supplier}>Supplier (donor)</option>
              <option value={APPLICANT_TYPE.NGO}>NGO (relief organization)</option>
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Organization name</label>
            <input style={styles.input} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. Hope Relief Foundation" />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Contact / certification reference</label>
            <input style={styles.input} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="email, reg. number, etc." />
          </div>
          <button
            style={{ ...styles.btn, ...(org ? {} : styles.btnDisabled) }}
            disabled={!org}
            onClick={() => onApply("Submitting application", (c) => c.applyForRole(Number(kind), org, contact))}
          >
            Submit application
          </button>
        </>
      )}
    </section>
  );
}

function AdminPanel({ applicants, paused, onAction }) {
  const pending = applicants.filter((a) => a.status === 1);
  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>🛡️ Admin — approvals & controls</h3>
      <p style={styles.cardSub}>Review pending applications and grant supplier / NGO access.</p>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Organization</th>
            <th style={styles.th}>Role</th>
            <th style={styles.th}>Address</th>
            <th style={styles.th}>Contact</th>
            <th style={styles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {pending.length === 0 ? (
            <tr><td style={styles.emptyTd} colSpan={5}>No pending applications.</td></tr>
          ) : (
            pending.map((a) => (
              <tr key={a.account}>
                <td style={styles.td}>{a.orgName}</td>
                <td style={styles.td}>{a.kind === APPLICANT_TYPE.Supplier ? "Supplier" : "NGO"}</td>
                <td style={styles.td}><code>{shortAddr(a.account)}</code></td>
                <td style={styles.td}>{a.contactInfo || "—"}</td>
                <td style={styles.td}>
                  <button style={{ ...styles.btn, ...styles.btnGreen, ...styles.btnSm, marginRight: 6 }}
                    onClick={() => onAction(`Approving ${a.orgName}`, (c) => c.approveApplicant(a.account))}>
                    Approve
                  </button>
                  <button style={{ ...styles.btn, ...styles.btnRed, ...styles.btnSm }}
                    onClick={() => onAction(`Rejecting ${a.orgName}`, (c) => c.rejectApplicant(a.account))}>
                    Reject
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 16 }}>
        {paused ? (
          <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={() => onAction("Unpausing", (c) => c.unpause())}>
            ▶ Resume platform
          </button>
        ) : (
          <button style={{ ...styles.btn, ...styles.btnRed }} onClick={() => onAction("Pausing", (c) => c.pause())}>
            ⏸ Emergency pause
          </button>
        )}
      </div>
    </section>
  );
}

function SupplierPanel({ account, bundles, profiles, onAction }) {
  const [category, setCategory] = useState("0");
  const [condition, setCondition] = useState("0");
  const [count, setCount] = useState("100");
  const [desc, setDesc] = useState("");
  const [origin, setOrigin] = useState("");

  const mine = bundles.filter((b) => b.supplier.toLowerCase() === account?.toLowerCase());

  async function create() {
    const ok = await onAction("Creating bundle", (c) =>
      c.createBundle(Number(category), Number(condition), Number(count), desc, origin)
    );
    if (ok) { setDesc(""); setOrigin(""); }
  }

  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>📦 Supplier — donate a bundle</h3>
      <p style={styles.cardSub}>
        Each bundle is one bag of a single category. After creating it, print the QR below and
        attach it to the physical bag — the NGO scans it on arrival to verify it.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...styles.formGroup, flex: "1 1 120px" }}>
          <label style={styles.label}>Category</label>
          <select style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY.map((c, i) => <option key={i} value={i}>{c}</option>)}
          </select>
        </div>
        <div style={{ ...styles.formGroup, flex: "1 1 120px" }}>
          <label style={styles.label}>Condition</label>
          <select style={styles.input} value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITION.map((c, i) => <option key={i} value={i}>{c}</option>)}
          </select>
        </div>
        <div style={{ ...styles.formGroup, flex: "1 1 100px" }}>
          <label style={styles.label}>Item count</label>
          <input style={styles.input} type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Description</label>
        <input style={styles.input} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Assorted cotton t-shirts, adult sizes" />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Origin / collection point</label>
        <input style={styles.input} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Warehouse KL, Bay 3" />
      </div>
      <button
        style={{ ...styles.btn, ...styles.btnGreen, ...((desc && origin && Number(count) > 0) ? {} : styles.btnDisabled) }}
        disabled={!(desc && origin && Number(count) > 0)}
        onClick={create}
      >
        Create donation bundle
      </button>

      <h4 style={{ ...styles.cardTitle, fontSize: 14, marginTop: 22 }}>My bundles & QR labels</h4>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10 }}>
        {mine.length === 0 ? (
          <div style={styles.cardSub}>No bundles yet.</div>
        ) : (
          mine.map((b) => (
            <div key={b.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, width: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                {CATEGORY_ICON[b.categoryLabel]} Bundle #{b.id} · {b.categoryLabel}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                {b.itemCount} items · {b.conditionLabel} · <span style={styles.badge(STATUS_BADGE[b.statusLabel])}>{STATUS_BADGE[b.statusLabel].label}</span>
              </div>
              <div style={styles.qrBox}>
                <QrImage payload={encodeQrPayload(b.id, b.qrHash)} size={140} />
                <code style={{ fontSize: 9, wordBreak: "break-all", color: "#94a3b8" }}>{b.qrHash.slice(0, 18)}…</code>
              </div>
              {(b.statusLabel === "Claimed" || b.statusLabel === "Delivered") && (
                <div style={{ marginTop: 8, padding: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>
                    {b.statusLabel === "Delivered" ? "✅ Delivered to" : "📦 Claimed by"}
                  </div>
                  <div>{profiles[b.claimedBy?.toLowerCase()]?.orgName || "Unnamed NGO"}</div>
                  <div style={{ color: "#64748b" }}>
                    📞 {profiles[b.claimedBy?.toLowerCase()]?.contactInfo || "no contact on file"}
                  </div>
                  <div style={{ color: "#0f172a", marginTop: 4 }}>
                    🚚 Send to: <strong>{b.deliveryLocation || "—"}</strong>
                  </div>
                </div>
              )}
              {b.statusLabel === "Available" && (
                <button style={{ ...styles.btn, ...styles.btnRed, ...styles.btnSm, width: "100%", marginTop: 8 }}
                  onClick={() => onAction(`Cancelling bundle #${b.id}`, (c) => c.cancelBundle(b.id))}>
                  Cancel bundle
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function NgoPanel({ account, bundles, profiles, onAction, onScan, onReceipt }) {
  const [filter, setFilter] = useState("all");
  const [claimTarget, setClaimTarget] = useState(null);
  const [deliveryLoc, setDeliveryLoc] = useState("");

  async function confirmClaim() {
    if (!deliveryLoc.trim()) return;
    const ok = await onAction(
      `Claiming bundle #${claimTarget.id}`,
      (c) => c.claimBundle(claimTarget.id, deliveryLoc)
    );
    if (ok) {
      setClaimTarget(null);
      setDeliveryLoc("");
    }
  }

  const available = bundles.filter(
    (b) => b.statusLabel === "Available" && (filter === "all" || b.categoryLabel === filter)
  );
  // Bundles this NGO has claimed — both awaiting delivery and already delivered,
  // so a receipt stays accessible after completion.
  const myBundles = bundles.filter(
    (b) =>
      b.claimedBy.toLowerCase() === account?.toLowerCase() &&
      (b.statusLabel === "Claimed" || b.statusLabel === "Delivered")
  );

  // "Who is this bundle from?" — org name + contact pulled from the donor's
  // applicant record, with the wallet address as a fallback.
  const DonorCell = ({ supplier }) => {
    const p = profiles[supplier?.toLowerCase()];
    return (
      <td style={styles.td}>
        <div style={{ fontWeight: 600 }}>{p?.orgName || "Unnamed donor"}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          {p?.contactInfo ? `📞 ${p.contactInfo}` : "no contact on file"}
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8" }}><code>{shortAddr(supplier)}</code></div>
      </td>
    );
  };

  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>🌍 NGO — claim & receive</h3>
      <p style={styles.cardSub}>
        Each bundle shows the donor's organization and contact so you know who you're claiming
        from. Claim a bundle, then scan its QR on arrival to confirm delivery on-chain.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <label style={styles.label}>Filter category</label>
        <select style={{ ...styles.input, maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All categories</option>
          {CATEGORY.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>#</th><th style={styles.th}>Category</th><th style={styles.th}>Items</th>
            <th style={styles.th}>Condition</th><th style={styles.th}>Donor (from)</th>
            <th style={styles.th}>Origin</th><th style={styles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {available.length === 0 ? (
            <tr><td style={styles.emptyTd} colSpan={7}>No available bundles in this category.</td></tr>
          ) : (
            available.map((b) => (
              <tr key={b.id}>
                <td style={styles.td}><strong>#{b.id}</strong></td>
                <td style={styles.td}>{CATEGORY_ICON[b.categoryLabel]} {b.categoryLabel}</td>
                <td style={styles.td}>{b.itemCount}</td>
                <td style={styles.td}>{b.conditionLabel}</td>
                <DonorCell supplier={b.supplier} />
                <td style={styles.td}><code>{b.originLocation}</code></td>
                <td style={styles.td}>
                  <button style={{ ...styles.btn, ...styles.btnAmber, ...styles.btnSm }}
                    onClick={() => { setClaimTarget(b); setDeliveryLoc(""); }}>
                    Claim
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h4 style={{ ...styles.cardTitle, fontSize: 14, marginTop: 22 }}>My bundles</h4>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>#</th><th style={styles.th}>Category</th><th style={styles.th}>Items</th>
            <th style={styles.th}>Donor (contact to coordinate)</th><th style={styles.th}>Deliver to</th>
            <th style={styles.th}>Status</th><th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {myBundles.length === 0 ? (
            <tr><td style={styles.emptyTd} colSpan={7}>You haven't claimed any bundles yet.</td></tr>
          ) : (
            myBundles.map((b) => (
              <tr key={b.id}>
                <td style={styles.td}><strong>#{b.id}</strong></td>
                <td style={styles.td}>{CATEGORY_ICON[b.categoryLabel]} {b.categoryLabel}</td>
                <td style={styles.td}>{b.itemCount}</td>
                <DonorCell supplier={b.supplier} />
                <td style={styles.td}><code>{b.deliveryLocation || "—"}</code></td>
                <td style={styles.td}><span style={styles.badge(STATUS_BADGE[b.statusLabel])}>{STATUS_BADGE[b.statusLabel].label}</span></td>
                <td style={styles.td}>
                  {b.statusLabel === "Claimed" && (
                    <>
                      <button style={{ ...styles.btn, ...styles.btnGreen, ...styles.btnSm, marginRight: 6 }} onClick={() => onScan(b.id)}>
                        📷 Scan QR
                      </button>
                      <button style={{ ...styles.btn, ...styles.btnGray, ...styles.btnSm, marginRight: 6 }}
                        onClick={() => onAction(`Releasing claim on #${b.id}`, (c) => c.releaseClaim(b.id))}>
                        Release
                      </button>
                    </>
                  )}
                  <button style={{ ...styles.btn, ...styles.btnSm }} onClick={() => onReceipt(b)}>
                    🧾 Receipt
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {claimTarget && (
        <div style={styles.modalBackdrop} onClick={() => setClaimTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.cardTitle}>Claim bundle #{claimTarget.id}</h3>
            <p style={styles.cardSub}>
              {CATEGORY_ICON[claimTarget.categoryLabel]} {claimTarget.categoryLabel} · {claimTarget.itemCount} items.
              Tell the donor where to deliver it or where to meet — they'll see this and your contact.
            </p>
            <div style={styles.formGroup}>
              <label style={styles.label}>Delivery location / meeting point</label>
              <input
                style={styles.input}
                value={deliveryLoc}
                onChange={(e) => setDeliveryLoc(e.target.value)}
                placeholder="e.g. Relief Camp B, Kuala Terengganu — gate 2"
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                style={{ ...styles.btn, ...styles.btnAmber, flex: 1, ...(deliveryLoc.trim() ? {} : styles.btnDisabled) }}
                disabled={!deliveryLoc.trim()}
                onClick={confirmClaim}
              >
                Confirm claim
              </button>
              <button style={{ ...styles.btn, ...styles.btnGray }} onClick={() => setClaimTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LedgerBoard({ bundles }) {
  return (
    <>
      <h2 style={styles.sectionTitle}>📊 Public distribution ledger</h2>
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th><th style={styles.th}>Category</th><th style={styles.th}>Items</th>
              <th style={styles.th}>Condition</th><th style={styles.th}>Origin</th>
              <th style={styles.th}>Supplier</th><th style={styles.th}>Claimed by</th><th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {bundles.length === 0 ? (
              <tr><td style={styles.emptyTd} colSpan={8}>No bundles on the ledger yet.</td></tr>
            ) : (
              bundles.map((b) => (
                <tr key={b.id}>
                  <td style={styles.td}><strong>#{b.id}</strong></td>
                  <td style={styles.td}>{CATEGORY_ICON[b.categoryLabel]} {b.categoryLabel}</td>
                  <td style={styles.td}>{b.itemCount}</td>
                  <td style={styles.td}>{b.conditionLabel}</td>
                  <td style={styles.td}><code>{b.originLocation}</code></td>
                  <td style={styles.td}><code>{shortAddr(b.supplier)}</code></td>
                  <td style={styles.td}><code>{shortAddr(b.claimedBy)}</code></td>
                  <td style={styles.td}><span style={styles.badge(STATUS_BADGE[b.statusLabel])}>{STATUS_BADGE[b.statusLabel].label}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================
//                         NORMALIZERS
// ============================================================

function normalizeBundle(b) {
  return {
    id: Number(b.id),
    supplier: b.supplier,
    category: Number(b.category),
    categoryLabel: CATEGORY[Number(b.category)],
    condition: Number(b.condition),
    conditionLabel: CONDITION[Number(b.condition)],
    itemCount: Number(b.itemCount),
    description: b.description,
    originLocation: b.originLocation,
    qrHash: b.qrHash,
    status: Number(b.status),
    statusLabel: BUNDLE_STATUS[Number(b.status)],
    claimedBy: b.claimedBy,
    deliveryLocation: b.deliveryLocation,
  };
}

function normalizeApplicant(a) {
  return {
    account: a.account,
    kind: Number(a.kind),
    orgName: a.orgName,
    contactInfo: a.contactInfo,
    status: Number(a.status),
    statusLabel: APP_STATUS[Number(a.status)],
  };
}
