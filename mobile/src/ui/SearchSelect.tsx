import { FlashList } from "@shopify/flash-list";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown, X } from "lucide-react-native";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { ListRow } from "./ListRow";
import { Text } from "./Text";
import { TextField } from "./TextField";
import { useTheme } from "./theme";
import { borderWidth, MIN_TOUCH, radius, space } from "./tokens";

export type SearchOption = { value: string; label: string; hint?: string };

export type SearchSelectProps = {
  label: string;
  value: string | null;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** An option for what was typed when nothing matches it exactly (a timezone the list doesn't have). */
  custom?: (query: string) => SearchOption | null;
  hint?: string;
  error?: string | null;
  testID?: string;
};

/**
 * A field that opens a searchable, virtualised list (hundreds of timezones): the website's Combobox. The list is a
 * page sheet with a search field on top; typing filters by label and hint.
 */
export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  searchPlaceholder = "Search",
  custom,
  hint,
  error,
  testID,
}: SearchSelectProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
    : options;
  const extra =
    q && custom && !options.some((o) => o.value.toLowerCase() === q) ? custom(query.trim()) : null;
  const items = extra ? [extra, ...matches] : matches;
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const shown = current?.label ?? value ?? placeholder;
  return (
    <View style={styles.root}>
      <Text variant="callout" weight="medium">
        {label}
      </Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        accessibilityHint="Opens a searchable list"
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.input,
            borderWidth: error ? borderWidth.focus : borderWidth.hairline,
          },
        ]}
      >
        <Text style={styles.value} tone={value ? "default" : "subtle"} numberOfLines={1}>
          {shown}
        </Text>
        {current?.hint ? (
          <Text variant="footnote" tone="subtle" numberOfLines={1}>
            {current.hint}
          </Text>
        ) : null}
        <Icon icon={ChevronDown} size={18} color="mutedForeground" />
      </Pressable>
      {error || hint ? (
        <Text
          variant="footnote"
          tone={error ? "danger" : "subtle"}
          accessibilityLiveRegion={error ? "polite" : "none"}
        >
          {error ?? hint}
        </Text>
      ) : null}
      <Modal
        visible={open}
        onRequestClose={close}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      >
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom }]}
          accessibilityViewIsModal
          testID={testID ? `${testID}-sheet` : undefined}
        >
          <View style={styles.header}>
            <Text variant="title3" style={styles.title}>
              {label}
            </Text>
            <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
          </View>
          <View style={styles.search}>
            <TextField
              label="Search"
              testID={testID ? `${testID}-search` : undefined}
              placeholder={searchPlaceholder}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
              clearButtonMode="while-editing"
              returnKeyType="done"
            />
          </View>
          <FlashList
            data={items}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => (
              <ListRow
                title={item.label}
                subtitle={item.hint}
                selected={item.value === value}
                chevron={false}
                trailing={item.value === value ? <Icon icon={Check} color="brand" /> : undefined}
                onPress={() => {
                  onChange(item.value);
                  close();
                }}
              />
            )}
            ListEmptyComponent={
              <Text tone="muted" align="center" style={styles.empty}>
                Nothing matches “{query.trim()}”.
              </Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[1.5] },
  field: {
    minHeight: MIN_TOUCH + space[1],
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  value: { flex: 1 },
  sheet: { flex: 1, paddingTop: space[2] },
  header: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[2] },
  title: { flex: 1 },
  search: { paddingHorizontal: space[4], paddingBottom: space[2] },
  empty: { padding: space[6] },
});
