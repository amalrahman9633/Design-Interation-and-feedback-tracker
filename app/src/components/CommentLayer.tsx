import { useEffect, useState, type MouseEvent, type RefObject } from 'react';
import type { Bridge } from '../bridge/useBridge';
import { repo } from '../store/repo';
import type { Comment, CommentAnchor } from '../store/types';
import { CommentThread, Composer } from './CommentThread';

interface Point {
  x: number;
  y: number;
  /** Element-anchored but the SDK isn't connected, so drawn at the saved fallback spot. */
  approx?: boolean;
}

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function pinPoint(comment: Comment, bridge: Pick<Bridge, 'sdk' | 'positions'>, size: { w: number; h: number }): Point | null {
  const { anchor } = comment;
  if (anchor.mode === 'element' && bridge.sdk) {
    const p = bridge.positions[comment.id];
    return p?.visible ? { x: p.x, y: p.y } : null;
  }
  return { x: (anchor.x / 100) * size.w, y: (anchor.y / 100) * size.h, approx: anchor.mode === 'element' };
}

function popoverStyle(p: Point, size: { w: number; h: number }) {
  const width = 300;
  const left = p.x + 20 + width > size.w - 8 ? Math.max(8, p.x - width - 12) : p.x + 20;
  const top = Math.max(8, Math.min(p.y - 36, size.h - 280));
  return { left, top };
}

interface Props {
  stageRef: RefObject<HTMLDivElement | null>;
  versionId: string;
  comments: Comment[];
  bridge: Bridge;
  commenting: boolean;
  showResolved: boolean;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

export function CommentLayer({ stageRef, versionId, comments, bridge, commenting, showResolved, activeId, setActiveId }: Props) {
  const size = useSize(stageRef);
  const [draft, setDraft] = useState<(Point & { anchor: CommentAnchor }) | null>(null);

  useEffect(() => {
    if (!commenting) setDraft(null);
  }, [commenting]);

  async function place(e: MouseEvent<HTMLDivElement>) {
    if (!commenting || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { sdk } = bridge;
    let anchor: CommentAnchor = {
      mode: 'point',
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      variant: sdk?.variant ?? null,
      stateValues: sdk?.stateValues,
    };
    setActiveId(null);
    setDraft({ x, y, anchor });
    if (sdk) {
      const hit = await bridge.hitTest(x, y);
      if (hit?.selector) {
        anchor = { ...anchor, mode: 'element', selector: hit.selector, offsetX: hit.offsetX, offsetY: hit.offsetY, route: hit.route };
        setDraft((d) => (d && d.x === x && d.y === y ? { ...d, anchor } : d));
      }
    }
  }

  async function submitDraft(body: string) {
    if (!draft) return;
    await repo.addComment(versionId, draft.anchor, body);
    setDraft(null);
  }

  const active = comments.find((c) => c.id === activeId);
  const activePoint = active && pinPoint(active, bridge, size);

  return (
    <div className="overlay" onClick={place}>
      {comments.map((c) => {
        if (c.resolved && !showResolved && c.id !== activeId) return null;
        const p = pinPoint(c, bridge, size);
        if (!p) return null;
        return (
          <button
            key={c.id}
            className={`pin ${c.resolved ? 'is-resolved' : ''} ${c.id === activeId ? 'is-active' : ''} ${p.approx ? 'is-approx' : ''}`}
            style={{ left: p.x, top: p.y }}
            title={p.approx ? 'Approximate position: prototype SDK not connected' : undefined}
            onClick={(e) => {
              e.stopPropagation();
              setDraft(null);
              setActiveId(c.id === activeId ? null : c.id);
            }}
          >
            {c.number}
          </button>
        );
      })}

      {draft && (
        <>
          <span className="pin is-draft" style={{ left: draft.x, top: draft.y }}>
            +
          </span>
          <div className="popover" style={popoverStyle(draft, size)} onClick={(e) => e.stopPropagation()}>
            <Composer
              autoFocus
              placeholder={draft.anchor.mode === 'element' ? 'Comment on this element…' : 'Add a comment…'}
              submitLabel="Comment"
              onSubmit={submitDraft}
              onCancel={() => setDraft(null)}
            />
          </div>
        </>
      )}

      {active && activePoint && !draft && (
        <div className="popover" style={popoverStyle(activePoint, size)} onClick={(e) => e.stopPropagation()}>
          <CommentThread comment={active} onClose={() => setActiveId(null)} />
        </div>
      )}
    </div>
  );
}
