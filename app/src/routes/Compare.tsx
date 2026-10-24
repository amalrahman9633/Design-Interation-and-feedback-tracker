import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDownIcon, CompareIcon, HomeIcon, ImageIcon } from '../components/icons';
import { isLiveUrl, timeAgo } from '../lib/format';
import { repo } from '../store/repo';
import type { Version } from '../store/types';

function Column({
  version,
  versions,
  onChange,
}: {
  version: Version;
  versions: Version[];
  onChange: (id: string) => void;
}) {
  const latestId = versions[0]?.id;
  const drifted = isLiveUrl(version.url) && version.id !== latestId;
  const [snapshotFor, setSnapshotFor] = useState<Record<string, boolean>>({});
  const showSnapshot = version.hasSnapshot && (snapshotFor[version.id] ?? drifted);
  const snapshot = useLiveQuery(() => (showSnapshot ? repo.getSnapshot(version.id) : undefined), [version.id, showSnapshot]);

  return (
    <div className="compare-col">
      <div className="compare-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="select-wrap" style={{ display: 'inline-flex' }}>
            <select value={version.id} onChange={(e) => onChange(e.target.value)} aria-label="Version">
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} />
          </div>
          <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
            {timeAgo(version.createdAt)}
          </span>
          <div className="note-text">{version.note || 'No notes for this version.'}</div>
        </div>
        {version.hasSnapshot && (
          <button
            className={`icon-btn ${showSnapshot ? 'is-on' : ''}`}
            title={showSnapshot ? 'Show live prototype' : 'Show saved snapshot'}
            onClick={() => setSnapshotFor((s) => ({ ...s, [version.id]: !showSnapshot }))}
          >
            <ImageIcon />
          </button>
        )}
      </div>
      <div className="stage">
        {showSnapshot ? (
          <div className="snapshot-view">{snapshot && <img src={snapshot.dataUrl} alt={`Snapshot of ${version.name}`} />}</div>
        ) : (
          <>
            <iframe key={version.id} src={version.url} title={version.name} />
            {drifted && (
              <div className="stage-banner">
                <span className="badge is-live">Live URL: may show newer code than {version.name}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function Compare() {
  const { a = '', b = '' } = useParams();
  const navigate = useNavigate();
  const left = useLiveQuery(() => repo.getVersion(a), [a]);
  const right = useLiveQuery(() => repo.getVersion(b), [b]);
  const projectId = left?.projectId ?? right?.projectId;
  const versions = useLiveQuery(() => (projectId ? repo.listVersions(projectId) : []), [projectId]) ?? [];

  if (!left || !right) return null;

  return (
    <>
      <div className="compare">
        <Column version={left} versions={versions} onChange={(id) => navigate(`/compare/${id}/${b}`, { replace: true })} />
        <Column version={right} versions={versions} onChange={(id) => navigate(`/compare/${a}/${id}`, { replace: true })} />
      </div>
      <div className="toolbar-dock">
        <div className="toolbar">
          <button className="icon-btn" title="Project versions" onClick={() => navigate(`/p/${left.projectId}`)}>
            <HomeIcon />
          </button>
          <span className="toolbar-sep" />
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/compare/${b}/${a}`, { replace: true })}>
            <CompareIcon size={14} /> Swap
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/v/${left.id}`)}>
            Open {left.name}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/v/${right.id}`)}>
            Open {right.name}
          </button>
        </div>
      </div>
    </>
  );
}
