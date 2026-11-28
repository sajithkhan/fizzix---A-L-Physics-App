import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatSlMobileLocal, normalizeSlMobile, passwordIssue } from '@fizzix/shared';
import { Screen } from '@/components/screen';
import { PhoneField } from '@/components/phone-field';
import { TextField } from '@/components/text-field';
import { PrimaryButton } from '@/components/primary-button';
import { TextButton } from '@/components/text-button';
import { ErrorMessage } from '@/components/error-message';
import { OTP_LENGTH, OtpBoxes, formatSeconds, useCountdown } from '@/components/otp-boxes';
import { analytics } from '@/lib/analytics';
import { radius, space, useTheme } from '@/theme';
import { RESEND_SECONDS } from './otp';
import {
  dropLocalSession,
  requestReset,
  saveNewPassword,
  verifyResetOtp,
  type ResetError,
} from './reset';

type FieldError = 'too_short' | 'needs_letter' | 'needs_digit' | 'weak_password' | 'mismatch';

/**
 * ST-55 · Screen 1c. Number → OTP (registered numbers only) → new password twice → saved.
 * Every session is then signed out and the student logs in with the new password.
 */
export function ResetScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const [input, setInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ResetError | null>(null);
  const [fieldError, setFieldError] = useState<{ password?: FieldError; confirm?: FieldError }>({});
  const [busy, setBusy] = useState<'send' | 'save' | null>(null);
  const verified = useRef(false);
  const done = useRef(false);
  const secondsLeft = useCountdown(phone, RESEND_SECONDS);

  // Leaving after the OTP was checked but before saving: drop that OTP session.
  useEffect(
    () => () => {
      if (verified.current && !done.current) void dropLocalSession();
    },
    [],
  );

  const send = async (resend: boolean) => {
    const e164 = resend ? phone : normalizeSlMobile(input);
    if (!e164) {
      setError('phone_not_supported');
      return;
    }
    setBusy('send');
    setError(null);
    const result = await requestReset(e164);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      analytics.track('reset_request_failed', { reason: result.error });
      return;
    }
    analytics.track('reset_requested', { resend });
    setCode('');
    setPhone(e164);
    secondsLeft.restart();
  };

  const startAgain = () => {
    if (verified.current) void dropLocalSession();
    verified.current = false;
    setPhone(null);
    setCode('');
  };

  const save = async () => {
    if (!phone || busy) return;
    const issue = passwordIssue(password);
    const found = issue
      ? { password: issue }
      : confirm !== password
        ? { confirm: 'mismatch' as const }
        : {};
    setFieldError(found);
    setError(null);
    if (found.password || found.confirm || code.length !== OTP_LENGTH) return;

    setBusy('save');
    if (!verified.current) {
      const otp = await verifyResetOtp(phone, code);
      if (!otp.ok) {
        setBusy(null);
        setError(otp.error);
        analytics.track('reset_otp_failed', { reason: otp.error });
        return;
      }
      verified.current = true;
    }
    const result = await saveNewPassword(password);
    setBusy(null);
    if (!result.ok) {
      analytics.track('reset_failed', { reason: result.error });
      if (result.error === 'weak_password') {
        setFieldError({ password: 'weak_password' });
        return;
      }
      setError(result.error);
      if (result.error === 'reset_not_allowed') startAgain();
      return;
    }
    done.current = true;
    analytics.track('password_reset');
    router.replace({ pathname: '/login', params: { reset: '1' } });
  };

  const leave = () => {
    if (verified.current && !done.current) void dropLocalSession();
    done.current = true;
    router.replace('/login');
  };

  const status = (field: 'password' | 'confirm') => {
    const code = fieldError[field];
    if (code) return { kind: 'error' as const, text: t(`reset.errors.${code}`) };
    if (field === 'password') return { kind: 'hint' as const, text: t('reset.passwordHint') };
    return confirm.length > 0 && confirm === password
      ? { kind: 'success' as const, text: t('reset.match') }
      : null;
  };

  return (
    <Screen testID="reset-screen">
      <View style={styles.header}>
        <Pressable
          testID="reset-back"
          accessibilityRole="button"
          accessibilityLabel={t('reset.back')}
          onPress={leave}
          style={[
            styles.back,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <Text style={[styles.backText, { color: colors.text }]}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('reset.title')}
        </Text>
      </View>
      <Text style={[styles.intro, { color: colors.textMuted }]}>{t('reset.intro')}</Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        {phone === null ? (
          <>
            <PhoneField
              testID="reset-phone"
              label={t('reset.phoneLabel')}
              placeholder={t('reset.phonePlaceholder')}
              value={input}
              onChangeText={(value) => {
                setInput(value);
                if (error) setError(null);
              }}
              onSubmitEditing={() => void send(false)}
              returnKeyType="send"
            />
            {error ? (
              <ErrorMessage testID="reset-error" message={t(`reset.errors.${error}`)} />
            ) : null}
            <PrimaryButton
              testID="reset-send-otp"
              label={t('reset.sendOtp')}
              onPress={() => void send(false)}
              loading={busy === 'send'}
              disabled={input.trim().length === 0}
            />
          </>
        ) : (
          <>
            <Text style={[styles.sentTo, { color: colors.textMuted }]}>
              {t('reset.otpSentTo', { phone: formatSlMobileLocal(phone) })}
            </Text>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.fieldLabel }]}>
                {t('reset.otpLabel')}
              </Text>
              <OtpBoxes
                testID="reset-otp"
                value={code}
                onChange={setCode}
                label={t('reset.otpA11y')}
              />
              <View style={styles.otpActions}>
                <TextButton
                  testID="reset-resend"
                  label={
                    secondsLeft.value > 0
                      ? t('reset.resendIn', { time: formatSeconds(secondsLeft.value) })
                      : t('reset.resend')
                  }
                  onPress={() => void send(true)}
                  disabled={secondsLeft.value > 0 || busy !== null}
                />
                <TextButton
                  testID="reset-change-number"
                  label={t('reset.changeNumber')}
                  onPress={startAgain}
                  disabled={busy !== null}
                />
              </View>
            </View>
            <TextField
              testID="reset-password"
              label={t('reset.newPassword')}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setFieldError({});
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              password={{ showLabel: t('reset.showPassword'), hideLabel: t('reset.hidePassword') }}
              status={status('password')}
            />
            <TextField
              testID="reset-confirm"
              label={t('reset.confirm')}
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v);
                setFieldError({});
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              password={{ showLabel: t('reset.showPassword'), hideLabel: t('reset.hidePassword') }}
              status={status('confirm')}
            />
            {error ? (
              <ErrorMessage testID="reset-error" message={t(`reset.errors.${error}`)} />
            ) : null}
          </>
        )}
      </View>

      {phone !== null ? (
        <PrimaryButton
          testID="reset-save"
          label={t('reset.save')}
          onPress={() => void save()}
          loading={busy === 'save'}
          disabled={code.length !== OTP_LENGTH || password.length === 0}
        />
      ) : null}
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
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  sentTo: { fontSize: 13 },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between' },
});
