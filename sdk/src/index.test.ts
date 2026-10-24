import { beforeEach, describe, expect, it } from 'vitest';
import { getState, init, reset, selectorFor, setState, setVariant } from './index';
import { isOrganiserMessage } from './protocol';

describe('selectorFor', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <section><p>one</p><p>two</p></section>
        <section data-organiser-id="hero"><h1>Title</h1></section>
        <div id="card"><span>x</span></div>
      </main>`;
  });

  it('builds an nth-of-type path that resolves back to the element', () => {
    const p = document.querySelectorAll('p')[1];
    const selector = selectorFor(p);
    expect(document.querySelector(selector)).toBe(p);
  });

  it('stops at data-organiser-id and unique ids', () => {
    expect(selectorFor(document.querySelector('h1')!)).toBe('[data-organiser-id="hero"] > h1');
    expect(selectorFor(document.querySelector('span')!)).toBe('#card > span');
  });
});

describe('state', () => {
  it('defaults to the first variant and state values, and resets', () => {
    init({ variants: ['A', 'B'], states: { mode: ['During', 'Paused'] } });
    expect(getState()).toMatchObject({ variant: 'A', states: { mode: 'During' } });
    setVariant('B');
    setState('mode', 'Paused');
    expect(getState()).toMatchObject({ variant: 'B', states: { mode: 'Paused' } });
    reset();
    expect(getState()).toMatchObject({ variant: 'A', states: { mode: 'During' } });
  });
});

describe('isOrganiserMessage', () => {
  it('accepts only namespaced messages', () => {
    expect(isOrganiserMessage({ ns: 'organiser', type: 'ready' })).toBe(true);
    expect(isOrganiserMessage({ type: 'ready' })).toBe(false);
    expect(isOrganiserMessage('organiser')).toBe(false);
  });
});
