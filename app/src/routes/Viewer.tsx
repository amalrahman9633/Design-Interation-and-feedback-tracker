import type { ElementAnchor } from '@organiser/sdk/protocol';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useBridge } from '../bridge/useBridge';
import { BuildState } from '../components/BuildStatus';
import { CommentLayer } from '../components/CommentLayer';
import { CommentPanel, type Filter } from '../components/CommentPanel';
import { ChevronLeftIcon } from '../components/icons';
import { Toolbar } from '../components/Toolbar';
import { VersionDialog, type VersionFormValues } from '../components/VersionDialog';
import { isDrifting, timeAgo } from '../lib/format';
import { repo } from '../store/repo';
import type { Comment } from '../store/types';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function Viewer() {
  const { versionId = '' } = useParams();
  const navigate = useNavigate();
  const version = useLiveQuery(() => repo.getVersion(versionId), [versionId], null);
  const projectId = version?.projectId;
  const project = useLiveQuery(() => (projectId ? repo.getProject(projectId) : undefined), [projectId]);
  const versions = useLiveQuery(() => (projectId ? repo.listVersions(projectId) : []), [projectId]) ?? [];
  const comments = useLiveQuery(() => repo.listComments(versionId), [versionId]) ?? [];

  const [commenting, setCommenting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => innerWidth > 860);
  const [filter, setFilter] = useState<Filter>('open');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [saving, setSaving] = useState(false);
  const snapshot = useLiveQuery(() => (showSnapshot ? repo.getSnapshot(versionId) : undefined), [versionId, showSnapshot]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bridge = useBridge(iframeRef, versionId);
  const { sdk, send } = bridge;

  const isLatest = versions[0]?.id === versionId;
  // An older version on a live (local) URL no longer shows its own code, so
  // open its snapshot by default when there is one.
  const drifted = !!version && isDrifting(version) && !isLatest;

  useEffect(() => {
    setActiveId(null);
    setCommenting(false);
  }, [versionId]);

  useEffect(() => {
    setShowSnapshot(!!version?.hasSnapshot && drifted);
    // Only decide when arriving at a version, not on every data change.
  }, [versionId, version?.hasSnapshot, versions.length]);

  // Keep the SDK tracking every element-anchored comment.
  const anchors = useMemo<ElementAnchor[]>(
    () =>
      comments
        .filter((c) => c.anchor.mode === 'element' && c.anchor.selector)
        .map((c) => ({
          id: c.id,
          selector: c.anchor.selector!,
          offsetX: c.anchor.offsetX ?? 0,
          offsetY: c.anchor.offsetY ?? 0,
          route: c.anchor.route ?? '/',
        })),
    [comments],
  );
  useEffect(() => {
    if (sdk) send({ type: 'track', anchors });
  }, [sdk?.session, anchors, send]);

  // Capture a snapshot the first time a version is opened with the SDK.
  const capturedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sdk || !version || version.hasSnapshot || drifted || capturedFor.current === version.id) return;
    const id = version.id;
    const timer = setTimeout(async () => {
      capturedFor.current = id;
      const result = await bridge.capture();
      if (result?.dataUrl) await repo.saveSnapshot(id, result.dataUrl);
    }, 1200);
    return () => clearTimeout(timer);
  }, [sdk?.session, version?.id, version?.hasSnapshot, drifted]);

  const index = versions.findIndex((v) => v.id === versionId);
  const older = versions[index + 1];
  const newer = versions[index - 1];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'c' || e.key === 'C') setCommenting((v) => !showSnapshot && !v);
      else if (e.key === 'Escape') {
        setCommenting(false);
        setActiveId(null);
      } else if (e.key === 'ArrowLeft' && older) navigate(`/v/${older.id}`);
      else if (e.key === 'ArrowRight' && newer) navigate(`/v/${newer.id}`);
    }
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [older, newer, navigate, showSnapshot]);

  if (version === undefined) {
    return (
      <div className="page">
        <div className="column">
          <Link to="/" className="back-link">
            <ChevronLeftIcon size={14} /> All prototypes
          </Link>
          <p className="muted">This version no longer exists.</p>
        </div>
      </div>
    );
  }
  if (!version || !project) return null;

  function focusComment(c: Comment) {
    setActiveId(c.id);
    setShowSnapshot(false);
    if (!sdk || c.anchor.mode !== 'element') return;
    if (c.anchor.variant && c.anchor.variant !== sdk.variant) send({ type: 'setVariant', variant: c.anchor.variant });
    for (const [key, value] of Object.entries(c.anchor.stateValues ?? {})) {
      if (sdk.stateValues[key] !== value) send({ type: 'setState', key, value });
    }
    if (c.anchor.route && c.anchor.route !== sdk.route && iframeRef.current) {
      iframeRef.current.src = new URL(c.anchor.route, version!.url).href;
      return;
    }
    setTimeout(() => send({ type: 'scrollTo', anchorId: c.id }), 60);
  }

  async function saveVersion(values: VersionFormValues) {
    const created = await repo.createVersion({ projectId: version!.projectId, ...values });
    setSaving(false);
    navigate(`/v/${created.id}`);
  }

  async function deleteVersion() {
    if (!confirm(`Delete ${version!.name} and its ${comments.length} comments?`)) return;
    const next = older ?? newer;
    await repo.deleteVersion(versionId);
    navigate(next ? `/v/${next.id}` : `/p/${version!.projectId}`);
  }

  const openCount = comments.filter((c) => !c.resolved).length;
  const notBuilt = !!version.status && version.status !== 'ready';

  return (
    <div className="viewer">
      <div className={`stage-wrap ${sdk && Object.keys(sdk.states).length ? 'has-states' : ''}`}>
        <div ref={stageRef} className={`stage ${commenting ? 'is-commenting' : ''}`}>
          {notBuilt && <BuildState version={version} source={project.source} />}
          {!notBuilt && (
            <iframe
              key={version.id}
              ref={iframeRef}
              src={version.url}
              title={`${project.name} ${version.name}`}
              onLoad={bridge.onFrameLoad}
              allow="clipboard-read; clipboard-write; fullscreen"
              style={showSnapshot ? { visibility: 'hidden' } : undefined}
            />
          )}
          {notBuilt ? null : showSnapshot ? (
            <div className="snapshot-view">
              {snapshot ? <img src={snapshot.dataUrl} alt={`Snapshot of ${version.name}`} /> : null}
              <div className="stage-banner">
                <span className="badge is-dark">
                  Snapshot from {timeAgo(snapshot?.createdAt ?? version.createdAt)}
                  {drifted && ' · the live URL now shows newer code'}
                </span>
              </div>
            </div>
          ) : (
            <CommentLayer
              stageRef={stageRef}
              versionId={versionId}
              comments={comments}
              bridge={bridge}
              commenting={commenting}
              showResolved={filter !== 'open'}
              activeId={activeId}
              setActiveId={setActiveId}
            />
          )}
          {commenting && (
            <div className="stage-banner">
              <span className="badge is-dark">Click anywhere to comment · Esc to stop</span>
            </div>
          )}
        </div>
      </div>

      {panelOpen && (
        <CommentPanel
          version={version}
          comments={comments}
          filter={filter}
          setFilter={setFilter}
          activeId={activeId}
          onSelect={focusComment}
          onDeleteVersion={deleteVersion}
          onClose={() => setPanelOpen(false)}
          sdkConnected={!!sdk}
        />
      )}

      <Toolbar
        project={project}
        versions={versions}
        version={version}
        onSelectVersion={(id) => navigate(`/v/${id}`)}
        onHome={() => navigate(`/p/${project.id}`)}
        sdk={sdk}
        send={send}
        commenting={commenting}
        toggleCommenting={() => setCommenting((v) => !v)}
        openCount={openCount}
        panelOpen={panelOpen}
        togglePanel={() => setPanelOpen((v) => !v)}
        showSnapshot={showSnapshot}
        toggleSnapshot={() => {
          setShowSnapshot((v) => !v);
          setCommenting(false);
        }}
        onSaveVersion={() => setSaving(true)}
        onCompare={() => {
          const other = older ?? newer;
          if (other) navigate(older ? `/compare/${older.id}/${version.id}` : `/compare/${version.id}/${other.id}`);
        }}
      />

      {saving && (
        <VersionDialog
          mode="version"
          nextNumber={(versions[0]?.number ?? 0) + 1}
          initial={{ url: version.url }}
          onSubmit={saveVersion}
          onClose={() => setSaving(false)}
        />
      )}
    </div>
  );
}
