import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatSlMobileLocal, normalizeSlMobile } from '@fizzix/shared';
import { Screen } from '@/components/screen';
import { BrandHeader } from '@/components/brand-header';
import { PrimaryButton } from '@/components/primary-button';
import { TextButton } from '@/components/text-button';
import { ErrorMessage } from '@/components/error-message';
import { analytics } from '@/lib/analytics';
import { radius, space, useTheme, type Palette } from '@/theme';
import { RESEND_SECONDS, requestOtp, verifyOtp, type OtpError } from './otp';

const OTP_LENGTH = 6;

/**
 * ST-02 · Screen 1a, step 1 of 2. Phone number → OTP → verified. On success Supabase holds a
 * session for the verified number and the student continues to account creation (ST-04).
 */
export function RegisterScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const [input, setInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null); // E.164 once an OTP was sent
  const [code, setCode] = useState('');
  const [error, setError] = useState<OtpError | null>(null);
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const secondsLeft = useCountdown(phone);

  const send = async (resend: boolean) => {
    const e164 = resend ? phone : normalizeSlMobile(input);
    if (!e164) {
      setError('phone_not_supported');
      return;
    }
    setBusy('send');
    setError(null);
    const result = await requestOtp(e164);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      analytics.track('otp_request_failed', { reason: result.error });
      return;
    }
    analytics.track('otp_requested', { resend });
    setCode('');
    setPhone(e164);
    secondsLeft.restart();
  };

  const verify = async () => {
    if (!phone || code.length !== OTP_LENGTH) return;
    setBusy('verify');
    setError(null);
    const result = await verifyOtp(phone, code);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      analytics.track('otp_verify_failed', { reason: result.error });
      return;
    }
    analytics.track('otp_verified');
    router.replace('/account-setup');
  };

  const changeNumber = () => {
    setPhone(null);
    setCode('');
    setError(null);
  };

  return (
    <Screen testID="register-screen">
      <BrandHeader />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('register.title')}
          </Text>
          <Text style={[styles.step, { color: colors.textMuted }]}>{t('register.step')}</Text>
        </View>

        {phone === null ? (
          <>
            <View style={styles.field}>
              <Text nativeID="phone-label" style={[styles.label, { color: colors.fieldLabel }]}>
                {t('register.phoneLabel')}
              </Text>
              <View style={styles.phoneRow}>
                <View
                  style={[
                    styles.prefix,
                    { borderColor: colors.inputBorder, backgroundColor: colors.prefixBg },
                  ]}
                >
                  <Text style={[styles.prefixText, { color: colors.text }]}>+94</Text>
                </View>
                <TextInput
                  testID="register-phone"
                  accessibilityLabelledBy="phone-label"
                  accessibilityLabel={t('register.phoneLabel')}
                  value={input}
                  onChangeText={(value) => {
                    setInput(value);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={() => void send(false)}
                  placeholder={t('register.phonePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  maxLength={16}
                  returnKeyType="send"
                  style={[
                    styles.input,
                    {
                      borderColor: colors.inputBorder,
                      backgroundColor: colors.inputBg,
                      color: colors.text,
                    },
                  ]}
                />
              </View>
            </View>
            {error ? (
              <ErrorMessage testID="register-error" message={t(`register.errors.${error}`)} />
            ) : null}
            <PrimaryButton
              testID="register-send-otp"
              label={t('register.sendOtp')}
              onPress={() => void send(false)}
              loading={busy === 'send'}
              disabled={input.trim().length === 0}
            />
          </>
        ) : (
          <>
            <Text style={[styles.sentTo, { color: colors.textMuted }]}>
              {t('register.otpSentTo', { phone: formatSlMobileLocal(phone) })}
            </Text>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.fieldLabel }]}>
                {t('register.otpLabel')}
              </Text>
              <OtpBoxes
                value={code}
                onChange={setCode}
                colors={colors}
                label={t('register.otpA11y')}
              />
              <View style={styles.otpActions}>
                <TextButton
                  testID="register-resend"
                  label={
                    secondsLeft.value > 0
                      ? t('register.resendIn', { time: formatSeconds(secondsLeft.value) })
                      : t('register.resend')
                  }
                  onPress={() => void send(true)}
                  disabled={secondsLeft.value > 0 || busy !== null}
                />
                <TextButton
                  testID="register-change-number"
                  label={t('register.changeNumber')}
                  onPress={changeNumber}
                  disabled={busy !== null}
                />
              </View>
            </View>
            {error ? (
              <ErrorMessage testID="register-error" message={t(`register.errors.${error}`)} />
            ) : null}
          </>
        )}
      </View>

      {phone !== null ? (
        <PrimaryButton
          testID="register-verify"
          label={t('register.verify')}
          onPress={() => void verify()}
          loading={busy === 'verify'}
          disabled={code.length !== OTP_LENGTH}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Six boxes drawn over one hidden input, so the phone can autofill the SMS code and paste
 * works. Only digits are kept.
 */
function OtpBoxes(props: {
  value: string;
  onChange(v: string): void;
  colors: Palette;
  label: string;
}) {
  const { value, onChange, colors, label } = props;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable
      testID="register-otp-boxes"
      onPress={() => input.current?.focus()}
      accessible={false}
    >
      <View style={styles.otpRow} pointerEvents="none">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const digit = value[i] ?? '';
          const active = i === value.length;
          return (
            <View
              key={i}
              style={[
                styles.otpBox,
                {
                  borderColor: active
                    ? colors.optionSelectedBorder
                    : digit
                      ? colors.otpFilled
                      : colors.inputBorder,
                  borderWidth: active ? 2 : 1,
                  backgroundColor: colors.inputBg,
                },
              ]}
            >
              <Text style={[styles.otpDigit, { color: colors.text }]}>{digit}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        testID="register-otp"
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        autoFocus
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

/** Counts down from RESEND_SECONDS each time `key` changes or restart() is called. */
function useCountdown(key: unknown) {
  const [value, setValue] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => {
      const left = Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      setValue(left);
      return left;
    };
    tick();
    const timer = setInterval(() => {
      if (tick() === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt, key]);

  return { value, restart: () => setStartedAt(Date.now()) };
}

function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.card,
    paddingVertical: space.xl,
    paddingHorizontal: 20,
    gap: space.lg,
  },
  heading: { gap: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  step: { fontSize: 13, lineHeight: 20 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  phoneRow: { flexDirection: 'row', gap: 8 },
  prefix: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
    justifyContent: 'center',
  },
  prefixText: { fontSize: 16, fontWeight: '600' },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
    fontSize: 16,
  },
  sentTo: { fontSize: 13 },
  otpRow: { flexDirection: 'row', gap: 8 },
  otpBox: {
    flex: 1,
    height: 48,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: 18, fontWeight: '700' },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
