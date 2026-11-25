import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

/** Full-screen container: safe area, theme background, scrolls on small phones. */
export function Screen({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      testID={testID}
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingTop: 40, paddingHorizontal: 24, paddingBottom: 32, gap: 24 },
});
