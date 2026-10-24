import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../lib/format';
import { repo } from '../store/repo';
import { DEFAULT_ENDPOINT, fetchRepos, requestBackfill, syncProject, type CompanionRepo } from '../sync/companion';
import { Dialog } from './Dialog';

const PROVIDER_LABEL: Record<CompanionRepo['kind'], string> = { local: 'local builds', vercel: 'Vercel', netlify: 'Netlify' };

export function ConnectRepoDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [repos, setRepos] = useState<CompanionRepo[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = useLiveQuery(async () => (await repo.listProjects()).filter((p) => p.source)) ?? [];

  const load = useCallback(async () => {
    setError('');
    setRepos(null);
    try {
      setRepos(await fetchRepos(endpoint));
    } catch {
      setError('offline');
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRepo = repos?.find((r) => r.id === selected);
  const projectFor = (r: CompanionRepo) => connected.find((p) => p.source!.endpoint === endpoint && p.source!.repo === r.id);

  async function connect() {
    const target = selectedRepo;
    if (!target) return;
    const existing = projectFor(target);
    if (existing) return navigate(`/p/${existing.id}`);
    setBusy(true);
    const project = await repo.createSyncedProject({
      name: target.name,
      source: { kind: 'git', endpoint, repo: target.id, provider: target.kind, marker: target.marker },
    });
    await syncProject(project).catch(() => {});
    // Pull in marked commits made before the repo was set up.
    await requestBackfill(endpoint, target.id).catch(() => {});
    navigate(`/p/${project.id}`);
  }

  return (
    <Dialog title="Connect a git repo" onClose={onClose}>
      <p className="muted" style={{ marginTop: -8 }}>
        Every commit with the marker in its message becomes a version, built from that exact commit.
      </p>

      {error === 'offline' ? (
        <div className="version-card" style={{ margin: '16px 0' }}>
          <p style={{ marginTop: 0 }}>
            <strong>The Organiser companion isn’t running.</strong> In your prototype’s repo, run:
          </p>
          <pre className="code">organiser init</pre>
          <p className="muted" style={{ marginBottom: 0 }}>
            That sets up the repo and starts the companion. Already set up? Start it with <code>organiser serve</code>.
            No <code>organiser</code> command yet? Run <code>npm link</code> once in the Organiser <code>cli</code> folder.
          </p>
        </div>
      ) : !repos ? (
        <p className="muted">Looking for repos…</p>
      ) : repos.length === 0 ? (
        <div className="version-card" style={{ margin: '16px 0' }}>
          <p style={{ marginTop: 0 }}>The companion is running, but no repos are set up yet. In your prototype’s repo, run:</p>
          <pre className="code">organiser init</pre>
        </div>
      ) : (
        <div className="stack" style={{ margin: '16px 0' }}>
          {repos.map((r) => {
            const project = projectFor(r);
            return (
              <button
                key={r.id}
                className={`pill ${selected === r.id ? 'is-selected' : ''}`}
                style={{ padding: '0 92px', minHeight: 58, flexDirection: 'column' }}
                onClick={() => setSelected(r.id)}
                onDoubleClick={() => {
                  setSelected(r.id);
                  void connect();
                }}
              >
                {r.name}
                <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                  {r.versions} {r.versions === 1 ? 'version' : 'versions'} · {PROVIDER_LABEL[r.kind]}
                  {r.latest && ` · ${timeAgo(Date.parse(r.latest))}`}
                </span>
                <span className="pill-meta">{project ? <span className="badge">Connected</span> : <code>{r.marker}</code>}</span>
              </button>
            );
          })}
        </div>
      )}

      <details>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
          Companion address
        </summary>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value.replace(/\/$/, ''))} />
          <button className="btn btn-sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </details>

      <div className="dialog-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        {error === 'offline' ? (
          <button className="btn btn-dark" onClick={() => void load()}>
            Check again
          </button>
        ) : (
          <button
            className="btn btn-dark"
            disabled={!selected || busy}
            onClick={() => void connect()}
          >
            {selectedRepo && projectFor(selectedRepo) ? 'Open project' : 'Connect'}
          </button>
        )}
      </div>
    </Dialog>
  );
}
