import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme, radius } from '@/theme';

interface Props {
  label: string;
  onPress(): void;
  disabled?: boolean;
  /** Shows a spinner and blocks presses while a request is running. */
  loading?: boolean;
  /** Red, for actions that cannot be undone (delete account). */
  destructive?: boolean;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  destructive = false,
  testID,
}: Props) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: destructive ? colors.danger : colors.primary,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={[styles.label, { color: colors.onPrimary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '700' },
});
