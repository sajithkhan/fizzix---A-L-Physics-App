import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// The app reads the language list from Supabase; tests control it per case.
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(() => null),
}));

// expo-secure-store has no native module in Jest: an in-memory store (tests can inspect
// `__store`). Keys follow the real rule (letters, digits, ".", "-", "_").
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  const check = (key: string) => {
    if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid key: ${key}`);
  };
  return {
    __store: store,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
    getItemAsync: jest.fn(async (key: string) => {
      check(key);
      return store.has(key) ? store.get(key)! : null;
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      check(key);
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      check(key);
      store.delete(key);
    }),
  };
});

// NetInfo has no native module in Jest: a controllable stand-in (test-utils/netinfo-mock.ts).
jest.mock('@react-native-community/netinfo', () => require('./test-utils/netinfo-mock'));
