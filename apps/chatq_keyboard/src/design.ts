import { StyleSheet } from 'react-native';

// Shared host-app tokens. Keyboard keys retain their own compact typing geometry.
export const colors = {
  background: '#F6F5FA', surface: '#FFFFFF', ink: '#27233C', secondary: '#625D74',
  muted: '#6F6980', primary: '#6650B8', primaryPressed: '#4E3A96', soft: '#EEEAFA',
  border: '#E6E2EE', success: '#287151', successSoft: '#EAF5EF', danger: '#B33449',
};
export const ui = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 25, fontWeight: '800', color: colors.ink, lineHeight: 34 },
  heading: { fontSize: 17, fontWeight: '700', color: colors.ink, lineHeight: 25 },
  text: { fontSize: 15, lineHeight: 24, color: colors.ink },
  note: { fontSize: 13, lineHeight: 21, color: colors.muted },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 22, color: colors.secondary },
  input: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.ink, backgroundColor: colors.surface, fontSize: 15, lineHeight: 24, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  chip: { minWidth: 48, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: '#ECEEF5', alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.soft, borderColor: colors.primary },
  selectedText: { color: colors.primary, fontWeight: '700' },
});
