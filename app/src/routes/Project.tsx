import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BuildBadge } from '../components/BuildStatus';
import { ChevronLeftIcon, CompareIcon, PlusIcon } from '../components/icons';
import { VersionDialog, type VersionFormValues } from '../components/VersionDialog';
import { isDrifting, timeAgo } from '../lib/format';
import { repo } from '../store/repo';
import type { Version } from '../store/types';
import { requestBackfill, syncProject, useCompanionStatus } from '../sync/companion';

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const project = useLiveQuery(() => repo.getProject(projectId), [projectId], null);
  const versions = useLiveQuery(() => repo.listVersions(projectId), [projectId]) ?? [];
  const ids = versions.map((v) => v.id).join(',');
  const counts = useLiveQuery(() => repo.countComments(ids ? ids.split(',') : []), [ids]) ?? {};
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const companion = useCompanionStatus(project?.source?.endpoint);

  if (project === undefined) {
    return (
      <div className="page">
        <div className="column">
          <Link to="/" className="back-link">
            <ChevronLeftIcon size={14} /> All prototypes
          </Link>
          <p className="muted">This project no longer exists.</p>
        </div>
      </div>
    );
  }
  if (!project) return null;

  const [latest, ...earlier] = versions;

  async function save(values: VersionFormValues) {
    const version = await repo.createVersion({ projectId, ...values });
    setSaving(false);
    navigate(`/v/${version.id}`);
  }

  async function remove() {
    if (!confirm(`Delete “${project!.name}” with all ${versions.length} versions and their comments?`)) return;
    await repo.deleteProject(projectId);
    navigate('/');
  }

  async function backfill() {
    if (!project?.source) return;
    setBackfilling(true);
    await requestBackfill(project.source.endpoint, project.source.repo).catch(() => {});
    await syncProject(project).catch(() => {});
    setTimeout(() => setBackfilling(false), 1500);
  }

  const meta = (v: Version) => {
    const c = counts[v.id];
    return (
      <span className="pill-meta">
        {isDrifting(v) && !v.hasSnapshot && <span className="badge is-live">live</span>}
        <BuildBadge status={v.status} />
        {v.commit && v.source !== 'manual' && <code className="muted">{v.commit}</code>}
        {c && c.open > 0 && <span className="count">{c.open}</span>}
      </span>
    );
  };

  return (
    <div className="page">
      <div className="column">
        <Link to="/" className="back-link">
          <ChevronLeftIcon size={14} /> All prototypes
        </Link>

        {renaming ? (
          <input
            className="input page-title"
            style={{ fontSize: 30, marginBottom: 6 }}
            autoFocus
            defaultValue={project.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== project.name) void repo.updateProject(projectId, { name });
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <h1 className="page-title" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
            {project.name}
          </h1>
        )}
        <p className="page-sub">
          {versions.length} {versions.length === 1 ? 'version' : 'versions'}
          {latest && <> · updated {timeAgo(latest.createdAt)}</>}
          {project.archived && <> · archived</>}
        </p>
        {project.source && (
          <p className="page-sub row" style={{ justifyContent: 'center', marginTop: -32, fontSize: 13 }}>
            <span className={`status-dot is-${companion}`} title={`Companion ${companion}`} />
            {project.source.provider === 'local' ? 'Synced from git' : `Synced from ${project.source.provider === 'vercel' ? 'Vercel' : 'Netlify'}`}
            {' · '}commits marked <code>{project.source.marker ?? '[v]'}</code>
            {companion === 'offline' && <> · companion offline, run <code>organiser serve</code></>}
          </p>
        )}

        <div className="row" style={{ justifyContent: 'center', marginBottom: 28 }}>
          <button className={`btn ${project.source ? '' : 'btn-dark'}`} onClick={() => setSaving(true)}>
            <PlusIcon size={14} /> Save new version
          </button>
          {project.source && (
            <button className="btn" onClick={backfill} disabled={backfilling || companion === 'offline'}>
              {backfilling ? 'Checking…' : project.source.provider === 'local' ? 'Import older commits' : 'Refresh'}
            </button>
          )}
          {versions.length > 1 && (
            <Link className="btn" to={`/compare/${versions[1].id}/${versions[0].id}`}>
              <CompareIcon size={14} /> Compare
            </Link>
          )}
        </div>

        {!latest && project.source && (
          <p className="empty">
            Waiting for the first commit with <code>{project.source.marker ?? '[v]'}</code> in its message, for example
            <br />
            <code>git commit -m "First pass {project.source.marker ?? '[v]'}"</code>
          </p>
        )}

        {latest && (
          <div className="stack">
            <Link to={`/v/${latest.id}`} className="pill">
              <span className="pill-lead">{timeAgo(latest.createdAt)}</span>
              {latest.name}
              {meta(latest)}
            </Link>
            {latest.note && <p className="note">{latest.note}</p>}
          </div>
        )}

        {earlier.length > 0 && (
          <>
            <div className="section-label">Earlier versions</div>
            <div className="stack">
              {earlier.map((v) => (
                <Link key={v.id} to={`/v/${v.id}`} className="pill is-muted" title={v.note || undefined}>
                  <span className="pill-lead">{timeAgo(v.createdAt)}</span>
                  {v.name}
                  {meta(v)}
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="row" style={{ justifyContent: 'center', marginTop: 48 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)}>
            Rename
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => repo.updateProject(projectId, { archived: !project.archived })}
          >
            {project.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={remove}>
            Delete project
          </button>
        </div>
      </div>

      {saving && (
        <VersionDialog
          mode="version"
          nextNumber={(latest?.number ?? 0) + 1}
          initial={{ url: latest?.url ?? '' }}
          onSubmit={save}
          onClose={() => setSaving(false)}
        />
      )}
    </div>
  );
}
