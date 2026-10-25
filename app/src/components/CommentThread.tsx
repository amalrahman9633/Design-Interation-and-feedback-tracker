import { useState, type KeyboardEvent } from 'react';
import { timeAgo } from '../lib/format';
import { repo } from '../store/repo';
import type { Comment } from '../store/types';
import { CheckIcon, CloseIcon, TrashIcon } from './icons';

/** Textarea that submits on Enter (Shift+Enter for a newline). */
export function Composer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState('');
  const submit = () => {
    if (!body.trim()) return;
    onSubmit(body);
    setBody('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') onCancel?.();
    e.stopPropagation();
  };
  return (
    <div className="composer">
      <textarea
        className="textarea"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-actions">
        <span className="kbd">↵ to send</span>
        <span className="spacer" />
        {onCancel && (
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn-dark btn-sm" disabled={!body.trim()} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function contextLabel(comment: Comment): string | null {
  const parts = [comment.anchor.variant, ...Object.values(comment.anchor.stateValues ?? {})].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function CommentThread({ comment, onClose }: { comment: Comment; onClose: () => void }) {
  const context = contextLabel(comment);
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className={`num ${comment.resolved ? 'is-resolved' : ''}`}>{comment.number}</span>
        {context && <span className="badge">{context}</span>}
        <span className="spacer" />
        <button
          className="icon-btn"
          title={comment.resolved ? 'Reopen' : 'Resolve'}
          onClick={() => repo.updateComment(comment.id, { resolved: !comment.resolved })}
          style={comment.resolved ? { color: 'var(--accent)' } : undefined}
        >
          <CheckIcon />
        </button>
        <button
          className="icon-btn"
          title="Delete comment"
          onClick={() => {
            if (confirm('Delete this comment and its replies?')) {
              void repo.deleteComment(comment.id);
              onClose();
            }
          }}
        >
          <TrashIcon />
        </button>
        <button className="icon-btn" title="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="thread-item">
        <div className="thread-meta">You · {timeAgo(comment.createdAt)}</div>
        <div className="thread-body">{comment.body}</div>
      </div>
      {comment.replies.map((r) => (
        <div key={r.id} className="thread-item">
          <div className="thread-meta">
            You · {timeAgo(r.createdAt)}
            <button
              className="icon-btn item-action"
              title="Delete reply"
              aria-label="Delete reply"
              onClick={() => confirm('Delete this reply?') && repo.deleteReply(comment.id, r.id)}
            >
              <TrashIcon size={13} />
            </button>
          </div>
          <div className="thread-body">{r.body}</div>
        </div>
      ))}
      <Composer placeholder="Reply…" submitLabel="Reply" onSubmit={(body) => repo.addReply(comment.id, body)} />
    </div>
  );
}
