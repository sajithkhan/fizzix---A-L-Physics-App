import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { passwordIssue } from '@fizzix/shared';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { PrimaryButton } from '@/components/primary-button';
import { ErrorMessage } from '@/components/error-message';
import { analytics } from '@/lib/analytics';
import { radius, space, useTheme } from '@/theme';
import { changePassword, type ChangePasswordError } from './change-password';

type FieldError =
  | 'invalid_credentials'
  | 'password_unchanged'
  | 'too_short'
  | 'needs_letter'
  | 'needs_digit'
  | 'weak_password'
  | 'mismatch';

/**
 * ST-56 · Screen 9 › "Password மாற்று". Current password + new one twice; no OTP. This
 * phone stays signed in; other phones are signed out.
 */
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState<{
    current?: FieldError;
    password?: FieldError;
    confirm?: FieldError;
  }>({});
  const [error, setError] = useState<ChangePasswordError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  const save = async () => {
    if (busy) return;
    const issue = passwordIssue(password);
    const found = issue
      ? { password: issue }
      : confirm !== password
        ? { confirm: 'mismatch' as const }
        : {};
    setFields(found);
    setError(null);
    if (found.password || found.confirm || current.length === 0) return;

    setBusy(true);
    const result = await changePassword(current, password);
    setBusy(false);
    if (!result.ok) {
      analytics.track('password_change_failed', { reason: result.error });
      if (result.error === 'invalid_credentials') {
        setCurrent('');
        setFields({ current: 'invalid_credentials' });
      } else if (result.error === 'password_unchanged' || result.error === 'weak_password') {
        setFields({ password: result.error });
      } else {
        setError(result.error);
      }
      if (result.error === 'session_expired') router.replace('/login');
      return;
    }
    analytics.track('password_changed');
    setDone(true);
  };

  const status = (field: 'current' | 'password' | 'confirm') => {
    const code = fields[field];
    if (code) return { kind: 'error' as const, text: t(`changePassword.errors.${code}`) };
    if (field === 'password')
      return { kind: 'hint' as const, text: t('changePassword.passwordHint') };
    if (field === 'confirm' && confirm.length > 0 && confirm === password) {
      return { kind: 'success' as const, text: t('changePassword.match') };
    }
    return null;
  };

  const eye = {
    showLabel: t('changePassword.showPassword'),
    hideLabel: t('changePassword.hidePassword'),
  };

  return (
    <Screen testID="change-password-screen">
      <View style={styles.header}>
        <Pressable
          testID="change-back"
          accessibilityRole="button"
          accessibilityLabel={t('changePassword.back')}
          onPress={back}
          style={[
            styles.back,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <Text style={[styles.backText, { color: colors.text }]}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('changePassword.title')}
        </Text>
      </View>

      {done ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <Text
            testID="change-done"
            accessibilityLiveRegion="polite"
            style={[styles.done, { color: colors.success }]}
          >
            {t('changePassword.done')}
          </Text>
          <PrimaryButton
            testID="change-done-button"
            label={t('changePassword.doneButton')}
            onPress={back}
          />
        </View>
      ) : (
        <>
          <Text style={[styles.intro, { color: colors.textMuted }]}>
            {t('changePassword.intro')}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
            ]}
          >
            <TextField
              testID="change-current"
              label={t('changePassword.current')}
              value={current}
              onChangeText={(v) => {
                setCurrent(v);
                setFields({});
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              password={eye}
              status={status('current')}
            />
            <TextField
              testID="change-password"
              label={t('changePassword.newPassword')}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setFields({});
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              password={eye}
              status={status('password')}
            />
            <TextField
              testID="change-confirm"
              label={t('changePassword.confirm')}
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v);
                setFields({});
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              password={eye}
              status={status('confirm')}
            />
            {error ? (
              <ErrorMessage testID="change-error" message={t(`changePassword.errors.${error}`)} />
            ) : null}
          </View>
          <PrimaryButton
            testID="change-save"
            label={t('changePassword.save')}
            onPress={() => void save()}
            loading={busy}
            disabled={current.length === 0 || password.length === 0}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 26, lineHeight: 28, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  intro: { fontSize: 14, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 20, gap: space.md },
  done: { fontSize: 15, fontWeight: '600', lineHeight: 23 },
});
