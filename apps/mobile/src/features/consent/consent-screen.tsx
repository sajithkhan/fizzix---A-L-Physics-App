import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AgeBand, PrivacyNotice } from '@fizzix/shared';
import { Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/primary-button';
import { ErrorMessage } from '@/components/error-message';
import { analytics } from '@/lib/analytics';
import { useTheme } from '@/theme';
import { loadPrivacyNotice, loadSavedAgeBand, recordConsent, type ConsentError } from './consent';
import { AgeRange, PrivacyConsent } from './privacy-consent';

/**
 * ST-58 AC3 · shown on open when the privacy notice has a new version. The student reads the
 * summary (and the full notice if they want), confirms the age range and ticks to continue.
 */
export function ConsentScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [ageError, setAgeError] = useState<ConsentError | null>(null);
  const [privacyError, setPrivacyError] = useState<ConsentError | null>(null);
  const [formError, setFormError] = useState<ConsentError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadPrivacyNotice().then(setNotice);
    void loadSavedAgeBand().then((band) => setAgeBand((current) => current ?? band));
  }, []);

  const submit = async () => {
    if (busy) return;
    setFormError(null);
    const missingAge = ageBand === null;
    setAgeError(missingAge ? 'invalid_age_band' : null);
    setPrivacyError(accepted ? null : 'consent_missing');
    if (missingAge || !accepted) return;

    setBusy(true);
    const current = notice ?? (await loadPrivacyNotice());
    if (!current) {
      setBusy(false);
      setFormError('network');
      return;
    }
    setNotice(current);
    const result = await recordConsent(current.version, ageBand);
    setBusy(false);
    if (!result.ok) {
      analytics.track('consent_failed', { reason: result.error });
      if (result.error === 'notice_outdated') {
        setAccepted(false);
        setPrivacyError('notice_outdated');
        void loadPrivacyNotice().then(setNotice);
      } else if (result.error === 'invalid_age_band') {
        setAgeError('invalid_age_band');
      } else {
        setFormError(result.error);
      }
      if (result.error === 'session_expired') router.replace('/register');
      return;
    }
    analytics.track('consent_accepted', { notice_version: current.version, age_band: ageBand });
    router.replace('/home');
  };

  return (
    <Screen testID="consent-screen">
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('consent.updatedTitle')}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('consent.updatedBody')}</Text>
      </View>

      <AgeRange
        prefix="consent"
        value={ageBand}
        onChange={(band) => {
          setAgeBand(band);
          setAgeError(null);
        }}
        error={ageError ? t(`consent.errors.${ageError}`) : null}
      />
      <PrivacyConsent
        prefix="consent"
        notice={notice}
        accepted={accepted}
        onAcceptedChange={(value) => {
          setAccepted(value);
          setPrivacyError(null);
        }}
        error={privacyError ? t(`consent.errors.${privacyError}`) : null}
      />

      {formError ? (
        <ErrorMessage testID="consent-error" message={t(`consent.errors.${formError}`)} />
      ) : null}

      <PrimaryButton
        testID="consent-continue"
        label={t('consent.continue')}
        onPress={() => void submit()}
        loading={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
});
