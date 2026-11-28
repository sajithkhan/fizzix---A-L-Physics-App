import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { BrandHeader } from '@/components/brand-header';
import { PhoneField } from '@/components/phone-field';
import { TextField } from '@/components/text-field';
import { PrimaryButton } from '@/components/primary-button';
import { TextButton } from '@/components/text-button';
import { ErrorMessage } from '@/components/error-message';
import { analytics } from '@/lib/analytics';
import { radius, space, useTheme } from '@/theme';
import { logIn, type LoginError } from './login';

/**
 * ST-54 · Screen 1. Phone number and password. Wrong details show one message that does not
 * say which one was wrong; after 5 wrong tries the server locks the number for 15 minutes.
 * "Password மறந்துவிட்டீர்களா?" opens the reset screen (ST-55). Google sign-in comes later.
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { reset } = useLocalSearchParams<{ reset?: string }>();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<LoginError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await logIn(phone, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      if (result.error === 'invalid_credentials' || result.error === 'login_locked')
        setPassword('');
      analytics.track('login_failed', { reason: result.error });
      return;
    }
    analytics.track('login_succeeded');
    // The entry screen decides: finish the account, accept a new notice, or home.
    router.replace('/');
  };

  return (
    <Screen testID="login-screen">
      <BrandHeader />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('login.title')}
        </Text>
        {reset === '1' && !error ? (
          <Text
            testID="login-reset-done"
            accessibilityLiveRegion="polite"
            style={[styles.notice, { color: colors.success }]}
          >
            {t('login.resetDone')}
          </Text>
        ) : null}
        <PhoneField
          testID="login-phone"
          label={t('login.phoneLabel')}
          placeholder={t('login.phonePlaceholder')}
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            if (error) setError(null);
          }}
          returnKeyType="next"
        />
        <TextField
          testID="login-password"
          label={t('login.password')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (error) setError(null);
          }}
          onSubmitEditing={() => void submit()}
          returnKeyType="go"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          password={{ showLabel: t('login.showPassword'), hideLabel: t('login.hidePassword') }}
        />
        <View style={styles.forgotRow}>
          <TextButton
            testID="login-forgot"
            label={t('login.forgot')}
            onPress={() => router.push('/reset')}
          />
        </View>
        {error ? <ErrorMessage testID="login-error" message={t(`login.errors.${error}`)} /> : null}
        <PrimaryButton
          testID="login-submit"
          label={t('login.submit')}
          onPress={() => void submit()}
          loading={busy}
          disabled={phone.trim().length === 0 || password.length === 0}
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={[styles.switchText, { color: colors.textMuted }]}>
          {t('login.newStudent')}
        </Text>
        <TextButton
          testID="login-register-link"
          label={t('login.registerLink')}
          onPress={() => router.replace('/register')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.card,
    paddingVertical: space.xl,
    paddingHorizontal: 20,
    gap: space.lg,
  },
  title: { fontSize: 20, fontWeight: '700' },
  notice: { fontSize: 14, fontWeight: '600', lineHeight: 21 },
  forgotRow: { alignItems: 'flex-end', marginTop: -8 },
  switchRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  switchText: { fontSize: 15 },
});
