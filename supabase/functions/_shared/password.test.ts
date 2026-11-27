import {
  deepStrictEqual as assertEquals,
  notStrictEqual,
  ok as assert,
  throws,
} from 'node:assert/strict';
import { derivePassword, lockoutKey, requirePepper, serverPasswordIssue } from './password.ts';

const PEPPER = 'p'.repeat(40);

Deno.test('the derived password is stable for the same phone and password', async () => {
  const a = await derivePassword(PEPPER, '+94770000001', 'physics26');
  const b = await derivePassword(PEPPER, '+94770000001', 'physics26');
  assertEquals(a, b);
});

Deno.test('the derived password changes with the password, the phone and the pepper', async () => {
  const base = await derivePassword(PEPPER, '+94770000001', 'physics26');
  notStrictEqual(await derivePassword(PEPPER, '+94770000001', 'physics27'), base);
  notStrictEqual(await derivePassword(PEPPER, '+94770000002', 'physics26'), base);
  notStrictEqual(await derivePassword('q'.repeat(40), '+94770000001', 'physics26'), base);
});

Deno.test('the derived password never contains the real one and fits Auth rules', async () => {
  const derived = await derivePassword(PEPPER, '+94770000001', 'physics26');
  assert(!derived.includes('physics26'));
  assert(derived.startsWith('Fz1-'));
  assert(/[A-Za-z]/.test(derived) && /\d/.test(derived), 'letters and digits');
  assert(derived.length <= 72, 'bcrypt uses at most 72 bytes');
});

Deno.test('lockout keys are 64 hex characters and differ by kind', async () => {
  const n = await lockoutKey(PEPPER, 'number', '+94770000001');
  const ip = await lockoutKey(PEPPER, 'ip', '+94770000001');
  assert(/^[a-f0-9]{64}$/.test(n));
  notStrictEqual(n, ip);
});

Deno.test('a missing or short pepper stops the function', () => {
  throws(() => requirePepper(undefined));
  throws(() => requirePepper('short'));
  assertEquals(requirePepper(PEPPER), PEPPER);
});

Deno.test('the server applies the sign-up password rules', () => {
  assertEquals(serverPasswordIssue('phys26'), 'too_short');
  assertEquals(serverPasswordIssue('12345678'), 'needs_letter');
  assertEquals(serverPasswordIssue('physicsss'), 'needs_digit');
  assertEquals(serverPasswordIssue('physics26'), null);
});
