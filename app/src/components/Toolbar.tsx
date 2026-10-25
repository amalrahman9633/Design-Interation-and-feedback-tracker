import type { ViewerMessageBody } from '@organiser/sdk/protocol';
import type { SdkInfo } from '../bridge/useBridge';
import type { Project, Version } from '../store/types';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  CommentIcon,
  CompareIcon,
  HomeIcon,
  PanelIcon,
  ResetIcon,
} from './icons';

interface Props {
  project: Project;
  versions: Version[];
  version: Version;
  onSelectVersion: (id: string) => void;
  onHome: () => void;
  sdk: SdkInfo | null;
  send: (m: ViewerMessageBody) => void;
  commenting: boolean;
  toggleCommenting: () => void;
  openCount: number;
  panelOpen: boolean;
  togglePanel: () => void;
  showSnapshot: boolean;
  onCompare: () => void;
}

export function Toolbar(p: Props) {
  const index = p.versions.findIndex((v) => v.id === p.version.id);
  const older = p.versions[index + 1];
  const newer = p.versions[index - 1];
  const states = Object.entries(p.sdk?.states ?? {});
  const hasVariants = (p.sdk?.variants.length ?? 0) > 1;

  return (
    <div className="toolbar-dock">
      <div className="toolbar">
        <button className="icon-btn" title="Project versions" onClick={p.onHome}>
          <HomeIcon />
        </button>
        <div className="select-wrap" title={`${p.project.name}: switch version`}>
          <select value={p.version.id} onChange={(e) => p.onSelectVersion(e.target.value)} aria-label="Version">
            {p.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.note ? ` · ${v.note.length > 40 ? v.note.slice(0, 40) + '…' : v.note}` : ''}
              </option>
            ))}
          </select>
          <ChevronDownIcon size={14} />
        </div>
        <button className="icon-btn" title="Older version (←)" disabled={!older} onClick={() => older && p.onSelectVersion(older.id)}>
          <ArrowLeftIcon />
        </button>
        <button className="icon-btn" title="Newer version (→)" disabled={!newer} onClick={() => newer && p.onSelectVersion(newer.id)}>
          <ArrowRightIcon />
        </button>

        {p.sdk && (hasVariants || states.length > 0) && (
          <>
            <span className="toolbar-sep" />
            {hasVariants && (
              <div className="seg" role="group" aria-label="Variant">
                {p.sdk.variants.map((v) => (
                  <button
                    key={v}
                    className={p.sdk!.variant === v ? 'is-active' : ''}
                    onClick={() => p.send({ type: 'setVariant', variant: v })}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
            <button className="icon-btn" title="Reset prototype state" onClick={() => p.send({ type: 'reset' })}>
              <ResetIcon />
            </button>
          </>
        )}

        <span className="toolbar-sep" />
        <button
          className={`icon-btn ${p.commenting ? 'is-on' : ''}`}
          title="Comment mode (C)"
          onClick={p.toggleCommenting}
          disabled={p.showSnapshot}
        >
          <CommentIcon />
        </button>
        <button className={`btn btn-ghost btn-sm ${p.panelOpen ? 'is-on' : ''}`} title="Feedback panel" onClick={p.togglePanel}>
          <PanelIcon size={15} />
          {p.openCount > 0 && <span className="count">{p.openCount}</span>}
        </button>
        {p.versions.length > 1 && (
          <button className="icon-btn" title="Compare with previous version" onClick={p.onCompare}>
            <CompareIcon />
          </button>
        )}
      </div>

      {p.sdk && states.length > 0 && (
        <div className="toolbar">
          {states.map(([key, values], i) => (
            <div key={key} className="row" style={{ gap: 4 }}>
              {i > 0 && <span className="toolbar-sep" />}
              <div className="seg" role="group" aria-label={key}>
                {values.map((value) => (
                  <button
                    key={value}
                    className={p.sdk!.stateValues[key] === value ? 'is-active' : ''}
                    onClick={() => p.send({ type: 'setState', key, value })}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
