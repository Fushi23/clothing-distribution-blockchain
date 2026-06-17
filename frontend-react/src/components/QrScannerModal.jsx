import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { styles } from "../styles";
import { decodeQrPayload } from "../lib";

// Modal that scans a bag's QR with the device camera, with a manual-entry
// fallback. Calls onResult({ bundleId, qrHash }) when a valid code is read.
export default function QrScannerModal({ onResult, onClose }) {
  const regionId = "qr-scan-region";
  const scannerRef = useRef(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const [cameraOn, setCameraOn] = useState(true);

  useEffect(() => {
    if (!cameraOn) return;
    const html5 = new Html5Qrcode(regionId);
    scannerRef.current = html5;
    let stopped = false;

    html5
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          const parsed = decodeQrPayload(decodedText);
          if (parsed) {
            stopAndClose(parsed);
          }
        },
        () => {} // ignore per-frame decode errors
      )
      .catch((e) => {
        setError("Camera unavailable — use manual entry below. (" + (e?.message || e) + ")");
        setCameraOn(false);
      });

    function stopAndClose(parsed) {
      if (stopped) return;
      stopped = true;
      html5
        .stop()
        .catch(() => {})
        .finally(() => onResult(parsed));
    }

    return () => {
      stopped = true;
      html5.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

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
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.cardTitle}>📷 Scan bag QR to confirm receipt</h3>
        <p style={styles.cardSub}>
          Point the camera at the QR printed on the bag. The hash is verified on-chain.
        </p>

        {cameraOn && <div id={regionId} style={{ width: "100%", borderRadius: 8, overflow: "hidden" }} />}

        {error && <div style={{ ...styles.log, color: "#fca5a5" }}>{error}</div>}

        <div style={{ marginTop: 16 }}>
          <label style={styles.label}>Manual entry (paste code)</label>
          <input
            style={styles.input}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="bcds:1:0x… or 0x…"
          />
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
