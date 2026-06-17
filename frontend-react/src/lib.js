// Shared enums, labels and helpers mirroring the ClothingDistribution contract.

export const CATEGORY = ["Shirts", "Pants", "Shoes", "Jackets", "Accessories", "Other"];
export const CONDITION = ["New", "Good", "Fair"];
export const BUNDLE_STATUS = ["Available", "Claimed", "Delivered", "Cancelled"];
export const APP_STATUS = ["None", "Pending", "Approved", "Rejected"];

export const APPLICANT_TYPE = { Supplier: 1, NGO: 2 };

export const STATUS_BADGE = {
  Available: { bg: "#c6f6d5", fg: "#22543d", label: "🟢 Available" },
  Claimed: { bg: "#feebc8", fg: "#7b341e", label: "🟡 Claimed" },
  Delivered: { bg: "#bee3f8", fg: "#2a4365", label: "✅ Delivered" },
  Cancelled: { bg: "#fed7d7", fg: "#742a2a", label: "⛔ Cancelled" },
};

export const CATEGORY_ICON = {
  Shirts: "👕",
  Pants: "👖",
  Shoes: "👟",
  Jackets: "🧥",
  Accessories: "🧢",
  Other: "📦",
};

// QR payload encoded onto the printed bag label and read back on scan.
export function encodeQrPayload(bundleId, qrHash) {
  return `bcds:${bundleId}:${qrHash}`;
}

export function decodeQrPayload(text) {
  const trimmed = (text || "").trim();
  // Full payload form "bcds:<id>:<0xhash>"
  const m = trimmed.match(/^bcds:(\d+):(0x[0-9a-fA-F]{64})$/);
  if (m) return { bundleId: Number(m[1]), qrHash: m[2] };
  // Bare hash fallback (manual entry)
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return { bundleId: null, qrHash: trimmed };
  return null;
}

export function shortAddr(a) {
  if (!a || a === "0x0000000000000000000000000000000000000000") return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function errMsg(err) {
  return err?.reason || err?.shortMessage || err?.info?.error?.message || err?.message || String(err);
}
