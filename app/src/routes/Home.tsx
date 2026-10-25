import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BuildBadge } from '../components/BuildStatus';
import { PlusIcon } from '../components/icons';
import { VersionDialog, type VersionFormValues } from '../components/VersionDialog';
import { normaliseUrl } from '../lib/format';
import { repo } from '../store/repo';
import type { Project, Version } from '../store/types';

// Local dev serves the demo on its own port; deployments serve it at /demo/.
const DEMO_URL = normaliseUrl(location.hostname === 'localhost' ? 'localhost:5174' : `${location.origin}/demo/`);

interface Summary {
  project: Project;
  latest?: Version;
  versionCount: number;
  open: number;
}

async function loadSummaries(): Promise<Summary[]> {
  const projects = await repo.listProjects();
  return Promise.all(
    projects.map(async (project) => {
      const versions = await repo.listVersions(project.id);
      const latest = versions[0];
      const counts = latest ? await repo.countComments([latest.id]) : {};
      return { project, latest, versionCount: versions.length, open: latest ? (counts[latest.id]?.open ?? 0) : 0 };
    }),
  );
}

export function Home() {
  const summaries = useLiveQuery(loadSummaries);
  const [dialog, setDialog] = useState<Partial<VersionFormValues> | null>(null);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const active = summaries?.filter((s) => !s.project.archived) ?? [];
  const archived = summaries?.filter((s) => s.project.archived) ?? [];
  const hasDemo = summaries?.some((s) => s.latest?.url === DEMO_URL) ?? true;

  /** One click: create the demo project and open it in the viewer. */
  async function tryDemo() {
    const { version } = await repo.createProject({ name: 'Demo prototype', url: DEMO_URL, note: 'First pass' });
    navigate(`/v/${version.id}`);
  }

  async function create(values: VersionFormValues) {
    const { project } = await repo.createProject({
      name: values.projectName,
      url: values.url,
      note: values.note,
      commit: values.commit,
    });
    setDialog(null);
    navigate(`/p/${project.id}`);
  }

  async function exportAll() {
    const data = await repo.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `organiser-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(file: File) {
    try {
      const result = await repo.importAll(JSON.parse(await file.text()));
      setMessage(`Imported ${result.projects} projects and ${result.versions} versions.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page">
      <div className="column">
        <h1 className="page-title">Prototypes</h1>
        <p className="page-sub">Every iteration, and the feedback on it, in one place.</p>

        {summaries && summaries.length === 0 && (
          <p className="muted" style={{ textAlign: 'center', margin: '-16px 0 24px' }}>
            See how it works with a demo, or add something you built in Claude Code or Cursor.
          </p>
        )}

        <div className="stack">
          {active.map((s) => (
            <Link key={s.project.id} to={`/p/${s.project.id}`} className="pill">
              {s.project.name}
              <span className="pill-meta">
                {s.project.source ? <span className="badge">git</span> : s.latest?.name}
                {s.latest && <BuildBadge status={s.latest.status} />}
                {s.open > 0 && <span className="count">{s.open}</span>}
              </span>
            </Link>
          ))}
        </div>

        <div className="stack home-actions">
          {!hasDemo && (
            <button className="pill is-primary" onClick={tryDemo}>
              Try the demo prototype
            </button>
          )}
          <button className="pill is-secondary" onClick={() => setDialog({})}>
            <PlusIcon size={14} style={{ marginRight: 6 }} /> New project from a URL
          </button>
          <button className="pill is-secondary" disabled aria-describedby="git-soon">
            Connect a git repo
            <span className="pill-meta">
              <span className="badge" id="git-soon">
                Coming soon
              </span>
            </span>
          </button>
        </div>

        {archived.length > 0 && (
          <>
            <div className="section-label">Archived</div>
            <div className="stack">
              {archived.map((s) => (
                <Link key={s.project.id} to={`/p/${s.project.id}`} className="pill is-muted">
                  {s.project.name}
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="row" style={{ justifyContent: 'center', marginTop: 48 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportAll}>
            Export backup
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {message && (
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            {message}
          </p>
        )}
      </div>

      {dialog && <VersionDialog mode="project" initial={dialog} onSubmit={create} onClose={() => setDialog(null)} />}
    </div>
  );
}
