import { useOrganiser } from '@organiser/sdk/react';
import { useEffect, useState, type CSSProperties } from 'react';

const css: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f6f5f0', color: '#1b1b19', font: '15px/1.5 Inter, system-ui, sans-serif' },
  wrap: { maxWidth: 760, margin: '0 auto', padding: '48px 28px 160px' },
  title: { font: '400 34px/1.15 Georgia, serif', margin: '0 0 18px', letterSpacing: '-0.01em' },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 14px 12px 18px',
    borderRadius: 999,
    background: '#ebe9e2',
    marginBottom: 28,
  },
  dark: { border: 0, borderRadius: 999, background: '#161615', color: '#fff', padding: '9px 18px', fontWeight: 500 },
  ghost: { border: 0, background: 'transparent', padding: '9px 12px', fontWeight: 500 },
  card: { background: '#fff', borderRadius: 16, padding: 22, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,.05)' },
  muted: { color: '#8e8d86' },
};

function useHashRoute() {
  const [route, setRoute] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setRoute(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

function CrmBanner({ crm, variant }: { crm: string; variant: string | null }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [crm, variant]);
  if (crm === 'None' || dismissed) return null;

  if (variant === 'B') {
    return (
      <div id="crm-banner" style={{ ...css.card, borderLeft: '4px solid #9db83a' }}>
        <strong>Save to {crm}?</strong>
        <p style={{ ...css.muted, margin: '4px 0 14px' }}>This looks like a sales call. We can file the notes for you.</p>
        <button style={css.dark}>Save to {crm}</button> <button style={css.ghost} onClick={() => setDismissed(true)}>Dismiss</button>
      </div>
    );
  }
  if (variant === 'C') {
    return (
      <div id="crm-banner" style={{ ...css.muted, fontSize: 13, marginBottom: 24 }}>
        Detected a customer call · <a href="#/">Save to {crm}</a>
      </div>
    );
  }
  return (
    <div id="crm-banner" style={css.banner}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>Do you want to save this call to {crm}?</div>
        <div style={{ ...css.muted, fontSize: 13 }}>We detected this is a sales or customer call.</div>
      </div>
      <button style={css.ghost} onClick={() => setDismissed(true)}>
        Not now
      </button>
      <button style={css.dark}>Yes</button>
    </div>
  );
}

function NotesBody({ mode }: { mode: string }) {
  if (mode === 'During') {
    return (
      <div data-organiser-id="notes" style={css.card}>
        <p style={css.muted}>Write notes…</p>
        <p>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9, background: '#c2412d', marginRight: 8 }} />
          Recording · 12:43
        </p>
      </div>
    );
  }
  if (mode === 'Paused') {
    return (
      <div data-organiser-id="notes" style={{ ...css.card, opacity: 0.7 }}>
        <p>Transcription paused. Resume when you're ready.</p>
        <button style={css.dark}>Resume</button>
      </div>
    );
  }
  if (mode === 'Brief') {
    return (
      <div data-organiser-id="notes" style={css.card}>
        <h3 style={{ marginTop: 0 }}>Before the call</h3>
        <ul>
          <li>Pineapple raised a Series A last month</li>
          <li>Last spoke 3 weeks ago about pricing</li>
          <li>Open question: SSO timeline</li>
        </ul>
      </div>
    );
  }
  return (
    <div data-organiser-id="notes">
      {['Summary', 'Decisions', 'Next steps', 'Open questions'].map((h, i) => (
        <div key={h} style={css.card}>
          <h3 style={{ marginTop: 0 }}>{h}</h3>
          <p style={css.muted}>
            {i % 2 ? 'Pricing agreed in principle; legal review next.' : 'Team aligned on a pilot with 20 seats starting in November.'}
          </p>
          <p>Follow up with the champion and share the security pack before Friday.</p>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const { variant, states, embedded } = useOrganiser();
  const route = useHashRoute();

  return (
    <div style={css.page}>
      <div style={css.wrap}>
        <nav style={{ display: 'flex', gap: 14, marginBottom: 28, fontSize: 13 }}>
          <a href="#/">Meeting</a>
          <a href="#/settings">Settings</a>
          <span style={{ ...css.muted, marginLeft: 'auto' }}>{embedded ? 'In Organiser' : 'Standalone'}</span>
        </nav>

        {route === '#/settings' ? (
          <>
            <h1 style={css.title}>Settings</h1>
            <div id="settings-card" style={css.card}>
              <strong>Integrations</strong>
              <p style={css.muted}>Connected CRM: {states.crm}</p>
            </div>
          </>
        ) : (
          <>
            <h1 style={css.title}>AllFound &lt;&gt; Pineapple</h1>
            <CrmBanner crm={states.crm} variant={variant} />
            <NotesBody mode={states.mode} />
            <p style={{ ...css.muted, textAlign: 'center', fontSize: 13, marginTop: 40 }}>
              Always get consent when transcribing others
            </p>
          </>
        )}
      </div>
    </div>
  );
}
