import { StyleSheet } from 'react-native';

// Shared host-app tokens. Keyboard keys retain their own compact typing geometry.
export const colors = {
  background: '#F7F7FB', surface: '#FFFFFF', ink: '#28243D', secondary: '#625D74',
  muted: '#716B81', primary: '#7054C8', primaryPressed: '#533AA4', soft: '#EFEAFC',
  border: '#E8E5F0', success: '#287151', successSoft: '#EAF5EF', danger: '#B33449',
  peach: '#FFF0E7', rose: '#FCECF2', mint: '#E8F4EF', sky: '#EAF1FC',
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
