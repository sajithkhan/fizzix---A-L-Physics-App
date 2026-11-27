import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius, useTheme } from '@/theme';

/** "+94" box and a phone-pad input (sign-up ST-02, login ST-54). */
export function PhoneField(
  props: {
    testID: string;
    label: string;
    value: string;
    onChangeText(value: string): void;
    placeholder: string;
  } & Pick<TextInputProps, 'onSubmitEditing' | 'returnKeyType'>,
) {
  const { colors } = useTheme();
  const { testID, label, value, onChangeText, placeholder, ...rest } = props;
  const labelId = `${testID}-label`;
  return (
    <View style={styles.field}>
      <Text nativeID={labelId} style={[styles.label, { color: colors.fieldLabel }]}>
        {label}
      </Text>
      <View style={styles.row}>
        <View
          style={[
            styles.prefix,
            { borderColor: colors.inputBorder, backgroundColor: colors.prefixBg },
          ]}
        >
          <Text style={[styles.prefixText, { color: colors.text }]}>+94</Text>
        </View>
        <TextInput
          testID={testID}
          accessibilityLabelledBy={labelId}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={16}
          style={[
            styles.input,
            {
              borderColor: colors.inputBorder,
              backgroundColor: colors.inputBg,
              color: colors.text,
            },
          ]}
          {...rest}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  prefix: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
    justifyContent: 'center',
  },
  prefixText: { fontSize: 16, fontWeight: '600' },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
    fontSize: 16,
  },
});
