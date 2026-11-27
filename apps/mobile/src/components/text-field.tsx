import { forwardRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius, useTheme } from '@/theme';

type Status = { kind: 'hint' | 'error' | 'success'; text: string } | null;

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  status?: Status;
  testID: string;
  /** Adds a show/hide button for passwords. */
  password?: { showLabel: string; hideLabel: string };
}

/** Labelled input with a hint, error or success line underneath. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, Props>(function TextField(
  { label, status = null, testID, password, ...input },
  ref,
) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const borderColor =
    status?.kind === 'error'
      ? colors.danger
      : status?.kind === 'success'
        ? colors.success
        : colors.inputBorder;
  const statusColor =
    status?.kind === 'error'
      ? colors.danger
      : status?.kind === 'success'
        ? colors.success
        : colors.textMuted;

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: colors.fieldLabel }]}>{label}</Text>
      <View
        style={[
          styles.box,
          {
            borderColor,
            borderWidth: status?.kind === 'hint' || !status ? 1 : 2,
            backgroundColor: colors.inputBg,
          },
        ]}
      >
        <TextInput
          ref={ref}
          testID={testID}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={password ? !visible : false}
          style={[styles.input, { color: colors.text }]}
          {...input}
        />
        {password ? (
          <Pressable
            testID={`${testID}-toggle`}
            accessibilityRole="button"
            accessibilityLabel={visible ? password.hideLabel : password.showLabel}
            onPress={() => setVisible((v) => !v)}
            style={styles.eye}
            hitSlop={4}
          >
            <Text style={[styles.eyeText, { color: colors.accent }]}>{visible ? '◉' : '○'}</Text>
          </Pressable>
        ) : null}
      </View>
      {status ? (
        <Text
          testID={`${testID}-status`}
          accessibilityLiveRegion={status.kind === 'error' ? 'polite' : 'none'}
          style={[
            styles.status,
            { color: statusColor, fontWeight: status.kind === 'hint' ? '400' : '600' },
          ]}
        >
          {status.text}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  box: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.sm, minHeight: 48 },
  input: { flex: 1, height: 46, paddingHorizontal: 14, fontSize: 16 },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eyeText: { fontSize: 18 },
  status: { fontSize: 12, lineHeight: 18 },
});
