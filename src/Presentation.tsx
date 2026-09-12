import { useEffect, useId, useRef, useState } from "react";
import { areas, type PilotId } from "../packages/contracts";
import { areaShareUrl } from "./AreaShare";
import "./Presentation.css";

export interface PresentationProps {
  areaId: PilotId;
  canonicalOrigin?: string;
  onExit: () => void;
}

const slides = [
  {
    title: "A report should have a next step.",
    text: "Streetwise Safety lets people see what happened after they shared a concern.",
    steps: ["Keep a private receipt", "See the review state", "Return for updates and corrections"],
  },
  {
    title: "Start with local sources.",
    text: "Read dated local information and find listed help locations for your area.",
    steps: ["Check who published the information", "Check its date and coverage", "Check help availability before relying on it"],
  },
  {
    title: "Follow the report through review.",
    text: "The report trial uses fictional reports and reviews. It does not send reports to a council or police.",
    steps: ["Share a fictional report privately", "Review before public publication", "Keep corrections visible in later updates"],
  },
  {
    title: "Open your area on your phone.",
    text: "Scan the QR code to open the mobile website. No app installation is needed.",
    steps: ["Read local sources", "Switch between the list and map", "Find help and check its source"],
  },
];

export function Presentation({ areaId, canonicalOrigin, onExit }: PresentationProps) {
  const [index, setIndex] = useState(0);
  const [qr, setQr] = useState<{ url: string; image: string }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const url = areaShareUrl(areaId, canonicalOrigin);
  const area = areas.find((item) => item.id === areaId);
  const slide = slides[index];

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    setQr(undefined);
    setFailed(false);
    if (!url) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, {
        errorCorrectionLevel: "M", margin: 4, width: 1024,
        color: { dark: "#000000", light: "#ffffff" },
      }))
      .then((image) => { if (!cancelled) setQr({ url, image }); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url, attempt]);

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        target instanceof Element && target.closest(
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [role="tab"], [role="combobox"]',
        )) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => Math.min(slides.length - 1, current + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
      }
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, []);

  return (
    <main className="streetwise-presentation" aria-labelledby={titleId}>
      <header className="presentation-header">
        <span className="presentation-brand">Streetwise Safety</span>
        <span className="presentation-area">{area?.name ?? "Select an area"}</span>
        <button type="button" onClick={onExit}>Exit presentation</button>
      </header>
      <div className="presentation-layout">
        <section className="presentation-slide" aria-label="Presentation slide">
          <div className="presentation-content">
            <p className="presentation-count" role="status" aria-live="polite" aria-atomic="true">
              Slide {index + 1} of {slides.length}
            </p>
            <h1 id={titleId} ref={heading} tabIndex={-1}>{slide.title}</h1>
            <p className="presentation-intro">{slide.text}</p>
            <ol className="presentation-steps">
              {slide.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          <nav className="presentation-controls" aria-label="Slide controls">
            <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous slide</button>
            <button type="button" disabled={index === slides.length - 1} onClick={() => setIndex(index + 1)}>Next slide</button>
          </nav>
        </section>
        <aside className="presentation-scan" aria-label="Open the mobile website">
          <h2>Scan for {area?.shortName ?? "your area"}</h2>
          {!url ? <p role="status">The QR code will be available when the public website is ready.</p> : <>
            {qr?.url === url ? <>
              <img className="presentation-qr" src={qr.image} width="1024" height="1024" alt={`QR code to open ${area?.name} on the mobile website`} />
              <a className="presentation-download" href={qr.image} download={`streetwise-${areaId}-qr.png`}>Download QR code</a>
            </> : failed ? <div role="alert">
              <p>Could not create the QR code. Open the website link below.</p>
              <button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry QR code</button>
            </div> : <p role="status">Creating QR code.</p>}
            <a className="presentation-url" href={url}>{url}</a>
          </>}
        </aside>
      </div>
      <footer className="presentation-footer">Community reports and reviews are fictional. This is not an emergency service.</footer>
    </main>
  );
}
