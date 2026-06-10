import { useState, useEffect } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CONTRACT_ABI = [
  "function addSupplier(address _supplier) external",
  "function addNGO(address _ngo) external",
  "function tokenizeClothing(string memory _garmentProfile, uint8 _condition, string memory _gpsProvenance) external",
  "function createReliefRequest(string memory _itemTypeNeeded, uint256 _quantityNeeded, string memory _sectorLocation) external",
  "function matchSupplyToRequest(uint256 requestId, uint256 itemId) external",
  "function verifyDelivery(uint256 requestId) external",
  "function itemCount() external view returns (uint256)",
  "function requestCount() external view returns (uint256)",
  "function getClothingItem(uint256 _itemId) external view returns (tuple(uint256 id, address supplier, string garmentProfile, uint8 condition, string gpsProvenance, bool isAllocated, uint256 createdAt))",
  "function getReliefRequest(uint256 _requestId) external view returns (tuple(uint256 id, address ngo, string itemTypeNeeded, uint256 quantityNeeded, string sectorLocation, uint8 status, uint256 matchedItemId, uint256 createdAt, uint256 deliveredAt))"
];

export default function App() {
  const [walletAddress, setWalletAddress] = useState("Not Connected");
  const [isConnected, setIsConnected] = useState(false);
  
  // Form Inputs
  const [targetAuthAddress, setTargetAuthAddress] = useState("");
  const [profileInput, setProfileInput] = useState("");
  const [conditionInput, setConditionInput] = useState("0");
  const [gpsInput, setGpsInput] = useState("");
  
  const [ngoItemNeeded, setNgoItemNeeded] = useState("");
  const [ngoQuantity, setNgoQuantity] = useState("1");
  const [ngoLocation, setNgoLocation] = useState("");
  const [claimItemId, setClaimItemId] = useState("");
  const [claimRequestId, setClaimRequestId] = useState("");
  const [verifyRequestId, setVerifyRequestId] = useState("");

  // Live Ledger State
  const [availableItems, setAvailableItems] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [systemLog, setSystemLog] = useState("System initialized. Connect MetaMask to begin.");

  useEffect(() => {
    if (isConnected) {
      refreshLedgerData();
    }
  }, [isConnected]);

  async function connectMetaMask() {
    if (typeof window.ethereum !== "undefined") {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        setWalletAddress(signer.address);
        setIsConnected(true);
        setSystemLog(`Wallet connected successfully: ${signer.address}`);
      } catch (error) {
        setSystemLog("Connection to MetaMask rejected.");
      }
    } else {
      alert("MetaMask not detected! Please install the extension.");
    }
  }

  // Admin Setup
  async function authorizeRole(type) {
    try {
      setSystemLog(`Broadcasting authorization for ${type}...`);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = type === "Supplier" 
        ? await contract.addSupplier(targetAuthAddress)
        : await contract.addNGO(targetAuthAddress);
      await tx.wait();
      setSystemLog(`Success! Authorized ${type}: ${targetAuthAddress}`);
    } catch (err) { setSystemLog(`Authorization Failed: ${err.reason || err.message}`); }
  }

  // Supplier Action
  async function mintInventory() {
    try {
      setSystemLog("Minting digital cryptographic tracking token...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.tokenizeClothing(profileInput, parseInt(conditionInput), gpsInput);
      await tx.wait();
      setSystemLog("Inventory tokenized successfully on ledger!");
      refreshLedgerData();
    } catch (err) { setSystemLog(`Tokenization Failed: ${err.reason || err.message}`); }
  }

  // NGO Actions
  async function submitDemand() {
    try {
      setSystemLog("Publishing open emergency demand ticket...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createReliefRequest(ngoItemNeeded, parseInt(ngoQuantity), ngoLocation);
      await tx.wait();
      setSystemLog("Demand ticket opened successfully!");
      refreshLedgerData();
    } catch (err) { setSystemLog(`Demand Failed: ${err.reason || err.message}`); }
  }

  async function claimItemDirectly() {
    try {
      setSystemLog(`NGO initiating decentralized direct claim on Item #${claimItemId}...`);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      // Maps decentralized flow directly into backend contract linking framework
      const tx = await contract.matchSupplyToRequest(parseInt(claimRequestId), parseInt(claimItemId));
      await tx.wait();
      setSystemLog(`Item #${claimItemId} successfully secured and locked to Request Ticket #${claimRequestId}!`);
      refreshLedgerData();
    } catch (err) { setSystemLog(`Claim Processing Failed: ${err.reason || err.message}`); }
  }

  async function confirmArrival() {
    try {
      setSystemLog("Signing decentralized proof-of-delivery cryptographic receipt...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.verifyDelivery(parseInt(verifyRequestId));
      await tx.wait();
      setSystemLog(`Delivery for Request #${verifyRequestId} verified and finalized on-chain!`);
      refreshLedgerData();
    } catch (err) { setSystemLog(`Verification Failed: ${err.reason || err.message}`); }
  }

  // Database Synchronization Reads
  async function refreshLedgerData() {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
      const totalItems = await contract.itemCount();
      const totalRequests = await contract.requestCount();
      
      const itemsList = [];
      const conds = ["Mint", "Good", "Fair"];
      for (let i = 1; i <= Number(totalItems); i++) {
        const item = await contract.getClothingItem(i);
        itemsList.push({ id: item[0].toString(), supplier: item[1], profile: item[2], condition: conds[item[3]], gps: item[4], allocated: item[5] });
      }
      setAvailableItems(itemsList);

      const reqsList = [];
      const stats = ["Pending Match", "Dispatched/In-Transit", "Delivered ✅", "Cancelled"];
      for (let j = 1; j <= Number(totalRequests); j++) {
        const req = await contract.getReliefRequest(j);
        reqsList.push({ id: req[0].toString(), ngo: req[1], item: req[2], qty: req[3].toString(), loc: req[4], status: stats[req[5]], matchId: req[6].toString() });
      }
      setActiveRequests(reqsList);
    } catch (e) { console.error("Error refreshing board details", e); }
  }

  return (
    <div style={styles.appContainer}>
      {/* HEADER BAR */}
      <header style={styles.navbar}>
        <div style={styles.logo}>📦 BCDS: Decentralized P2P Relief Network</div>
        <button style={isConnected ? styles.connectedBtn : styles.connectBtn} onClick={connectMetaMask}>
          {isConnected ? "Wallet Connected ✅" : "Connect MetaMask Wallet"}
        </button>
      </header>

      <main style={styles.dashboardBody}>
        {/* METAMASK LOG STATUS BANNER */}
        <div style={styles.statusBanner}>
          <span style={{fontSize: "13px"}}><strong>Active Operator Account Address:</strong> {walletAddress}</span>
          <div style={styles.terminalLog}>{systemLog}</div>
        </div>

        {/* WORKFLOW OPERATIONS PANELS */}
        <div style={styles.mainGrid}>
          
          {/* PANEL 1: REGISTRATION CONTROL */}
          <section style={styles.card}>
            <h3 style={styles.cardTitle}>🛡️ Platform Gatekeeper (Admin)</h3>
            <p style={styles.cardSubtitle}>Issue localized access control keys to participants.</p>
            <div style={styles.formGroup}>
              <label style={styles.label}>Target User Public Key Address</label>
              <input style={styles.input} type="text" placeholder="0x..." value={targetAuthAddress} onChange={(e) => setTargetAuthAddress(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button style={{...styles.actionBtn, backgroundColor: "#4a5568"}} onClick={() => authorizeRole("Supplier")} disabled={!isConnected}>Authorize Supplier</button>
              <button style={{...styles.actionBtn, backgroundColor: "#2b6cb0"}} onClick={() => authorizeRole("NGO")} disabled={!isConnected}>Authorize NGO Address</button>
            </div>
          </section>

          {/* PANEL 2: SUPPLIER DISPATCH TO MARKETPLACE */}
          <section style={styles.card}>
            <h3 style={styles.cardTitle}>🌱 Supply Tokenization Hub (Supplier)</h3>
            <p style={styles.cardSubtitle}>Mint inventory items directly onto the decentralized open marketplace board.</p>
            <div style={styles.formGroup}>
              <label style={styles.label}>Garment Bundle Specification</label>
              <input style={styles.input} type="text" placeholder="e.g., Children Warm Coats XL Pack" value={profileInput} onChange={(e) => setProfileInput(e.target.value)} />
            </div>
            <div style={{display: "flex", gap: "10px", width: "100%"}}>
              <div style={{...styles.formGroup, flex: 1}}>
                <label style={styles.label}>Condition Grade</label>
                <select style={styles.input} value={conditionInput} onChange={(e) => setConditionInput(e.target.value)}>
                  <option value="0">Mint / Unused</option>
                  <option value="1">Good / Inspected</option>
                  <option value="2">Fair / Reusable</option>
                </select>
              </div>
              <div style={{...styles.formGroup, flex: 2}}>
                <label style={styles.label}>Provenance Sourcing Origin Location</label>
                <input style={styles.input} type="text" placeholder="e.g., Warehouse_Grid_B" value={gpsInput} onChange={(e) => setGpsInput(e.target.value)} />
              </div>
            </div>
            <button style={{...styles.actionBtn, backgroundColor: "#2f855a", width: "100%"}} onClick={mintInventory} disabled={!isConnected}>Deploy Material Stock Bundle</button>
          </section>

          {/* PANEL 3: RELIEF MARKETPLACE MANAGER (NGO INTERFACE) */}
          <section style={{...styles.card, gridColumn: "span 2"}}>
            <h3 style={styles.cardTitle}>🌍 P2P Crisis Management Portal (NGO Workspace)</h3>
            <p style={styles.cardSubtitle}>Broadcast demands or directly claim items from the decentralized tracking list below.</p>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginTop: "10px"}}>
              <div style={styles.subFormArea}>
                <h4 style={styles.subFormTitle}>Step 1: Broadcast Demand Ticket</h4>
                <input style={styles.miniInput} type="text" placeholder="Garment Type Needed" value={ngoItemNeeded} onChange={(e) => setNgoItemNeeded(e.target.value)} />
                <input style={styles.miniInput} type="number" placeholder="Quantity Required" value={ngoQuantity} onChange={(e) => setNgoQuantity(e.target.value)} />
                <input style={styles.miniInput} type="text" placeholder="Camp Area Location" value={ngoLocation} onChange={(e) => setNgoLocation(e.target.value)} />
                <button style={{...styles.actionBtn, backgroundColor: "#2b6cb0"}} onClick={submitDemand} disabled={!isConnected}>Open Demand Ticket</button>
              </div>
              
              <div style={styles.subFormArea}>
                <h4 style={styles.subFormTitle}>Step 2: Claim Marketplace Item</h4>
                <p style={{fontSize: "11px", color: "#718096", marginBottom: "8px"}}>Select an available Item ID from the open supply tracker grid below to execute an immediate assignment.</p>
                <input style={styles.miniInput} type="number" placeholder="Your Open Request ID" value={claimRequestId} onChange={(e) => setClaimRequestId(e.target.value)} />
                <input style={styles.miniInput} type="number" placeholder="Target Stock Item ID" value={claimItemId} onChange={(e) => setClaimItemId(e.target.value)} />
                <button style={{...styles.actionBtn, backgroundColor: "#b7791f"}} onClick={claimItemDirectly} disabled={!isConnected}>Execute P2P Resource Claim</button>
              </div>

              <div style={styles.subFormArea}>
                <h4 style={styles.subFormTitle}>Step 3: Confirm Secure Arrival</h4>
                <p style={{fontSize: "11px", color: "#718096", marginBottom: "8px"}}>Once materials roll onto your camp coordinate grounds, sign the immutable cryptographic proof-of-delivery receipt.</p>
                <input style={styles.miniInput} type="number" placeholder="Target Request Ticket ID" value={verifyRequestId} onChange={(e) => setVerifyRequestId(e.target.value)} />
                <button style={{...styles.actionBtn, backgroundColor: "#276749"}} onClick={confirmArrival} disabled={!isConnected}>Sign Proof of Delivery</button>
              </div>
            </div>
          </section>
        </div>

        {/* LIVE BOARD AUDIT INTERFACES */}
        <h2 style={styles.boardHeading}>📊 Open Ledger Distributed Board Tracking Real-Time Assets</h2>
        <div style={styles.mainGrid}>
          {/* SUPPLY GRID */}
          <div style={styles.tableCard}>
            <h4 style={{margin: "0 0 10px 0", color: "#2d3748"}}>📦 Warehouse Material Supply Stock</h4>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}><th>ID</th><th>Description</th><th>Grade</th><th>Origin GPS</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {availableItems.length === 0 ? <tr><td colSpan="5" style={styles.emptyTd}>No assets tokenized yet.</td></tr> : availableItems.map((item) => (
                    <tr key={item.id} style={styles.tr}>
                      <td><strong>#{item.id}</strong></td><td>{item.profile}</td><td>{item.condition}</td><td><code>{item.gps}</code></td>
                      <td><span style={item.allocated ? styles.badgeLocked : styles.badgeOpen}>{item.allocated ? "🔒 Allocated" : "🔓 Available"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DEMAND GRID */}
          <div style={styles.tableCard}>
            <h4 style={{margin: "0 0 10px 0", color: "#2d3748"}}>🌍 Active NGO Emergency Crisis Requests</h4>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}><th>Ticket ID</th><th>Garment Demanded</th><th>Qty</th><th>Camp Location</th><th>Status State</th><th>Bound Item ID</th></tr>
                </thead>
                <tbody>
                  {activeRequests.length === 0 ? <tr><td colSpan="6" style={styles.emptyTd}>No requests opened yet.</td></tr> : activeRequests.map((req) => (
                    <tr key={req.id} style={styles.tr}>
                      <td><strong>Ticket #{req.id}</strong></td><td>{req.item}</td><td>{req.qty}</td><td><code>{req.loc}</code></td>
                      <td>{req.status}</td><td>{req.matchId === "0" ? "None" : `#${req.matchId}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// STYLING SPEC SHEET
const styles = {
  appContainer: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", backgroundColor: "#f7fafc", minHeight: "100vh", color: "#1a202c" },
  navbar: { display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1a202c", padding: "15px 30px", color: "#fff", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" },
  logo: { fontSize: "18px", fontWeight: "bold", letterSpacing: "0.5px" },
  connectBtn: { backgroundColor: "#e53e3e", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "6px", cursor: "pointer", transition: "all 0.2s" },
  connectedBtn: { backgroundColor: "#38a169", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "6px", cursor: "default" },
  dashboardBody: { padding: "30px" },
  statusBanner: { backgroundColor: "#fff", borderLeft: "5px solid #3182ce", padding: "15px 20px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: "25px" },
  terminalLog: { backgroundColor: "#2d3748", color: "#63b3ed", padding: "10px", borderRadius: "4px", fontSize: "12px", fontFamily: "monospace", marginTop: "10px", whiteSpace: "pre-wrap" },
  mainGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "30px" },
  card: { backgroundColor: "#fff", padding: "24px", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" },
  cardTitle: { margin: "0 0 4px 0", fontSize: "16px", color: "#2d3748", fontWeight: "bold" },
  cardSubtitle: { margin: "0 0 15px 0", fontSize: "12px", color: "#718096" },
  formGroup: { display: "flex", flexDirection: "column", marginBottom: "12px" },
  label: { fontSize: "11px", fontWeight: "bold", color: "#4a5568", marginBottom: "4px", uppercase: "true" },
  input: { padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "13px", outline: "none", transition: "all 0.2s", backgroundColor: "#fafafa" },
  actionBtn: { color: "white", border: "none", padding: "10px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: "6px", cursor: "pointer", display: "inline-block" },
  subFormArea: { backgroundColor: "#f7fafc", padding: "15px", borderRadius: "6px", border: "1px solid #edf2f7", display: "flex", flexDirection: "column", gap: "8px" },
  subFormTitle: { margin: "0 0 5px 0", fontSize: "13px", color: "#2d3748" },
  miniInput: { padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e0", fontSize: "12px" },
  boardHeading: { fontSize: "16px", margin: "10px 0 15px 0", color: "#2d3748", borderBottom: "2px solid #cbd5e0", paddingBottom: "8px" },
  tableCard: { backgroundColor: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0" },
  tableWrapper: { overflowX: "auto", marginTop: "10px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" },
  thRow: { borderBottom: "2px solid #e2e8f0", color: "#4a5568", backgroundColor: "#f7fafc" },
  tr: { borderBottom: "1px solid #edf2f7", transition: "all 0.1s" },
  emptyTd: { padding: "20px", textAlign: "center", color: "#a0aec0", fontStyle: "italic" },
  badgeOpen: { backgroundColor: "#c6f6d5", color: "#22543d", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" },
  badgeLocked: { backgroundColor: "#fed7d7", color: "#742a2a", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" }
};