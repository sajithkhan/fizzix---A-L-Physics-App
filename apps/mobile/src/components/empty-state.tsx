import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './primary-button';
import { radius, space, useTheme } from '@/theme';

/**
 * ST-59 · what a screen shows when there is nothing yet (no units added, no photo sets):
 * what it means and the one thing to do next.
 */
export function EmptyState(props: {
  testID: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction(): void;
}) {
  const { colors } = useTheme();
  const { testID, title, body, actionLabel, onAction } = props;
  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      <PrimaryButton testID={`${testID}-action`} label={actionLabel} onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, borderRadius: radius.card, padding: space.xl, gap: space.md },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
