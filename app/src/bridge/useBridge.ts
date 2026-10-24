import {
  NS,
  isOrganiserMessage,
  type AnchorPosition,
  type ProtoMessage,
  type StateValues,
  type StatesDef,
  type ViewerMessageBody,
} from '@organiser/sdk/protocol';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface SdkInfo {
  variants: string[];
  states: StatesDef;
  variant: string | null;
  stateValues: StateValues;
  route: string;
  /** Bumped on every `ready`, so consumers can re-send tracking after a reload. */
  session: number;
}

type HitMessage = Extract<ProtoMessage, { type: 'hit' }>;
type SnapshotMessage = Extract<ProtoMessage, { type: 'snapshot' }>;

/**
 * Talks to a prototype in an iframe over postMessage. `sdk` stays null for
 * prototypes that don't include the Organiser SDK.
 */
export function useBridge(iframeRef: RefObject<HTMLIFrameElement | null>, resetKey: string) {
  const [sdk, setSdk] = useState<SdkInfo | null>(null);
  const [positions, setPositions] = useState<Record<string, AnchorPosition>>({});
  const pending = useRef(new Map<string, (msg: ProtoMessage) => void>());

  useEffect(() => {
    setSdk(null);
    setPositions({});
  }, [resetKey]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || event.source !== frame || !isOrganiserMessage(event.data)) return;
      const msg = event.data as ProtoMessage;
      switch (msg.type) {
        case 'ready':
          setSdk((prev) => ({
            variants: msg.variants,
            states: msg.states,
            variant: msg.variant,
            stateValues: msg.stateValues,
            route: msg.route,
            session: (prev?.session ?? 0) + 1,
          }));
          break;
        case 'changed':
          setSdk((prev) => prev && { ...prev, variant: msg.variant, stateValues: msg.stateValues });
          break;
        case 'route':
          setSdk((prev) => prev && { ...prev, route: msg.route });
          break;
        case 'positions':
          setPositions(Object.fromEntries(msg.positions.map((p) => [p.id, p])));
          break;
        case 'hit':
        case 'snapshot':
          pending.current.get(msg.requestId)?.(msg);
          pending.current.delete(msg.requestId);
          break;
      }
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [iframeRef]);

  const send = useCallback(
    (message: ViewerMessageBody) => iframeRef.current?.contentWindow?.postMessage({ ns: NS, ...message }, '*'),
    [iframeRef],
  );

  const request = useCallback(
    <T extends ProtoMessage>(build: (requestId: string) => ViewerMessageBody, timeoutMs: number) =>
      new Promise<T | null>((resolve) => {
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          resolve(null);
        }, timeoutMs);
        pending.current.set(requestId, (msg) => {
          clearTimeout(timer);
          resolve(msg as T);
        });
        send(build(requestId));
      }),
    [send],
  );

  const hitTest = useCallback(
    (x: number, y: number) => request<HitMessage>((requestId) => ({ type: 'hitTest', requestId, x, y }), 800),
    [request],
  );

  const capture = useCallback(
    () => request<SnapshotMessage>((requestId) => ({ type: 'capture', requestId }), 15000),
    [request],
  );

  /** Call from the iframe's onLoad so an SDK that loaded first re-announces itself. */
  const onFrameLoad = useCallback(() => send({ type: 'hello' }), [send]);

  return { sdk, positions, send, hitTest, capture, onFrameLoad };
}

export type Bridge = ReturnType<typeof useBridge>;
