// Organiser SDK — runs inside a prototype. Registers variants/states with the
// Organiser viewer, answers hit tests for pinned comments, tracks anchor
// positions and captures snapshots. Everything is a no-op outside the viewer,
// so prototypes keep working standalone.

import {
  NS,
  isOrganiserMessage,
  type AnchorPosition,
  type ElementAnchor,
  type ProtoMessageBody,
  type StateValues,
  type StatesDef,
  type ViewerMessage,
} from './protocol';

export type { StatesDef, StateValues } from './protocol';

export interface OrganiserConfig {
  variants?: string[];
  states?: StatesDef;
  defaultVariant?: string;
  defaultStates?: StateValues;
}

export interface OrganiserState {
  variant: string | null;
  states: StateValues;
  /** True when the prototype is running inside the Organiser viewer. */
  embedded: boolean;
}

let config: Required<OrganiserConfig> = { variants: [], states: {}, defaultVariant: '', defaultStates: {} };
let current: OrganiserState = { variant: null, states: {}, embedded: false };
let initialised = false;
let started = false;
const listeners = new Set<(state: OrganiserState) => void>();

let anchors: ElementAnchor[] = [];
let raf = 0;
let lastPositionsKey = '';
let lastRoute = '';

const isEmbedded = () => typeof window !== 'undefined' && window.parent !== window;

function defaults(): OrganiserState {
  const states: StateValues = {};
  for (const [key, values] of Object.entries(config.states)) {
    states[key] = config.defaultStates[key] ?? values[0] ?? '';
  }
  return {
    variant: config.defaultVariant || config.variants[0] || null,
    states,
    embedded: isEmbedded(),
  };
}

function post(message: ProtoMessageBody) {
  if (!isEmbedded()) return;
  window.parent.postMessage({ ns: NS, ...message }, '*');
}

function notify() {
  for (const fn of listeners) fn(current);
  post({ type: 'changed', variant: current.variant, stateValues: current.states });
}

function announce() {
  post({
    type: 'ready',
    variants: config.variants,
    states: config.states,
    variant: current.variant,
    stateValues: current.states,
    route: currentRoute(),
  });
}

export function init(cfg: OrganiserConfig = {}): OrganiserState {
  config = {
    variants: cfg.variants ?? [],
    states: cfg.states ?? {},
    defaultVariant: cfg.defaultVariant ?? '',
    defaultStates: cfg.defaultStates ?? {},
  };
  current = defaults();
  initialised = true;
  if (!started) start();
  announce();
  for (const fn of listeners) fn(current);
  return current;
}

export const isInitialised = () => initialised;
export const getState = () => current;

export function subscribe(fn: (state: OrganiserState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setVariant(variant: string) {
  if (variant === current.variant) return;
  current = { ...current, variant };
  notify();
}

export function setState(key: string, value: string) {
  if (current.states[key] === value) return;
  current = { ...current, states: { ...current.states, [key]: value } };
  notify();
}

export function reset() {
  current = defaults();
  notify();
}

// --- Routing ---------------------------------------------------------------

export function currentRoute(): string {
  return location.pathname + location.hash;
}

function watchRoute() {
  const check = () => {
    const route = currentRoute();
    if (route === lastRoute) return;
    lastRoute = route;
    post({ type: 'route', route });
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      queueMicrotask(check);
      return result;
    };
  }
  addEventListener('popstate', check);
  addEventListener('hashchange', check);
  lastRoute = currentRoute();
}

// --- Element anchors -------------------------------------------------------

function escapeIdent(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

/** A reasonably stable CSS selector for an element. Prefers ids and data-organiser-id. */
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const tag = node.tagName.toLowerCase();
    if (node.id && document.querySelectorAll(`#${escapeIdent(node.id)}`).length === 1) {
      parts.unshift(`#${escapeIdent(node.id)}`);
      break;
    }
    const organiserId = node.getAttribute('data-organiser-id');
    if (organiserId) {
      parts.unshift(`[data-organiser-id="${organiserId.replace(/"/g, '\\"')}"]`);
      break;
    }
    if (tag === 'body') {
      parts.unshift('body');
      break;
    }
    const parent: Element | null = node.parentElement;
    const tagName = node.tagName;
    const siblings = parent ? Array.from(parent.children).filter((c) => c.tagName === tagName) : [];
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
    node = parent;
  }
  return parts.join(' > ');
}

