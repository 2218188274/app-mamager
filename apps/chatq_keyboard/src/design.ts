import { StyleSheet } from 'react-native';

// Shared host-app tokens. Keyboard keys retain their own compact typing geometry.
export const colors = {
  background: '#F6F7FA', surface: '#FFFFFF', ink: '#202536', secondary: '#4D566D',
  muted: '#5F697E', primary: '#4F55A7', primaryPressed: '#42488F', soft: '#ECECF9',
  raised: '#EEF0F5', pressed: '#E1E5EE', inputBorder: '#8792A8',
  border: '#D8DDE8', success: '#25634A', successSoft: '#EAF5EF', danger: '#B4233C', dangerSoft: '#FBECEF',
  peach: '#FFF0E7', rose: '#FCECF2', mint: '#E8F4EF', sky: '#EAF1FC',
};
export const ui = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 26, fontWeight: '500', color: colors.ink, lineHeight: 36 },
  heading: { fontSize: 18, fontWeight: '500', color: colors.ink, lineHeight: 26 },
  text: { fontSize: 15, lineHeight: 24, color: colors.ink },
  note: { fontSize: 13, lineHeight: 21, color: colors.muted },
  label: { fontSize: 14, fontWeight: '500', lineHeight: 22, color: colors.secondary },
  input: { minHeight: 52, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, color: colors.ink, backgroundColor: colors.surface, fontSize: 15, lineHeight: 24, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  chip: { minWidth: 48, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.soft, borderColor: colors.primary },
  selectedText: { color: colors.primary, fontWeight: '500' },
});
