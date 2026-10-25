import { useOrganiser } from '@organiser/sdk/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

// A login page with two variants of the left-hand panel:
//   Static   – one illustration with a quote
//   Carousel – slides that advance on a timer
// and three form states: Empty, Filled, Error.

const SLIDE_MS = 4000;

const SLIDES = [
  {
    title: 'Every iteration, in one place.',
    text: 'Keep the history of what you designed and why, without digging through branches.',
    art: 'art-dawn',
  },
  {
    title: 'Feedback that sticks.',
    text: 'Pin comments to the exact element, on the exact version, in the exact state.',
    art: 'art-dusk',
  },
  {
    title: 'Ship the one that works.',
    text: 'Compare variants side by side and move forward with confidence.',
    art: 'art-meadow',
  },
];

const FILLED = { email: 'amal@lumen.app', password: 'correct-horse' };

function Art({ variant }: { variant: string }) {
  return (
    <svg className="art-shapes" viewBox="0 0 400 400" aria-hidden>
      {variant === 'art-dusk' ? (
        <>
          <circle cx="250" cy="150" r="90" />
          <rect x="70" y="220" width="180" height="110" rx="24" />
        </>
      ) : variant === 'art-meadow' ? (
        <>
          <path d="M40 320 C 120 200, 220 200, 360 300 L 360 360 L 40 360 Z" />
          <circle cx="120" cy="130" r="54" />
        </>
      ) : (
        <>
          <circle cx="200" cy="190" r="120" />
          <circle cx="290" cy="280" r="46" />
        </>
      )}
    </svg>
  );
}

function StaticPanel() {
  return (
    <aside className="panel art-dawn" data-organiser-id="panel">
      <Art variant="art-dawn" />
      <div className="panel-copy">
        <p className="quote">“We stopped losing good ideas the week we started keeping every version.”</p>
        <p className="quote-by">Priya Shah · Design Lead, Northwind</p>
      </div>
    </aside>
  );
}

function CarouselPanel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [index]); // restarting on manual change gives each slide its full time

  return (
    <aside className="panel carousel" data-organiser-id="panel" aria-roledescription="carousel">
      {SLIDES.map((slide, i) => (
        <div key={slide.title} className={`slide ${slide.art} ${i === index ? 'is-active' : ''}`} aria-hidden={i !== index}>
          <Art variant={slide.art} />
          <div className="panel-copy">
            <h2>{slide.title}</h2>
            <p>{slide.text}</p>
          </div>
        </div>
      ))}
      <div className="dots" data-organiser-id="carousel-dots">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            className={i === index ? 'is-active' : ''}
            aria-label={`Show slide ${i + 1}`}
            onClick={() => setIndex(i)}
          >
            {i === index && <span className="progress" key={index} style={{ animationDuration: `${SLIDE_MS}ms` }} />}
          </button>
        ))}
      </div>
    </aside>
  );
}

function LoginForm({ socialFirst }: { socialFirst: boolean }) {
  const { states, setState } = useOrganiser();
  const form = states.form ?? 'Empty';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  // Social-first layout: the email form stays tucked away until it's needed.
  const [showEmail, setShowEmail] = useState(form !== 'Empty');
  // Set when the form itself moves to Error, so what you typed is kept.
  const keepInput = useRef(false);

  // The toolbar state drives what's in the form.
  useEffect(() => {
    setBusy(false);
    setShowEmail(form !== 'Empty');
    if (keepInput.current) {
      keepInput.current = false;
      return;
    }
    setEmail(form === 'Empty' ? '' : FILLED.email);
    setPassword(form === 'Empty' ? '' : form === 'Error' ? 'wrong-password' : FILLED.password);
  }, [form]);

  const isError = form === 'Error';

  function submit(e: FormEvent) {
    e.preventDefault();
    // Real interactions feed back into the toolbar state.
    if (!email || !password || password !== FILLED.password) {
      keepInput.current = form !== 'Error';
      setState('form', 'Error');
      return;
    }
    setBusy(true);
    setTimeout(() => setBusy(false), 1400);
  }

  const errorAlert = (
    <div className="alert" role="alert" data-organiser-id="error-alert">
      Incorrect email or password. Try again or reset your password.
    </div>
  );

  const emailFields = (
    <>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={isError ? 'has-error' : ''}
          autoComplete="email"
        />
      </label>

      <label className="field">
        <span className="row">
          Password
          <a href="#" className="link">
            Forgot password?
          </a>
        </span>
        <span className="password">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={isError ? 'has-error' : ''}
            autoComplete="current-password"
          />
          <button type="button" className="reveal" onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </span>
        {isError && <span className="field-error">That password doesn’t match this account.</span>}
      </label>

      <label className="remember">
        <input type="checkbox" defaultChecked /> Keep me signed in
      </label>
    </>
  );

  const signInLabel = (dark: boolean) =>
    busy ? <span className={`spinner ${dark ? '' : 'is-dark'}`} aria-label="Signing in" /> : 'Sign in with email';

  return (
    <main className="form-side">
      <div className="brand" data-organiser-id="brand">
        <span className="brand-mark" /> Lumen
      </div>

      <form className="form" onSubmit={submit} noValidate data-organiser-id="login-form">
        <h1 data-organiser-id="heading">Welcome back</h1>
        <p className="sub">Sign in to pick up where you left off.</p>

        {/* With social sign-in first, the error sits with the email form it belongs to. */}
        {isError && !socialFirst && errorAlert}

        {socialFirst ? (
          <>
            {/* Social sign-in leads; email is the fallback. */}
            <div className="social" data-organiser-id="social-buttons">
              <button type="button" className="primary with-icon">
                <MailIcon /> Continue with Gmail
              </button>
              <button type="button" className="secondary with-icon">
                <GridIcon /> Continue with Microsoft Outlook
              </button>
            </div>

            <div className="divider">
              <span>or</span>
            </div>

            {showEmail ? (
              <div className="email-option" data-organiser-id="email-option">
                {isError && errorAlert}
                {emailFields}
                <button className="secondary" disabled={busy || (!email && !password)} data-organiser-id="sign-in">
                  {signInLabel(false)}
                </button>
              </div>
            ) : (
              <button type="button" className="text-button" onClick={() => setShowEmail(true)} data-organiser-id="use-email">
                Sign in with email instead
              </button>
            )}
          </>
        ) : (
          <>
            {emailFields}
            <button className="primary" disabled={busy || (!email && !password)} data-organiser-id="sign-in">
              {busy ? <span className="spinner" aria-label="Signing in" /> : 'Sign in'}
            </button>

            <div className="divider">
              <span>or</span>
            </div>
            <button type="button" className="secondary">
              Continue with SSO
            </button>
          </>
        )}

        <p className="footer">
          New to Lumen? <a href="#" className="link">Create an account</a>
        </p>
      </form>
    </main>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="2" width="9.5" height="9.5" rx="1" fill="#f25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" rx="1" fill="#7fba00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" rx="1" fill="#00a4ef" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" rx="1" fill="#ffb900" />
    </svg>
  );
}

export function App() {
  const { variant } = useOrganiser();
  const carousel = variant === 'Carousel';
  return (
    <div className="login">
      {carousel ? <CarouselPanel /> : <StaticPanel />}
      <LoginForm socialFirst={carousel} />
    </div>
  );
}
