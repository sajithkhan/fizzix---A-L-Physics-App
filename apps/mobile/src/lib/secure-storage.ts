import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * ST-05 · where the Supabase session (access + refresh token) is kept: the phone's secure
 * storage (Android Keystore, iOS Keychain), readable only by this app on this device.
 *
 * - A session can be larger than one secure-store entry should hold, so values are split
 *   into chunks: `<key>` holds the chunk count, `<key>.0`, `<key>.1`, … hold the text.
 * - Secure storage is not copied by Android backup (and backup is off anyway), so after a
 *   reinstall or on a new phone the student logs in again with number and password.
 * - Sessions saved by older builds in AsyncStorage are moved here on first read.
 */
export const CHUNK_SIZE = 1800;

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable after the first unlock, so a background token refresh still works.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Secure-store keys may contain only letters, digits, ".", "-" and "_". */
function safeKey(key: string): string {
  return key.replace(/[^\w.-]/g, '_');
}

async function readChunks(base: string): Promise<string | null> {
  const countText = await SecureStore.getItemAsync(base, OPTIONS);
  if (countText === null) return null;
  const count = Number(countText);
  if (!Number.isInteger(count) || count < 0 || count > 64) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(`${base}.${i}`, OPTIONS);
    if (part === null) return null; // a torn write: treat as signed out
    parts.push(part);
  }
  return parts.join('');
}

async function deleteChunks(base: string): Promise<void> {
  const countText = await SecureStore.getItemAsync(base, OPTIONS);
  const count = Number(countText);
  if (Number.isInteger(count) && count > 0 && count <= 64) {
    for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(`${base}.${i}`, OPTIONS);
  }
  await SecureStore.deleteItemAsync(base, OPTIONS);
}

async function writeChunks(base: string, value: string): Promise<void> {
  await deleteChunks(base);
  const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
  for (let i = 0; i < count; i += 1) {
    await SecureStore.setItemAsync(
      `${base}.${i}`,
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      OPTIONS,
    );
  }
  // The count goes last, so an interrupted write never looks like a complete one.
  await SecureStore.setItemAsync(base, String(count), OPTIONS);
}

/** Storage adapter for supabase-js (`auth.storage`). */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const value = await readChunks(base);
    if (value !== null) return value;

    // One-time move from AsyncStorage (builds before ST-05).
    const legacy = await AsyncStorage.getItem(key).catch(() => null);
    if (legacy === null) return null;
    await writeChunks(base, legacy);
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    await writeChunks(safeKey(key), value);
  },
  async removeItem(key: string): Promise<void> {
    await deleteChunks(safeKey(key));
    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};
