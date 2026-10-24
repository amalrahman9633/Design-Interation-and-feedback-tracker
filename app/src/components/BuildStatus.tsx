import { useEffect, useState } from 'react';
import type { BuildStatus, ProjectSource, Version } from '../store/types';
import { fetchLog } from '../sync/companion';

const LABEL: Record<Exclude<BuildStatus, 'ready'>, string> = { queued: 'queued', building: 'building', failed: 'build failed' };

export function BuildBadge({ status }: { status?: BuildStatus }) {
  if (!status || status === 'ready') return null;
  return (
    <span className={`badge ${status === 'failed' ? 'is-failed' : 'is-building'}`}>
      {status !== 'failed' && <span className="dot" />}
      {LABEL[status]}
    </span>
  );
}

/** Shown instead of the prototype while its commit is still building, or if the build failed. */
export function BuildState({ version, source }: { version: Version; source?: ProjectSource }) {
  const [log, setLog] = useState('');
  const failed = version.status === 'failed';

  useEffect(() => {
    if (!failed || !source || !version.externalId || source.provider !== 'local') return;
    let cancelled = false;
    fetchLog(source, version.externalId)
      .then((text) => !cancelled && setLog(text))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [failed, source, version.externalId]);

  return (
    <div className="build-state">
      <div>
        <BuildBadge status={version.status} />
        <h3 style={{ marginTop: 10 }}>{failed ? 'This commit didn’t build' : 'Building this commit…'}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {version.commit && <code>{version.commit}</code>} {version.name}
        </p>
        {failed ? (
          <>
            {version.error && <p>{version.error}</p>}
            {log && <pre className="code">{log.slice(-6000)}</pre>}
            <p className="muted" style={{ fontSize: 13 }}>
              Fix it in a new commit, or rebuild this one with <code>organiser capture {version.commit} --force</code>.
              Build settings live in <code>organiser.config.json</code>.
            </p>
          </>
        ) : (
          <p className="muted">It opens here automatically when the build is ready.</p>
        )}
      </div>
    </div>
  );
}
