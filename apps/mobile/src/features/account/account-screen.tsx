import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  formatSlMobileLocal,
  isValidName,
  isValidUsername,
  passwordIssue,
  SCHOOL_MAX,
  type AgeBand,
  type PrivacyNotice,
} from '@fizzix/shared';
import { Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/primary-button';
import { ErrorMessage } from '@/components/error-message';
import { TextField } from '@/components/text-field';
import { ChoiceChips } from '@/components/choice-chips';
import { analytics } from '@/lib/analytics';
import { sessionPhone } from '@/lib/session';
import { useTheme } from '@/theme';
import {
  createAccount,
  FALLBACK_EXAM_YEARS,
  isUsernameAvailable,
  loadExamYears,
  type AccountError,
  type Stream,
} from './account';
import { loadPrivacyNotice, type ConsentError } from '@/features/consent/consent';
import { AgeRange, PrivacyConsent } from '@/features/consent/privacy-consent';

type FieldError =
  AccountError | ConsentError | 'too_short' | 'needs_letter' | 'needs_digit' | 'mismatch';

type Field =
  | 'name'
  | 'username'
  | 'password'
  | 'confirm'
  | 'examYear'
  | 'stream'
  | 'ageBand'
  | 'school'
  | 'privacy';

const FIELD_OF: Partial<Record<FieldError, Field>> = {
  invalid_name: 'name',
  invalid_username: 'username',
  username_taken: 'username',
  too_short: 'password',
  needs_letter: 'password',
  needs_digit: 'password',
  weak_password: 'password',
  mismatch: 'confirm',
  invalid_exam_year: 'examYear',
  invalid_stream: 'stream',
  invalid_school: 'school',
  invalid_age_band: 'ageBand',
  consent_missing: 'privacy',
  notice_outdated: 'privacy',
};

/** Field errors that live in the consent.* translations rather than account.*. */
const CONSENT_FIELDS: readonly Field[] = ['ageBand', 'privacy'];

/**
 * ST-04 · Screen 1b, step 2 of 2. Name, username, password, exam year, stream, school.
 * ST-58 · age range and privacy consent on the same screen.
 */
export function AccountScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const [phone, setPhone] = useState<string | null>(null);
  const [years, setYears] = useState<readonly number[]>(FALLBACK_EXAM_YEARS);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [examYear, setExamYear] = useState<number | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [school, setSchool] = useState('');
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, FieldError>>>({});
  const [formError, setFormError] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sessionPhone().then(setPhone);
    void loadExamYears().then(setYears);
    void loadPrivacyNotice().then(setNotice);
  }, []);

  // Live username check, debounced so we don't call the server on every key.
  useEffect(() => {
    setUsernameFree(null);
    if (!isValidUsername(username)) return;
    let active = true;
    const timer = setTimeout(() => {
      void isUsernameAvailable(username).then((free) => {
        if (active) setUsernameFree(free);
      });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username]);

  const clear = (field: Field) => {
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError(null);
  };

  const validate = (): Partial<Record<Field, FieldError>> => {
    const found: Partial<Record<Field, FieldError>> = {};
    if (!isValidName(name)) found.name = 'invalid_name';
    if (!isValidUsername(username)) found.username = 'invalid_username';
    else if (usernameFree === false) found.username = 'username_taken';
    const pwIssue = passwordIssue(password);
    if (pwIssue) found.password = pwIssue;
    else if (confirm !== password) found.confirm = 'mismatch';
    if (examYear === null) found.examYear = 'invalid_exam_year';
    if (stream === null) found.stream = 'invalid_stream';
    if (ageBand === null) found.ageBand = 'invalid_age_band';
    if (school.trim().length > SCHOOL_MAX) found.school = 'invalid_school';
    if (!accepted) found.privacy = 'consent_missing';
    return found;
  };

  const submit = async () => {
    if (busy) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0 || examYear === null || stream === null || !ageBand) return;

    setBusy(true);
    setFormError(null);
    const current = notice ?? (await loadPrivacyNotice());
    if (!current) {
      setBusy(false);
      setFormError('network');
      return;
    }
    setNotice(current);
    const result = await createAccount({
      name,
      username,
      password,
      examYear,
      stream,
      school,
      ageBand,
      noticeVersion: current.version,
    });
    setBusy(false);
    if (!result.ok) {
      analytics.track('account_create_failed', { reason: result.error });
      if (result.error === 'notice_outdated') {
        // The notice changed while they were filling in: show the new one and ask again.
        setAccepted(false);
        void loadPrivacyNotice().then(setNotice);
      }
      const field = FIELD_OF[result.error];
      if (field) setErrors({ [field]: result.error });
      else setFormError(result.error as AccountError); // network / internal / session_expired
      if (result.error === 'session_expired') router.replace('/register');
      return;
    }
    analytics.track('consent_accepted', { notice_version: current.version, age_band: ageBand });
    analytics.track('account_created', { exam_year: examYear, stream });
    router.replace('/home');
  };

  const errorText = (field: Field, code: FieldError) =>
    CONSENT_FIELDS.includes(field)
      ? t(`consent.errors.${code as ConsentError}`)
      : t(`account.errors.${code as AccountError}`);

  const err = (field: Field) => {
    const code = errors[field];
    return code ? { kind: 'error' as const, text: errorText(field, code) } : null;
  };

  const usernameStatus =
    err('username') ??
    (usernameFree === true
      ? { kind: 'success' as const, text: t('account.usernameAvailable') }
      : usernameFree === false
        ? { kind: 'error' as const, text: t('account.errors.username_taken') }
        : { kind: 'hint' as const, text: t('account.usernameHint') });

  const confirmStatus =
    err('confirm') ??
    (confirm.length > 0 && confirm === password
      ? { kind: 'success' as const, text: t('account.match') }
      : null);

  return (
    <Screen testID="account-screen">
      <View style={styles.heading}>
        {phone ? (
          <Text style={[styles.verified, { color: colors.success }]}>
            {t('account.verified', { phone: formatSlMobileLocal(phone) })}
          </Text>
        ) : null}
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('account.title')}
        </Text>
        <Text style={[styles.step, { color: colors.textMuted }]}>{t('account.step')}</Text>
      </View>

      <TextField
        testID="account-name"
        label={t('account.name')}
        placeholder={t('account.namePlaceholder')}
        value={name}
        onChangeText={(v) => {
          setName(v);
          clear('name');
        }}
        autoComplete="name"
        textContentType="name"
        maxLength={60}
        status={err('name')}
      />
      <TextField
        testID="account-username"
        label={t('account.username')}
        placeholder={t('account.usernamePlaceholder')}
        value={username}
        onChangeText={(v) => {
          setUsername(v.trim());
          clear('username');
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        maxLength={20}
        status={usernameStatus}
      />
      <TextField
        testID="account-password"
        label={t('account.password')}
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          clear('password');
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        password={{ showLabel: t('account.showPassword'), hideLabel: t('account.hidePassword') }}
        status={err('password') ?? { kind: 'hint', text: t('account.passwordHint') }}
      />
      <TextField
        testID="account-confirm"
        label={t('account.confirm')}
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          clear('confirm');
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        password={{ showLabel: t('account.showPassword'), hideLabel: t('account.hidePassword') }}
        status={confirmStatus}
      />
      <ChoiceChips
        testID="account-year"
        label={t('account.examYear')}
        options={years.map((y) => ({ value: y, label: String(y) }))}
        value={examYear}
        onChange={(y) => {
          setExamYear(y);
          clear('examYear');
        }}
      />
      {errors.examYear ? (
        <Text style={[styles.inlineError, { color: colors.danger }]}>
          {errorText('examYear', errors.examYear)}
        </Text>
      ) : null}
      <ChoiceChips
        testID="account-stream"
        label={t('account.stream')}
        options={[
          { value: 'bio' as const, label: t('account.streams.bio') },
          { value: 'maths' as const, label: t('account.streams.maths') },
        ]}
        value={stream}
        onChange={(s) => {
          setStream(s);
          clear('stream');
        }}
      />
      {errors.stream ? (
        <Text style={[styles.inlineError, { color: colors.danger }]}>
          {errorText('stream', errors.stream)}
        </Text>
      ) : null}
      <AgeRange
        prefix="account"
        value={ageBand}
        onChange={(band) => {
          setAgeBand(band);
          clear('ageBand');
        }}
        error={errors.ageBand ? errorText('ageBand', errors.ageBand) : null}
      />
      <TextField
        testID="account-school"
        label={t('account.school')}
        placeholder={t('account.schoolPlaceholder')}
        value={school}
        onChangeText={(v) => {
          setSchool(v);
          clear('school');
        }}
        maxLength={SCHOOL_MAX + 10}
        status={err('school')}
      />

      <PrivacyConsent
        prefix="account"
        notice={notice}
        accepted={accepted}
        onAcceptedChange={(value) => {
          setAccepted(value);
          clear('privacy');
        }}
        error={errors.privacy ? errorText('privacy', errors.privacy) : null}
      />

      {formError ? (
        <ErrorMessage testID="account-error" message={t(`account.errors.${formError}`)} />
      ) : null}

      <PrimaryButton
        testID="account-submit"
        label={t('account.submit')}
        onPress={() => void submit()}
        loading={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  verified: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700' },
  step: { fontSize: 14, lineHeight: 21 },
  inlineError: { fontSize: 12, fontWeight: '600', marginTop: -16 },
});
