/**
 * Business memory: facts and preferences Bo keeps in mind for the whole team ("we close early on Fridays"). Everyone
 * sees them; owners and admins add, edit and remove them (the backend enforces the same).
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Check, Pencil, Trash2, X } from "lucide-react-native";
import { errorMessage, isApiError } from "@shared/api/client";
import {
  useAddMemory,
  useAssistantMemory,
  useDeleteMemory,
  useUpdateMemory,
} from "@shared/api/hooks/use-assistant";
import type { MemoryEntry } from "@shared/api/types";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { useCurrentBusiness, usePermissions } from "@shared/business/business-context";
import { Button, ErrorState, IconButton, Skeleton, Text, TextField, useTheme, useToast } from "~/ui";
import { radius, space } from "~/ui/tokens";

export const MEMORY_MAX = 280;

function Entry({ entry, editable }: { entry: MemoryEntry; editable: boolean }) {
  const { colors } = useTheme();
  const business = useCurrentBusiness();
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const update = useUpdateMemory(business.id, {
    onSuccess: () => setDraft(null),
    onError: (e) => toast.show(errorMessage(e), "danger"),
  });
  const remove = useDeleteMemory(business.id, { onError: (e) => toast.show(errorMessage(e), "danger") });
  const save = () => {
    if (draft?.trim()) update.mutate({ id: entry.id, text: draft.trim() });
  };

  if (draft !== null) {
    return (
      <View style={styles.editRow}>
        <View style={styles.flex}>
          <TextField
            label="Edit memory"
            value={draft}
            maxLength={MEMORY_MAX}
            autoFocus
            returnKeyType="done"
            onChangeText={setDraft}
            onSubmitEditing={save}
          />
        </View>
        <IconButton
          icon={Check}
          accessibilityLabel="Save"
          disabled={!draft.trim() || update.isPending}
          onPress={save}
        />
        <IconButton icon={X} accessibilityLabel="Cancel" onPress={() => setDraft(null)} />
      </View>
    );
  }
  return (
    <View style={[styles.entry, { borderColor: colors.borderSubtle }]} testID={`memory-${entry.id}`}>
      <Text style={styles.flex}>{entry.text}</Text>
      {editable ? (
        <>
          <IconButton
            icon={Pencil}
            size={18}
            accessibilityLabel={`Edit: ${entry.text}`}
            onPress={() => setDraft(entry.text)}
          />
          <IconButton
            icon={Trash2}
            size={18}
            color="danger"
            accessibilityLabel={`Forget: ${entry.text}`}
            disabled={remove.isPending}
            onPress={() => remove.mutate(entry.id)}
          />
        </>
      ) : null}
    </View>
  );
}

function AddMemory() {
  const business = useCurrentBusiness();
  const add = useAddMemory(business.id);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    setError(null);
    add.mutate(value, {
      onSuccess: () => setText(""),
      onError: (err) => setError(isApiError(err) ? (err.fields.text ?? err.message) : errorMessage(err)),
    });
  };
  return (
    <View style={styles.add}>
      <TextField
        label="Add something to remember"
        placeholder="e.g. We close early on Fridays"
        value={text}
        maxLength={MEMORY_MAX}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
        error={error}
        testID="memory-input"
      />
      <Button
        label="Add"
        variant="secondary"
        disabled={!text.trim()}
        loading={add.isPending}
        onPress={submit}
      />
    </View>
  );
}

export function MemoryView() {
  const business = useCurrentBusiness();
  const { manageAssistant } = usePermissions();
  const memory = useAssistantMemory(business.id);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="assistant-memory"
    >
      <Text variant="callout" tone="muted">
        Things {ASSISTANT_NAME} keeps in mind for everyone on your team.
        {manageAssistant ? "" : " Owners and admins can change them."}
      </Text>
      {memory.isError ? (
        <ErrorState error={memory.error} onRetry={() => void memory.refetch()} />
      ) : memory.isPending ? (
        <Skeleton height={96} radius="lg" />
      ) : memory.data.length === 0 ? (
        <Text variant="callout" tone="subtle" align="center" style={styles.empty}>
          Nothing saved yet.
          {manageAssistant ? " Add your first note below, like where people should park." : ""}
        </Text>
      ) : (
        <View accessibilityLabel={`What ${ASSISTANT_NAME} remembers`} accessibilityRole="list">
          {memory.data.map((m) => (
            <Entry key={m.id} entry={m} editable={manageAssistant} />
          ))}
        </View>
      )}
      {manageAssistant ? <AddMemory /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[4] },
  flex: { flex: 1 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingVertical: space[1],
    borderBottomWidth: 1,
  },
  editRow: { flexDirection: "row", alignItems: "flex-end", gap: space[1] },
  add: { gap: space[2] },
  empty: { paddingVertical: space[4], borderRadius: radius.lg },
});
