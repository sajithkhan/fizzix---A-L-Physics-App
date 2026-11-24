import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme, radius } from '@/theme';

interface Props {
  label: string;
  onPress(): void;
  disabled?: boolean;
  testID?: string;
}

export function PrimaryButton({ label, onPress, disabled = false, testID }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.primary, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '700' },
});
