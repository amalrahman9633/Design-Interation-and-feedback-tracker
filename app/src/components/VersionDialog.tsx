import { useState, type FormEvent } from 'react';
import { isLiveUrl, isValidUrl, normaliseUrl } from '../lib/format';
import { Dialog } from './Dialog';

export interface VersionFormValues {
  projectName: string;
  name: string;
  url: string;
  note: string;
  commit: string;
}

interface Props {
  /** `project` creates a project and its v1; `version` saves a new iteration. */
  mode: 'project' | 'version';
  initial?: Partial<VersionFormValues>;
  nextNumber?: number;
  onSubmit: (values: VersionFormValues) => Promise<void> | void;
  onClose: () => void;
}

export function VersionDialog({ mode, initial, nextNumber = 1, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<VersionFormValues>({
    projectName: '',
    name: '',
    url: '',
    note: '',
    commit: '',
    ...initial,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof VersionFormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const url = normaliseUrl(values.url);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'project' && !values.projectName.trim()) return setError('Give the project a name.');
    if (!isValidUrl(url)) return setError('Enter a valid URL, e.g. localhost:3000 or a Vercel preview link.');
    setBusy(true);
    try {
      await onSubmit({ ...values, url });
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title={mode === 'project' ? 'New project' : `Save as v${nextNumber}`} onClose={onClose}>
      <form onSubmit={submit}>
        {mode === 'project' && (
          <div className="field">
            <label htmlFor="f-project">Project name</label>
            <input
              id="f-project"
              className="input"
              autoFocus
              placeholder="Payment prototype"
              value={values.projectName}
              onChange={set('projectName')}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="f-url">Prototype URL</label>
          <input
            id="f-url"
            className="input"
            autoFocus={mode === 'version'}
            placeholder="localhost:3000 or my-app-git-feature.vercel.app"
            value={values.url}
            onChange={set('url')}
          />
          {values.url && isLiveUrl(url) && (
            <span className="hint">
              Local URLs show whatever is running now. A snapshot is saved the first time you open this version with
              the SDK, and a deploy preview link keeps it exact.
            </span>
          )}
        </div>
        {mode === 'version' && (
          <div className="field">
            <label htmlFor="f-name">Version name</label>
            <input id="f-name" className="input" placeholder={`v${nextNumber}`} value={values.name} onChange={set('name')} />
          </div>
        )}
        <div className="field">
          <label htmlFor="f-note">What changed?</label>
          <textarea
            id="f-note"
            className="textarea"
            placeholder={mode === 'project' ? 'First pass at the flow' : 'Moved CTA above the fold, softer colours…'}
            value={values.note}
            onChange={set('note')}
          />
        </div>
        <div className="field">
          <label htmlFor="f-commit">
            Commit or branch <span className="muted">(optional)</span>
          </label>
          <input id="f-commit" className="input" placeholder="a1b2c3d" value={values.commit} onChange={set('commit')} />
        </div>
        {error && <p style={{ color: 'var(--danger)', margin: '0 0 8px', fontSize: 13 }}>{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-dark" disabled={busy}>
            {mode === 'project' ? 'Create project' : 'Save version'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
