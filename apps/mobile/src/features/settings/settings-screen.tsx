import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatSlMobileLocal } from '@fizzix/shared';
import { Screen } from '@/components/screen';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorMessage } from '@/components/error-message';
import { SkeletonBlock } from '@/components/skeleton';
import { analytics } from '@/lib/analytics';
import { signOut } from '@/lib/session';
import { radius, space, useTheme } from '@/theme';
import { loadMyProfile, type MyProfile } from './profile';

/**
 * Screen 9 · Settings. ST-07: profile card and logout (with a confirm step). ST-56: change
 * password. ST-57: delete account. The other rows (theme, language, Premium) come later.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void loadMyProfile().then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, []);

  const confirmLogout = async () => {
    setAsking(false);
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await signOut();
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      analytics.track('logout_failed', { reason: result.error });
      return;
    }
    analytics.track('logged_out');
    // Clear the signed-in screens so Back cannot return to them.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/login');
  };

  const initial = profile?.name?.trim().charAt(0) ?? '';

  return (
    <Screen testID="settings-screen">
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {t('settings.title')}
      </Text>

      <View
        testID="settings-profile"
        style={[
          styles.card,
          styles.profile,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.glyph }]}>
          <Text style={[styles.avatarText, { color: colors.glyphText }]}>{initial}</Text>
        </View>
        {profile === null ? (
          <View testID="settings-profile-loading" style={styles.profileText}>
            <SkeletonBlock width="60%" height={18} />
            <SkeletonBlock width="45%" height={14} />
          </View>
        ) : (
          <View style={styles.profileText}>
            {profile?.name ? (
              <Text style={[styles.name, { color: colors.text }]}>{profile.name}</Text>
            ) : null}
            {profile?.phone ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {`+94 ${formatSlMobileLocal(profile.phone)}`}
              </Text>
            ) : null}
            {profile?.examYear && profile.stream ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {t('settings.examStream', {
                  year: profile.examYear,
                  stream: t(`account.streams.${profile.stream}`),
                })}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {failed ? (
        <ErrorMessage testID="settings-logout-error" message={t('settings.logoutFailed')} />
      ) : null}

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        <Pressable
          testID="settings-change-password"
          accessibilityRole="button"
          onPress={() => router.push('/change-password')}
          style={[styles.row, styles.rowLine, { borderBottomColor: colors.surfaceBorder }]}
        >
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            {t('settings.changePassword')}
          </Text>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
        <Pressable
          testID="settings-logout"
          accessibilityRole="button"
          accessibilityHint={t('settings.logoutHint')}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => setAsking(true)}
          style={styles.row}
        >
          <Text style={[styles.rowTitle, { color: colors.danger }]}>{t('settings.logout')}</Text>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            {t('settings.logoutHint')}
          </Text>
        </Pressable>
        <Pressable
          testID="settings-delete-account"
          accessibilityRole="button"
          onPress={() => router.push('/delete-account')}
          style={[styles.row, styles.rowTop, { borderTopColor: colors.surfaceBorder }]}
        >
          <Text style={[styles.rowMuted, { color: colors.textMuted }]}>
            {t('settings.deleteAccount')}
          </Text>
        </Pressable>
      </View>

      <ConfirmDialog
        testID="logout-confirm"
        visible={asking}
        title={t('settings.confirmTitle')}
        body={t('settings.confirmBody')}
        confirmLabel={t('settings.confirmOk')}
        cancelLabel={t('settings.confirmCancel')}
        destructive
        onConfirm={() => void confirmLogout()}
        onCancel={() => {
          setAsking(false);
          analytics.track('logout_cancelled');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: radius.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: space.lg },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
  profileText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 13 },
  row: {
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    justifyContent: 'center',
    gap: 2,
  },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowLine: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: { fontSize: 18 },
  rowTop: { borderTopWidth: 1 },
  rowMuted: { fontSize: 14 },
  rowHint: { fontSize: 12 },
});
