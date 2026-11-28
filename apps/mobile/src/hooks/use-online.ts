import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * ST-59 · true while the phone has a working connection. "Unknown" (null) counts as online,
 * so the banner never flashes on start-up before NetInfo has answered.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    [],
  );
  return online;
}
