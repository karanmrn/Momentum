import { useEffect, useId, useRef, useState } from "react";
import { areas, type PilotId } from "../packages/contracts";
import "./AreaShare.css";

export interface AreaShareProps {
  areaId: PilotId;
  canonicalOrigin?: string;
}

export function areaShareUrl(
  areaId: PilotId,
  canonicalOrigin?: string,
): string | undefined {
  if (!canonicalOrigin || !areas.some((area) => area.id === areaId)) return;
  try {
    const origin = new URL(canonicalOrigin);
    const host = origin.hostname.toLowerCase();
    // The caller supplies the verified deployment origin, never the current preview URL.
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.port ||
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)
    )
      return;
    const url = new URL("/", origin.origin);
    url.searchParams.set("area", areaId);
    return url.href;
  } catch {
    return;
  }
}

export function AreaShare({ areaId, canonicalOrigin }: AreaShareProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<{ url: string; image: string }>();
  const [qrError, setQrError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const url = areaShareUrl(areaId, canonicalOrigin);
  const area = areas.find((item) => item.id === areaId);

  useEffect(() => {
    setMessage("");
    setQrError(false);
    setQr(undefined);
    if (!open || !showQr || !url) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 4,
          width: 1024,
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((image) => {
        if (!cancelled) setQr({ url, image });
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, showQr, url, attempt]);

  function close() {
    dialog.current?.close();
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage("Could not copy. Select and copy the link below.");
    }
  }
  async function share() {
    if (!url) return;
    try {
      await navigator.share({ title: `Momentum: ${area?.name}`, url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Could not share. Copy the link instead.");
      }
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button secondary area-share-trigger"
        onClick={() => {
          setShowQr(window.matchMedia("(min-width: 760px)").matches);
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        Share area
      </button>
      <dialog
        ref={dialog}
        className="area-share-dialog"
        aria-labelledby={headingId}
        onClose={() => {
          setOpen(false);
          setMessage("");
          trigger.current?.focus();
        }}
      >
        <div className="area-share-header">
          <h2 id={headingId}>Share {area?.shortName ?? "area"}</h2>
          <button
            type="button"
            className="area-share-close"
            aria-label="Close area sharing"
            onClick={close}
          >
            ×
          </button>
        </div>
        {!url ? (
          <p role="status">
            Sharing will be available when the public website is ready.
          </p>
        ) : (
          <>
            <div className="area-share-actions">
              <button type="button" className="button primary" onClick={copy}>
                Copy link
              </button>
              {typeof navigator.share === "function" && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={share}
                >
                  Share link
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                aria-expanded={showQr}
                onClick={() => setShowQr(!showQr)}
              >
                {showQr ? "Hide QR code" : "Show QR code"}
              </button>
            </div>
            <p role="status" className="area-share-status">
              {message}
            </p>
            <label className="area-share-link">
              Website link
              <input
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            {showQr && (
              <div className="area-share-code">
                {qr?.url === url ? (
                  <>
                    <img
                      src={qr.image}
                      width="256"
                      height="256"
                      alt={`QR code for ${area?.name} on Momentum`}
                    />
                    <p>Scan to open {area?.name}.</p>
                    <a
                      className="button secondary"
                      href={qr.image}
                      download={`streetwise-${areaId}-qr.png`}
                    >
                      Download QR
                    </a>
                  </>
                ) : qrError ? (
                  <>
                    <p role="alert">
                      Could not create the QR code. You can still copy the link.
                    </p>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setAttempt(attempt + 1)}
                    >
                      Try again
                    </button>
                  </>
                ) : (
                  <p role="status">Creating QR code.</p>
                )}
              </div>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
