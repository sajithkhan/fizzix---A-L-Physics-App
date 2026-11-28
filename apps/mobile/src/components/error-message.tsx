import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, useTheme } from '@/theme';

/**
 * Inline error, announced to screen readers. Always plain translated text, never codes.
 * ST-59: an optional next step (e.g. "Try again") shown under the message.
 */
export function ErrorMessage({
  message,
  testID,
  actionLabel,
  onAction,
}: {
  message: string;
  testID?: string;
  actionLabel?: string;
  onAction?(): void;
}) {
  const { colors } = useTheme();
  const text = (
    <Text
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: colors.danger, backgroundColor: colors.dangerBg }]}
    >
      {message}
    </Text>
  );
  if (!actionLabel || !onAction) return text;
  return (
    <View style={styles.wrap}>
      {text}
      <Pressable
        testID={testID ? `${testID}-action` : undefined}
        accessibilityRole="button"
        onPress={onAction}
        hitSlop={8}
        style={styles.action}
      >
        <Text style={[styles.actionText, { color: colors.primary }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  text: { fontSize: 14, lineHeight: 21, padding: 12, borderRadius: radius.sm },
  action: { alignSelf: 'flex-start', paddingVertical: 6 },
  actionText: { fontSize: 14, fontWeight: '700' },
});
