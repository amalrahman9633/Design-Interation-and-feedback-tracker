import { isLiveUrl, shortUrl, timeAgo } from '../lib/format';
import type { Comment, Version } from '../store/types';
import { contextLabel } from './CommentThread';
import { CloseIcon, ExternalIcon } from './icons';

export type Filter = 'open' | 'resolved' | 'all';

interface Props {
  version: Version;
  comments: Comment[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  activeId: string | null;
  onSelect: (comment: Comment) => void;
  onDeleteVersion: () => void;
  onClose: () => void;
  sdkConnected: boolean;
}

export function CommentPanel({ version, comments, filter, setFilter, activeId, onSelect, onDeleteVersion, onClose, sdkConnected }: Props) {
  const open = comments.filter((c) => !c.resolved).length;
  const shown = comments.filter((c) => filter === 'all' || (filter === 'open') === !c.resolved);

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="row">
          <h3>Feedback</h3>
          <span className="spacer" />
          <button className="icon-btn" title="Hide panel" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="panel-scroll">
        <div className="version-card">
          <div className="row" style={{ marginBottom: 4 }}>
            <strong style={{ fontWeight: 600 }}>{version.name}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {timeAgo(version.createdAt)}
            </span>
            <span className="spacer" />
            {isLiveUrl(version.url) && <span className="badge is-live">live URL</span>}
            {sdkConnected && (
              <span className="badge" title="Prototype is running the Organiser SDK">
                <span className="dot" style={{ color: 'var(--accent)' }} /> SDK
              </span>
            )}
          </div>
          {version.note && <p style={{ margin: '4px 0 8px', whiteSpace: 'pre-wrap' }}>{version.note}</p>}
          <a className="url row" href={version.url} target="_blank" rel="noreferrer" style={{ gap: 4 }}>
            {shortUrl(version.url)} <ExternalIcon size={12} />
          </a>
          {version.commit && <div className="url">commit {version.commit}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              {version.hasSnapshot ? 'Snapshot saved' : 'No snapshot yet'}
            </span>
            <span className="spacer" />
            <button className="btn btn-danger btn-sm" onClick={onDeleteVersion}>
              Delete version
            </button>
          </div>
        </div>

        <div className="row" style={{ margin: '0 6px 10px' }}>
          <div className="seg">
            {(['open', 'resolved', 'all'] as const).map((f) => (
              <button key={f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
                {f === 'open' ? `Open ${open}` : f === 'resolved' ? `Resolved ${comments.length - open}` : 'All'}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 && (
          <p className="empty">
            {comments.length === 0 ? (
              <>
                No feedback yet. Press <strong>C</strong> and click anywhere on the prototype to drop a comment.
              </>
            ) : (
              'Nothing here.'
            )}
          </p>
        )}

        {shown.map((c) => {
          const context = contextLabel(c);
          return (
            <button
              key={c.id}
              className={`comment-card ${c.id === activeId ? 'is-active' : ''} ${c.resolved ? 'is-resolved' : ''}`}
              onClick={() => onSelect(c)}
            >
              <div className="thread-meta">
                <span className={`num ${c.resolved ? 'is-resolved' : ''}`}>{c.number}</span>
                <span>{timeAgo(c.createdAt)}</span>
                {context && <span className="badge">{context}</span>}
                {c.anchor.route && c.anchor.route !== '/' && <span className="badge">{c.anchor.route}</span>}
              </div>
              <div className="thread-body">{c.body}</div>
              {c.replies.length > 0 && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {c.replies.length} {c.replies.length === 1 ? 'reply' : 'replies'}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
