import { StyleSheet, Text } from 'react-native';
import { radius, useTheme } from '@/theme';

/** Inline error, announced to screen readers. Always plain translated text, never codes. */
export function ErrorMessage({ message, testID }: { message: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Text
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: colors.danger, backgroundColor: colors.dangerBg }]}
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 21, padding: 12, borderRadius: radius.sm },
});
