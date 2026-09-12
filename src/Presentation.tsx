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
    image: "/presentation/slide-01.jpg",
    text: "She Knows This Route. She Still Doesn't Feel Safe. A woman walks home along a familiar London street. She's harassed. She doesn't report it — she's reported things before, and nothing changed. So next time, she just takes a different route.",
  },
  {
    image: "/presentation/slide-02.jpg",
    text: "UN SDG 5: GENDER EQUALITY The Scale of the Problem 83% of young women in London experienced harassment or assault in public spaces in the last 2 years 82% feel unsafe walking alone in parks after dark; 50% on quiet streets near home 70%+ of UK women have experienced sexual harassment in public spaces Sources: 83%, 82% & 50% — TfL/City of London Women's Safety Survey 2023; 70%+ — UK Government Equalities Office survey on sexual harassment in public spaces.",
  },
  {
    image: "/presentation/slide-03.jpg",
    text: "🎯  UN Sustainable Development Goal 5 — Gender Equality This project directly addresses SDG 5: achieving gender equality and empowering all women and girls. The Problem Isn't Knowledge. It's Trust. Women know how to report. They choose not to — because they've stopped believing it makes a difference. 4% of women who experience harassment ever report it to officials 45% don't report because they don't believe anything will change The Result She avoids the route. The problem stays invisible. Nothing improves. This is a  trust gap  — not a reporting gap. Until women believe their voice leads to action, avoidance will always feel safer than speaking up. Sources: 4% figure from UK Government Equalities Office survey on sexual harassment; 45% from Women's Aid research on reporting barriers.",
  },
  {
    image: "/presentation/slide-04.jpg",
    text: "Why Now? The Moment is Here This isn't hypothetical. Government and institutions are actively funding and prioritising women's safety in London right now. 01 Sadiq Khan's £15.6m Fund (announced 4 September 2026) Dedicated funding for safer streets, parks, and public spaces for women and girls — delivered via City Hall, MOPAC, and TfL. Built on a 2024 five-borough pilot that gathered direct feedback from women and girls. 02 Part of a Wider £37m VAWG Strategy Women's safety is now a strategic priority across London's institutions. 03 The Safer Streets Fund (£120m+ since 2020) The national fund now accepts bids from civil society organisations — not just police and councils. This is our pathway to scale. The window is open. Institutions are ready to act. They're waiting for the data and tools to do it.",
  },
  {
    image: "/presentation/slide-05.jpg",
    text: "Why Reporting Fails Today Fragmented Police reports, social media posts, council complaints — scattered across disconnected systems with no unified picture of where harm is happening. Silent Women who report never see evidence that anything changed. There is no confirmation, no follow-up, no visible outcome — the feedback loop is completely broken. Unactionable Data sits in silos, disconnected from decision-makers. Institutions can't see the full pattern, so they don't know where to focus resources or when to intervene.",
  },
  {
    image: "/presentation/slide-06.jpg",
    text: "Momentum Our Solution: Close the Loop Most safety tools only go one direction — women report, and nothing comes back.  Momentum  is different. It creates a full feedback loop that connects reports, institutions, and visible outcomes — rebuilding the trust that makes women feel safe enough to reclaim public spaces. Aggregate Unifies user reports, police data, and social signals into a single safety picture — no more silos Act Translates that intelligence into specific, prioritised calls to action for councils, businesses, and police Close the Loop Women see real updates — resolved, in progress, or scheduled — proving that their voice drove change The goal is not to label spaces as dangerous — it's to fix them. Momentum is about reclaiming public spaces, not stigmatizing them.",
  },
  {
    image: "/presentation/slide-07.jpg",
    text: "How It Works User Reports Incident Data Aggregated Combined with police & social signals Actionable Intelligence Councils & police receive targeted alerts User Sees Change “14 new streetlights installed this month” Momentum runs as a  closed-loop system  — every report flows through aggregation and institutional action, then feeds back to the user as visible, real-world change. The loop never breaks.",
  },
  {
    image: "/presentation/slide-08.jpg",
    text: "This Model Works Crowdsourced safety reporting has a proven track record — driving demand, shaping policy, and sustaining civic engagement. Hollie Guard & WalkSafe Demand is real and immediate.  950,000+ combined users mobilised after high-profile incidents — proving people will report when the tool is accessible. Safecity / Safetipin Data creates policy.  Drove streetlight repairs in Delhi, patrol route changes, and women-only bus licences in Nepal — aggregated reports became institutional action. FixMyStreet Feedback loops sustain behaviour.  Visible status updates showing what happened after a report build public trust and keep communities reporting long-term. Visible status updates are the critical link — when users see their reports lead to action, reporting behaviour becomes self-sustaining.",
  },
  {
    image: "/presentation/slide-09.jpg",
    text: "What Success Looks Like These are the four metrics judges should use to evaluate the demo: 1 Areas drop off the safety map Resolved hotspots disappear from the map as conditions durably improve — not just flagged, but fixed 2 Footfall increases in avoided spaces Streets and parks that were previously shunned show measurable, trackable increases in pedestrian use 3 Surveyed women report feeling safer In-app surveys capture genuine, sustained improvements in perceived safety — not just one-off responses 4 Reports age out as problems are resolved Incidents close because the underlying issue was fixed — the log shrinks, not just grows",
  },
  {
    image: "/presentation/slide-10.jpg",
    text: 'LIVE DEMO Momentum Watch the Closed Loop in Action The demo is the centrepiece of Momentum. Follow the full journey — from a woman reporting an unsafe incident through to visible change on the ground — and watch for the moment the loop closes. 1 Report A woman submits an unsafe incident via the app 2 Aggregate Her report surfaces a verified hotspot on the data layer 3 Act The council receives prioritised, actionable intelligence 4 Close She sees the result:  "14 new streetlights installed this month;  zone  now Purple Flag accredited." Watch for the closed loop  — this is what makes Momentum different. Not just a reporting tool. A system that proves action was taken.',
  },
];

