/**
 * ST-05 · Stay signed in: the session lives in the phone's secure storage (Android Keystore /
 * iOS Keychain via expo-secure-store), not in plain AsyncStorage. Sessions can be larger than
 * one secure-store entry, so they are split into chunks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { CHUNK_SIZE, secureSessionStorage } from '@/lib/secure-storage';

const mockStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  mockStore.clear();
  await AsyncStorage.clear();
});

describe('secure session storage', () => {
  it('stores and reads back a small value', async () => {
    await secureSessionStorage.setItem('sb-local-auth-token', '{"a":1}');
    expect(await secureSessionStorage.getItem('sb-local-auth-token')).toBe('{"a":1}');
  });

  it('splits a large session across chunks and joins it again', async () => {
    const big = 'x'.repeat(CHUNK_SIZE * 2 + 17);
    await secureSessionStorage.setItem('sb-local-auth-token', big);
    expect([...mockStore.keys()].filter((k) => k.startsWith('sb-local-auth-token'))).toHaveLength(
      4,
    );
    for (const value of mockStore.values()) expect(value.length).toBeLessThanOrEqual(CHUNK_SIZE);
    expect(await secureSessionStorage.getItem('sb-local-auth-token')).toBe(big);
  });

  it('a shorter value replaces a longer one without leaving old chunks behind', async () => {
    await secureSessionStorage.setItem('k', 'y'.repeat(CHUNK_SIZE * 3));
    await secureSessionStorage.setItem('k', 'short');
    expect(await secureSessionStorage.getItem('k')).toBe('short');
    expect([...mockStore.keys()].filter((k) => k.startsWith('k'))).toHaveLength(2);
  });

  it('removing a value deletes every chunk', async () => {
    await secureSessionStorage.setItem('k', 'z'.repeat(CHUNK_SIZE * 2));
    await secureSessionStorage.removeItem('k');
    expect(await secureSessionStorage.getItem('k')).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it('a missing chunk reads as signed out, never as a broken session', async () => {
    await secureSessionStorage.setItem('k', 'z'.repeat(CHUNK_SIZE * 2));
    mockStore.delete('k.1');
    expect(await secureSessionStorage.getItem('k')).toBeNull();
  });

  it('nothing is written to plain AsyncStorage', async () => {
    await secureSessionStorage.setItem('sb-local-auth-token', '{"access_token":"secret"}');
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('moves a session saved by an older app version out of AsyncStorage', async () => {
    await AsyncStorage.setItem('sb-local-auth-token', '{"access_token":"old"}');
    expect(await secureSessionStorage.getItem('sb-local-auth-token')).toBe(
      '{"access_token":"old"}',
    );
    expect(await AsyncStorage.getItem('sb-local-auth-token')).toBeNull();
    expect(await secureSessionStorage.getItem('sb-local-auth-token')).toBe(
      '{"access_token":"old"}',
    );
  });

  it('keys secure storage cannot hold are made safe', async () => {
    await secureSessionStorage.setItem('sb:auth/token', 'v');
    expect(await secureSessionStorage.getItem('sb:auth/token')).toBe('v');
    for (const key of mockStore.keys()) expect(key).toMatch(/^[\w.-]+$/);
  });
});
