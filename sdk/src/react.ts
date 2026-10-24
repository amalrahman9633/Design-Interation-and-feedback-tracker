import { useSyncExternalStore } from 'react';
import {
  getState,
  init,
  isInitialised,
  reset,
  setState,
  setVariant,
  subscribe,
  type OrganiserConfig,
} from './index';

/**
 * Read the current variant/state chosen in the Organiser toolbar.
 * Pass a config on first use, or call `init()` yourself at module level.
 */
export function useOrganiser(config?: OrganiserConfig) {
  if (config && !isInitialised()) init(config);
  const state = useSyncExternalStore(subscribe, getState, getState);
  return { ...state, setVariant, setState, reset };
}
