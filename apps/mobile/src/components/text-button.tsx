import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme';

/** Small link-style button ("resend", "change number"). */
export function TextButton(props: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { label, onPress, disabled = false, testID } = props;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={styles.root}
    >
      <Text style={[styles.label, { color: disabled ? colors.textMuted : colors.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 4 },
  label: { fontSize: 13, fontWeight: '600' },
});
