import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { PrimaryButton } from '@/components/primary-button';
import { TextButton } from '@/components/text-button';
import { ErrorMessage } from '@/components/error-message';
import { analytics } from '@/lib/analytics';
import { radius, space, useTheme } from '@/theme';
import { deleteAccount, PLAY_SUBSCRIPTIONS_URL, type DeleteAccountError } from './delete-account';

/**
 * ST-57 · Screen 9 › "கணக்கை நீக்கு". Says what is deleted and what is kept, reminds that a
 * Google Play subscription must be cancelled in Google Play, and asks for the password.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState<DeleteAccountError | null>(null);
  const [busy, setBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  const confirm = async () => {
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    setWrong(false);
    const result = await deleteAccount(password);
    setBusy(false);
    if (!result.ok) {
      analytics.track('account_delete_failed', { reason: result.error });
      if (result.error === 'invalid_credentials') {
        setPassword('');
        setWrong(true);
      } else {
        setError(result.error);
      }
      if (result.error === 'session_expired') router.replace('/login');
      return;
    }
    analytics.track('account_deleted');
    if (router.canDismiss()) router.dismissAll();
    router.replace({ pathname: '/login', params: { deleted: '1' } });
  };

  const bullet = (text: string) => (
    <View style={styles.bulletRow} key={text}>
      <Text style={[styles.bulletDot, { color: colors.textMuted }]}>•</Text>
      <Text style={[styles.bulletText, { color: colors.text }]}>{text}</Text>
    </View>
  );

  return (
    <Screen testID="delete-account-screen">
      <View style={styles.header}>
        <Pressable
          testID="delete-back"
          accessibilityRole="button"
          accessibilityLabel={t('deleteAccount.back')}
          onPress={back}
          style={[
            styles.back,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <Text style={[styles.backText, { color: colors.text }]}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('deleteAccount.title')}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        <Text style={[styles.heading, { color: colors.text }]}>
          {t('deleteAccount.deletedHeading')}
        </Text>
        {[
          t('deleteAccount.deleted1'),
          t('deleteAccount.deleted2'),
          t('deleteAccount.deleted3'),
        ].map(bullet)}
        <Text style={[styles.heading, { color: colors.text }]}>
          {t('deleteAccount.keptHeading')}
        </Text>
        {bullet(t('deleteAccount.kept1'))}
        <Text style={[styles.note, { color: colors.textMuted }]}>{t('deleteAccount.when')}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
        <Text style={[styles.note, { color: colors.warning }]}>{t('deleteAccount.play')}</Text>
        <TextButton
          testID="delete-play-link"
          label={t('deleteAccount.playLink')}
          onPress={() => void Linking.openURL(PLAY_SUBSCRIPTIONS_URL).catch(() => undefined)}
        />
      </View>

      <TextField
        testID="delete-password"
        label={t('deleteAccount.password')}
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setWrong(false);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        password={{
          showLabel: t('deleteAccount.showPassword'),
          hideLabel: t('deleteAccount.hidePassword'),
        }}
        status={
          wrong ? { kind: 'error', text: t('deleteAccount.errors.invalid_credentials') } : null
        }
      />
      {error ? (
        <ErrorMessage testID="delete-error" message={t(`deleteAccount.errors.${error}`)} />
      ) : null}
      <PrimaryButton
        testID="delete-confirm"
        label={t('deleteAccount.confirm')}
        onPress={() => void confirm()}
        loading={busy}
        disabled={password.length === 0}
        destructive
      />
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
  card: { borderWidth: 1, borderRadius: radius.card, padding: 18, gap: space.sm },
  heading: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { fontSize: 14, lineHeight: 21 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21 },
  note: { fontSize: 13, lineHeight: 20 },
});
