import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, useTheme } from '@/theme';

export const OTP_LENGTH = 6;

/**
 * Six boxes drawn over one hidden input, so the phone can autofill the SMS code and paste
 * works. Only digits are kept. Test IDs: `<testID>` (the input), `<testID>-boxes`.
 * Used by sign-up (ST-02) and password reset (ST-55).
 */
export function OtpBoxes(props: {
  testID: string;
  value: string;
  onChange(v: string): void;
  label: string;
}) {
  const { colors } = useTheme();
  const { testID, value, onChange, label } = props;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable testID={`${testID}-boxes`} onPress={() => input.current?.focus()} accessible={false}>
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
        testID={testID}
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

/** Counts down from `seconds` each time `key` changes or restart() is called. */
export function useCountdown(key: unknown, seconds: number) {
  const [value, setValue] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
      setValue(left);
      return left;
    };
    tick();
    const timer = setInterval(() => {
      if (tick() === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt, key, seconds]);

  return { value, restart: () => setStartedAt(Date.now()) };
}

export function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  otpRow: { flexDirection: 'row', gap: 8 },
  otpBox: {
    flex: 1,
    height: 48,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: 18, fontWeight: '700' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
