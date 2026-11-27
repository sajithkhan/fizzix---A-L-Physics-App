import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '@/theme';

/**
 * A themed yes/no question over the screen. Used instead of the system alert so it follows
 * the app's light/dark theme and language, and is announced as a dialog.
 */
export function ConfirmDialog(props: {
  testID: string;
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { colors } = useTheme();
  const {
    testID,
    visible,
    title,
    body,
    confirmLabel,
    cancelLabel,
    destructive,
    onConfirm,
    onCancel,
  } = props;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          testID={testID}
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
          <View style={styles.actions}>
            <Pressable
              testID={`${testID}-cancel`}
              accessibilityRole="button"
              onPress={onCancel}
              style={[styles.button, { borderColor: colors.inputBorder }]}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              testID={`${testID}-ok`}
              accessibilityRole="button"
              onPress={onConfirm}
              style={[
                styles.button,
                {
                  backgroundColor: destructive ? colors.danger : colors.primary,
                  borderColor: 'transparent',
                },
              ]}
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.xl, gap: space.md },
  title: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  button: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
});