function initialSlide() {
  const raw = new URLSearchParams(window.location.search).get("slide");
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= slides.length
    ? value - 1
    : 0;
}

export function Presentation({
  areaId,
  canonicalOrigin,
  onExit,
}: PresentationProps) {
  const [index, setIndex] = useState(initialSlide);
  const [qr, setQr] = useState<{ url: string; image: string }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const url = areaShareUrl(areaId, canonicalOrigin);
  const area = areas.find((item) => item.id === areaId);
  const slide = slides[index];
  function journeyUrl(tab: string) {
    return `/?${new URLSearchParams({ public: "1", tab, area: areaId, returnTo: "presentation", slide: String(index + 1) })}`;
  }
  useEffect(() => {
    const current = new URL(window.location.href);
    current.searchParams.set("slide", String(index + 1));
    window.history.replaceState(window.history.state, "", current);
  }, [index]);

  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    setQr(undefined);
    setFailed(false);
    if (!url) return;
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
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, attempt]);

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [role="tab"], [role="combobox"]',
          ))
      )
        return;
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
        <span className="presentation-brand">Momentum</span>
        <span className="presentation-area">
          {area?.name ?? "Select an area"}
        </span>
        <button type="button" onClick={onExit}>
          Exit presentation
        </button>
      </header>
      <div className="presentation-layout">
        <section className="presentation-slide" aria-label="Presentation slide">
          <div className="presentation-content">
            <p
              className="presentation-count"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              Slide {index + 1} of {slides.length}
            </p>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              Pitch deck
            </h1>
            <p className="presentation-boundary">
              Proposed outcomes are not verified results.
            </p>
            <img
              className="presentation-deck-image"
              src={slide.image}
              alt={`Momentum pitch deck, slide ${index + 1}. Full text below.`}
              width="1920"
              height="1080"
            />
            <details className="presentation-transcript" key={index}>
              <summary>Slide text</summary>
              <p>{slide.text}</p>
            </details>
          </div>
          <nav className="presentation-controls" aria-label="Slide controls">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              Previous slide
            </button>
            <button
              type="button"
              disabled={index === slides.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              Next slide
            </button>
          </nav>
        </section>
        <aside
          className="presentation-scan"
          aria-label="Open the mobile website"
        >
          <nav
            className="presentation-journey"
            aria-label="Explore the website"
          >
            <h2>Explore {area?.shortName ?? "your town"}</h2>
            <a href={journeyUrl("now")}>Town updates</a>
            <a href={journeyUrl("history")}>Police records</a>
            <a href={journeyUrl("community")}>Community reports</a>
            {(import.meta.env.DEV ||
              import.meta.env.VITE_DEMO_ENABLED === "true") && (
              <a
                href={`/?demo=1&workspace=community&presentation=1&area=${areaId}&slide=${index + 1}`}
              >
                Report trial
              </a>
            )}
          </nav>
          <h2>Scan for {area?.shortName ?? "your area"}</h2>
          {!url ? (
            <p role="status">
              The QR code will be available when the public website is ready.
            </p>
          ) : (
            <>
              {qr?.url === url ? (
                <>
                  <img
                    className="presentation-qr"
                    src={qr.image}
                    width="1024"
                    height="1024"
                    alt={`QR code to open ${area?.name} on the mobile website`}
                  />
                  <a
                    className="presentation-download"
                    href={qr.image}
                    download={`streetwise-${areaId}-qr.png`}
                  >
                    Download QR code
                  </a>
                </>
              ) : failed ? (
                <div role="alert">
                  <p>
                    Could not create the QR code. Open the website link below.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAttempt((current) => current + 1)}
                  >
                    Retry QR code
                  </button>
                </div>
              ) : (
                <p role="status">Creating QR code.</p>
              )}
              <a className="presentation-url" href={url}>
                {url}
              </a>
            </>
          )}
        </aside>
      </div>
      <footer className="presentation-footer">
        <a href="/presentation/Momentum.pdf" target="_blank" rel="noreferrer">
          Open slide PDF
        </a>
        <span>
          Community reports and reviews are fictional. This is not an emergency
          service.
        </span>
      </footer>
    </main>
  );
}
