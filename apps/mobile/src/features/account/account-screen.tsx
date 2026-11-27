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

type FieldError = AccountError | 'too_short' | 'needs_letter' | 'needs_digit' | 'mismatch';

type Field = 'name' | 'username' | 'password' | 'confirm' | 'examYear' | 'stream' | 'school';

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
};

/**
 * ST-04 · Screen 1b, step 2 of 2. Name, username, password, exam year, stream, school.
 * Age and privacy consent are added to this screen by ST-58.
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
  const [errors, setErrors] = useState<Partial<Record<Field, FieldError>>>({});
  const [formError, setFormError] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sessionPhone().then(setPhone);
    void loadExamYears().then(setYears);
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
    if (school.trim().length > SCHOOL_MAX) found.school = 'invalid_school';
    return found;
  };

  const submit = async () => {
    if (busy) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0 || examYear === null || stream === null) return;

    setBusy(true);
    setFormError(null);
    const result = await createAccount({ name, username, password, examYear, stream, school });
    setBusy(false);
    if (!result.ok) {
      analytics.track('account_create_failed', { reason: result.error });
      const field = FIELD_OF[result.error];
      if (field) setErrors({ [field]: result.error });
      else setFormError(result.error);
      if (result.error === 'session_expired') router.replace('/register');
      return;
    }
    analytics.track('account_created', { exam_year: examYear, stream });
    router.replace('/home');
  };

  const err = (field: Field) => {
    const code = errors[field];
    return code ? { kind: 'error' as const, text: t(`account.errors.${code}`) } : null;
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
          {t(`account.errors.${errors.examYear}`)}
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
          {t(`account.errors.${errors.stream}`)}
        </Text>
      ) : null}
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