function query(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function hitTest(requestId: string, x: number, y: number) {
  const el = document.elementFromPoint(x, y) ?? document.body;
  const rect = el.getBoundingClientRect();
  post({
    type: 'hit',
    requestId,
    selector: selectorFor(el),
    offsetX: rect.width ? (x - rect.left) / rect.width : 0,
    offsetY: rect.height ? (y - rect.top) / rect.height : 0,
    rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    route: currentRoute(),
  });
}

export function positionsFor(list: ElementAnchor[], route = currentRoute()): AnchorPosition[] {
  return list.map((anchor) => {
    const el = anchor.route === route ? query(anchor.selector) : null;
    if (!el) return { id: anchor.id, x: 0, y: 0, visible: false };
    const r = el.getBoundingClientRect();
    return {
      id: anchor.id,
      x: Math.round(r.left + r.width * anchor.offsetX),
      y: Math.round(r.top + r.height * anchor.offsetY),
      visible: r.width > 0 || r.height > 0,
    };
  });
}

// Re-measure every frame while anchors exist, and directly on scroll/resize
// (rAF can be throttled in cross-origin iframes). Only post when something moved.
function tick() {
  raf = anchors.length ? requestAnimationFrame(tick) : 0;
  measure();
}

function measure() {
  const positions = positionsFor(anchors);
  const key = JSON.stringify(positions);
  if (key === lastPositionsKey) return;
  lastPositionsKey = key;
  post({ type: 'positions', positions });
}

function track(list: ElementAnchor[]) {
  anchors = list;
  lastPositionsKey = '';
  if (!raf) tick();
}

function scrollToAnchor(id: string) {
  const anchor = anchors.find((a) => a.id === id);
  const el = anchor && query(anchor.selector);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- Snapshots -------------------------------------------------------------

async function capture(requestId: string) {
  try {
    const { toJpeg } = await import('html-to-image');
    const body = document.body;
    const bg = getComputedStyle(body).backgroundColor;
    const backgroundColor =
      bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : getComputedStyle(document.documentElement).backgroundColor || '#ffffff';
    const dataUrl = await toJpeg(body, {
      quality: 0.85,
      pixelRatio: 1,
      width: document.documentElement.clientWidth,
      height: Math.min(body.scrollHeight, 10000),
      backgroundColor: backgroundColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : backgroundColor,
    });
    post({ type: 'snapshot', requestId, dataUrl });
  } catch (err) {
    post({ type: 'snapshot', requestId, dataUrl: null, error: String(err) });
  }
}

// --- Wiring ----------------------------------------------------------------

function onMessage(event: MessageEvent) {
  if (event.source !== window.parent || !isOrganiserMessage(event.data)) return;
  const msg = event.data as ViewerMessage;
  switch (msg.type) {
    case 'hello':
      announce();
      break;
    case 'setVariant':
      setVariant(msg.variant);
      break;
    case 'setState':
      setState(msg.key, msg.value);
      break;
    case 'reset':
      reset();
      break;
    case 'hitTest':
      hitTest(msg.requestId, msg.x, msg.y);
      break;
    case 'track':
      track(msg.anchors);
      break;
    case 'scrollTo':
      scrollToAnchor(msg.anchorId);
      break;
    case 'capture':
      void capture(msg.requestId);
      break;
  }
}

function start() {
  started = true;
  if (!isEmbedded()) return;
  addEventListener('message', onMessage);
  addEventListener('scroll', () => anchors.length && measure(), { capture: true, passive: true });
  addEventListener('resize', () => anchors.length && measure());
  watchRoute();
}
