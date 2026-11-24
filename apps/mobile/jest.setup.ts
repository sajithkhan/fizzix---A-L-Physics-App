import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// The app reads the language list from Supabase; tests control it per case.
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(() => null),
}));
