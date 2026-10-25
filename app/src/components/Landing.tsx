import { useEffect, useState } from 'react';
import { ArrowRightIcon } from './icons';

// Landing page: what Organiser is, a small animated preview of the viewer,
// and the way into the app (where the demo is one click away).

const STEP_MS = 1600;
// Preview stages: 0 v1 Static · 1 v2 Static · 2 v3 Carousel · 3 v3 Carousel with pins
const STAGES = 4;

function usePreviewStage() {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [stage, setStage] = useState(reduced ? STAGES - 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setStage((s) => (s + 1) % (STAGES + 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [reduced]);
  // One extra tick holds the final frame before looping.
  return Math.min(stage, STAGES - 1);
}

function PreviewCard({ onOpen }: { onOpen: () => void }) {
  const stage = usePreviewStage();
  const version = Math.min(stage, 2);
  const carousel = stage >= 2;
  const pins = stage >= 3;

  return (
    <button className="preview-card" onClick={onOpen} aria-label="Open the app">
      <div className="preview-top">
        {['v1', 'v2', 'v3'].map((v, i) => (
          <span key={v} className={`preview-tab ${i === version ? 'is-active' : ''}`}>
            {v}
          </span>
        ))}
        <span className="preview-title">Login page</span>
      </div>

      <div className="preview-frame" aria-hidden>
        <div className={`mini-banner ${carousel ? 'is-carousel' : ''}`}>
          <span className="mini-line is-light" style={{ width: '70%' }} />
          <span className="mini-line is-light" style={{ width: '45%' }} />
          {carousel && (
            <span className="mini-dots">
              <i className="is-active" />
              <i />
              <i />
            </span>
          )}
        </div>
        <div className="mini-form">
          <span className={`mini-heading ${version >= 1 ? 'is-big' : ''}`} />
          <span className="mini-line" style={{ width: '60%' }} />
          <span className="mini-input" />
          <span className="mini-input" />
          <span className="mini-button" />
        </div>
        <span className={`pin preview-pin ${pins ? 'is-shown' : ''}`} style={{ left: '22%', top: '38%' }}>
          1
        </span>
        <span className={`pin preview-pin ${pins ? 'is-shown' : ''}`} style={{ left: '78%', top: '22%', transitionDelay: '0.25s' }}>
          2
        </span>
      </div>

      <div className="preview-controls" aria-hidden>
        <span className="seg">
          <span className={`seg-item ${!carousel ? 'is-active' : ''}`}>Static</span>
          <span className={`seg-item ${carousel ? 'is-active' : ''}`}>Carousel</span>
        </span>
        <span className="seg">
          <span className="seg-item is-active">Empty</span>
          <span className="seg-item">Filled</span>
          <span className="seg-item">Error</span>
        </span>
      </div>
    </button>
  );
}

const STEPS = [
  {
    title: 'Save every version',
    text: 'Paste the URL of what you built in Claude Code or Cursor. Committing with [v] is coming soon.',
  },
  {
    title: 'Switch variants and states',
    text: 'Flip between layout options and empty, filled or error states without leaving the page.',
  },
  {
    title: 'Pin feedback to the element',
    text: 'Comments stay on the exact button or heading, on the exact version they were left on.',
  },
];

interface Props {
  onOpenApp: () => void;
  onAddPrototype: () => void;
}

export function Landing({ onOpenApp, onAddPrototype }: Props) {
  return (
    <div className="landing">
      <header className="landing-header">
        <span className="wordmark">
          <span className="wordmark-mark" /> Organiser
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onOpenApp}>
          Your prototypes
        </button>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">For designers who build in code</p>
          <h1 className="landing-title">Every iteration of your prototype, with feedback pinned right where it belongs.</h1>
          <p className="landing-sub">
            Keep every version you build in Claude Code or Cursor, flip between variants and states, and leave comments on
            the exact element.
          </p>
          <div className="landing-actions">
            <button className="btn btn-dark btn-lg" onClick={onOpenApp}>
              Open the app <ArrowRightIcon size={16} />
            </button>
            <button className="text-link" onClick={onAddPrototype}>
              Add your own prototype
            </button>
          </div>
          <p className="landing-note">No sign-up. Inside, try the demo: a login page with 2 variants, 3 states and 2 comments.</p>
        </div>

        <PreviewCard onOpen={onOpenApp} />
      </section>

      <ol className="landing-steps">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="step-num">{i + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
