import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Renders a QR code (data URL) for an arbitrary string payload.
export default function QrImage({ payload, size = 160 }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(payload, { width: size, margin: 1 })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(""));
    return () => {
      active = false;
    };
  }, [payload, size]);

  if (!src) return <div style={{ width: size, height: size, background: "#f1f5f9" }} />;
  return <img src={src} width={size} height={size} alt="QR code" style={{ borderRadius: 8 }} />;
}
