import { useEffect, useState } from "react";
import { styles } from "../styles";
import { CATEGORY_ICON, shortAddr } from "../lib";

const fmt = (t) => (t ? new Date(t * 1000).toLocaleString() : "—");

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "8px 0", borderBottom: "1px solid #eef2f7" }}>
      <span style={{ color: "#64748b", fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{children}</span>
    </div>
  );
}

function TxBlock({ title, tx, copied, onCopy }) {
  return (
    <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: "#0f172a" }}>{title}</div>
      <Row label="Time">{fmt(tx.time)}</Row>
      <Row label="Block">#{tx.block}</Row>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", alignItems: "center" }}>
        <span style={{ color: "#64748b", fontSize: 13 }}>Tx hash</span>
        <code style={{ fontSize: 11, wordBreak: "break-all", textAlign: "right" }}>{tx.txHash}</code>
      </div>
      <button style={{ ...styles.btn, ...styles.btnGray, ...styles.btnSm, width: "100%" }} onClick={() => onCopy(tx.txHash, title)}>
        {copied === title ? "Copied! ✅" : "📋 Copy transaction hash"}
      </button>
    </div>
  );
}

// Shows an on-chain "receipt" for a bundle: its details plus the claim and
// delivery transaction hashes / timestamps pulled from contract events.
export default function ReceiptModal({ bundle, donor, fetchReceipt, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let active = true;
    fetchReceipt(bundle.id)
      .then((r) => active && setData(r))
      .catch(() => active && setData({}))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [bundle.id, fetchReceipt]);

  const delivered = bundle.statusLabel === "Delivered";

  function copy(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 22, color: delivered ? "#16a34a" : "#d97706" }}>{delivered ? "✅" : "🧾"}</span>
          <h3 style={{ ...styles.cardTitle, margin: 0 }}>
            {delivered ? "Delivery receipt" : "Claim receipt"} — Bundle #{bundle.id}
          </h3>
        </div>
        <p style={styles.cardSub}>
          {delivered
            ? "This bundle was received and verified on-chain."
            : "This bundle is reserved to your organization, awaiting delivery."}
        </p>

        <Row label="Item">{CATEGORY_ICON[bundle.categoryLabel]} {bundle.categoryLabel} · {bundle.itemCount} items</Row>
        <Row label="Condition">{bundle.conditionLabel}</Row>
        <Row label="Origin">{bundle.originLocation}</Row>
        {bundle.deliveryLocation && <Row label="Deliver to">{bundle.deliveryLocation}</Row>}
        <Row label="Donor">{donor?.orgName || "Unnamed donor"}{donor?.contactInfo ? ` · ${donor.contactInfo}` : ""}</Row>
        <Row label="Donor wallet"><code>{shortAddr(bundle.supplier)}</code></Row>
        <Row label="Status">{bundle.statusLabel}</Row>
        <Row label="QR hash"><code style={{ fontSize: 11 }}>{bundle.qrHash.slice(0, 22)}…</code></Row>

        {loading ? (
          <div style={{ ...styles.cardSub, marginTop: 12 }}>Loading transaction data…</div>
        ) : (
          <>
            {data?.claim && <TxBlock title="Claim transaction" tx={data.claim} copied={copied} onCopy={copy} />}
            {data?.delivery && <TxBlock title="Delivery transaction" tx={data.delivery} copied={copied} onCopy={copy} />}
            {!data?.claim && !data?.delivery && (
              <div style={{ ...styles.cardSub, marginTop: 12 }}>No transaction events found.</div>
            )}
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>
              Running on a local chain — there is no public block explorer. On a real network the
              tx hash above would open in Etherscan or similar.
            </div>
          </>
        )}

        <button style={{ ...styles.btn, ...styles.btnGray, width: "100%", marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
