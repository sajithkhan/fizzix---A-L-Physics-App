import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, useTheme } from '@/theme';

interface Props<T extends string | number> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange(value: T): void;
  testID: string;
}

/** A row of single-choice buttons (exam year, stream). Announced as a radio group. */
export function ChoiceChips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  testID,
}: Props<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: colors.fieldLabel }]}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              testID={`${testID}-${option.value}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                selected
                  ? {
                      borderWidth: 2,
                      borderColor: colors.optionSelectedBorder,
                      backgroundColor: colors.optionSelected,
                    }
                  : {
                      borderWidth: 1,
                      borderColor: colors.inputBorder,
                      backgroundColor: colors.inputBg,
                    },
              ]}
            >
              <Text style={[styles.chipText, { color: selected ? colors.label : colors.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    height: 46,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 15, fontWeight: '700' },
});
