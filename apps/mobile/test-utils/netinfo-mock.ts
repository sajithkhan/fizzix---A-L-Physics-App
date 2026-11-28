/**
 * NetInfo stand-in for Jest. Tests change the connection with
 * `require('@react-native-community/netinfo').__setState({ isConnected: false })`.
 */
type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };

let state: NetState = { isConnected: true, isInternetReachable: true };
const listeners = new Set<(next: NetState) => void>();

export default {
  addEventListener(fn: (next: NetState) => void) {
    listeners.add(fn);
    fn(state);
    return () => {
      listeners.delete(fn);
    };
  },
  fetch: () => Promise.resolve(state),
};

export function __setState(next: Partial<NetState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}
