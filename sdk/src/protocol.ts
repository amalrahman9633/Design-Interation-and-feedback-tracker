// Messages exchanged over postMessage between the Organiser viewer (parent)
// and a prototype running the SDK (iframe). Shared by both sides.

export const NS = 'organiser' as const;

export type StatesDef = Record<string, string[]>;
export type StateValues = Record<string, string>;

/** Where a comment is attached inside a prototype. */
export interface ElementAnchor {
  id: string;
  selector: string;
  /** Click position inside the element, as a 0–1 fraction of its box. */
  offsetX: number;
  offsetY: number;
  route: string;
}

export interface AnchorPosition {
  id: string;
  /** Viewport coordinates inside the iframe, in px. */
  x: number;
  y: number;
  visible: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ProtoMessage =
  | {
      ns: typeof NS;
      type: 'ready';
      variants: string[];
      states: StatesDef;
      variant: string | null;
      stateValues: StateValues;
      route: string;
    }
  | { ns: typeof NS; type: 'changed'; variant: string | null; stateValues: StateValues }
  | { ns: typeof NS; type: 'route'; route: string }
  | {
      ns: typeof NS;
      type: 'hit';
      requestId: string;
      selector: string | null;
      offsetX: number;
      offsetY: number;
      rect: Rect | null;
      route: string;
    }
  | { ns: typeof NS; type: 'positions'; positions: AnchorPosition[] }
  | { ns: typeof NS; type: 'snapshot'; requestId: string; dataUrl: string | null; error?: string };

export type ViewerMessage =
  | { ns: typeof NS; type: 'hello' }
  | { ns: typeof NS; type: 'setVariant'; variant: string }
  | { ns: typeof NS; type: 'setState'; key: string; value: string }
  | { ns: typeof NS; type: 'reset' }
  | { ns: typeof NS; type: 'hitTest'; requestId: string; x: number; y: number }
  | { ns: typeof NS; type: 'track'; anchors: ElementAnchor[] }
  | { ns: typeof NS; type: 'scrollTo'; anchorId: string }
  | { ns: typeof NS; type: 'capture'; requestId: string };

type Strip<T> = T extends unknown ? Omit<T, 'ns'> : never;
export type ProtoMessageBody = Strip<ProtoMessage>;
export type ViewerMessageBody = Strip<ViewerMessage>;

export function isOrganiserMessage(data: unknown): data is { ns: typeof NS; type: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { ns?: unknown }).ns === NS &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}
