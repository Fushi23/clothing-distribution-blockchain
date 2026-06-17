import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { styles } from "../styles";
import { decodeQrPayload } from "../lib";

// Modal that scans a bag's QR with the device camera, with a manual-entry
// fallback. Calls onResult({ bundleId, qrHash }) when a valid code is read.
export default function QrScannerModal({ onResult, onClose }) {
  const regionId = "qr-scan-region";

  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState("starting"); // starting | scanning | failed
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState("");

  // Discover available cameras once.
  useEffect(() => {
    let cancelled = false;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return;
        if (!devices || devices.length === 0) {
          setError("No camera found. Use manual entry below.");
          setStatus("failed");
          return;
        }
        setCameras(devices);
        // Prefer a back/rear camera if labelled (mobile); otherwise the first.
        const back = devices.find((d) => /back|rear|environment/i.test(d.label));
        setCameraId((back || devices[0]).id);
      })
      .catch((e) => {
        if (cancelled) return;
        setError("Camera access blocked or unavailable — use manual entry. (" + (e?.message || e) + ")");
        setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)start the stream whenever the chosen camera changes.
  useEffect(() => {
    if (!cameraId) return;
    const html5 = new Html5Qrcode(regionId);
    let handled = false; // a code was read; don't fire onResult twice
    let tornDown = false; // stop() already requested
    // Reset to the loading state each time we (re)start on a new camera.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("starting");

    // Stop the camera at most once, swallowing the "not running" errors that
    // happen during React StrictMode's double-mount.
    async function safeStop() {
      if (tornDown) return;
      tornDown = true;
      try {
        if (html5.isScanning) await html5.stop();
      } catch {
        /* already stopped */
      }
    }

    html5
      .start(
        cameraId,
        {
          fps: 10,
          qrbox: (vw, vh) => {
            const size = Math.floor(Math.min(vw, vh) * 0.7);
            return { width: size, height: size };
          },
        },
        async (decodedText) => {
          if (handled) return;
          const parsed = decodeQrPayload(decodedText);
          if (!parsed) return;
          handled = true;
          // Fully stop the camera BEFORE telling the parent to close the modal,
          // so the library never touches the DOM after React unmounts it.
          await safeStop();
          onResult(parsed);
        },
        () => {}
      )
      .then(() => {
        if (!tornDown) setStatus("scanning");
      })
      .catch((e) => {
        setError("Could not start camera — try another below or use manual entry. (" + (e?.message || e) + ")");
        setStatus("failed");
      });

    return () => {
      safeStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  function submitManual() {
    const parsed = decodeQrPayload(manual);
    if (!parsed) {
      setError("Not a valid BCDS code. Expected 'bcds:<id>:<0xhash>' or a 0x… hash.");
      return;
    }
    onResult(parsed);
  }

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <style>{`
        #${regionId} video { width: 100% !important; height: 100% !important; object-fit: cover; }
        #${regionId} img, #${regionId} button { display: none; }
      `}</style>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.cardTitle}>📷 Scan bag QR to confirm receipt</h3>
        <p style={styles.cardSub}>
          Hold the QR steady, ~15–25&nbsp;cm from the camera, well lit and in focus.
        </p>

        <div style={cameraBox}>
          <div id={regionId} style={{ width: "100%", height: "100%" }} />
          {status === "scanning" && <div style={aimFrame} />}
          {status === "starting" && <div style={overlayText}>Starting camera… allow access</div>}
          {status === "failed" && <div style={overlayText}>Camera unavailable — use manual entry ↓</div>}
        </div>

        {cameras.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <label style={styles.label}>Camera</label>
            <select style={styles.input} value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
              {cameras.map((c, i) => (
                <option key={c.id} value={c.id}>{c.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          </div>
        )}

        {error && <div style={{ ...styles.log, color: "#fca5a5" }}>{error}</div>}

        <div style={{ marginTop: 16 }}>
          <label style={styles.label}>Manual entry (paste code)</label>
          <input
            style={styles.input}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="bcds:1:0x… or 0x…"
          />
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            Camera not cooperating? Paste the bundle's <code>bcds:&lt;id&gt;:&lt;hash&gt;</code> code here instead.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button style={{ ...styles.btn, ...styles.btnGreen, flex: 1 }} onClick={submitManual}>
            Verify code
          </button>
          <button style={{ ...styles.btn, ...styles.btnGray }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const cameraBox = {
  position: "relative",
  width: "100%",
  height: 260,
  backgroundColor: "#0f172a",
  borderRadius: 10,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const aimFrame = {
  position: "absolute",
  width: 170,
  height: 170,
  border: "3px solid rgba(255,255,255,0.85)",
  borderRadius: 12,
  pointerEvents: "none",
};

const overlayText = {
  position: "absolute",
  color: "#cbd5e1",
  fontSize: 13,
  fontFamily: "monospace",
  textAlign: "center",
  padding: "0 12px",
};
