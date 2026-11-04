import { FlashList } from "@shopify/flash-list";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { MessageSquareText, Plus } from "lucide-react-native";
import type { FormQuestion, Service } from "@shared/api/types";
import { useQuestions, useUpdateQuestion } from "@shared/api/hooks/use-business";
import { useServices } from "@shared/api/hooks/use-services";
import { useBusinessContext } from "@shared/business/business-context";
import { nextSortOrder } from "@shared/dashboard/sort-order";
import { ALL_SERVICES } from "@shared/settings/question-form";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import { Card, EmptyState, ErrorState, GroupedItem, IconButton, Select, Skeleton, Text } from "~/ui";
import { useSaveFeedback } from "~/ui/form";
import { layout, space } from "~/ui/tokens";
import { SettingsPage, SettingsPageHeader } from "../SettingsPage";
import { QuestionRow } from "./QuestionRow";
import { QuestionSheet } from "./QuestionSheet";
import {
  filterQuestions,
  moveUpdates,
  questionSummary,
  sortQuestions,
  type QuestionFilter,
} from "./questions";

/** What the sheet shows: a new question (null) or one to edit; `key` remounts it fresh each time it opens. */
type Editing = { key: number; question: FormQuestion | null };

/**
 * Settings › Questions (the website's QuestionsSettings): what people are asked when they book, in order. Filter by
 * service, move up and down (every question listed), add, edit and delete in a sheet.
 */
export function QuestionsSettings() {
  const { business } = useBusinessContext();
  const questions = useQuestions(business.id);
  const services = useServices(business.id);
  const update = useUpdateQuestion(business.id);
  const feedback = useSaveFeedback();
  const [filter, setFilter] = useState<QuestionFilter>("all");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [moving, setMoving] = useState(false);
  const refetch = questions.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  const all = sortQuestions(questions.data ?? []);
  const list = filterQuestions(all, filter);
  const serviceList = services.data ?? [];
  const serviceName = (id: string | null) =>
    id ? (serviceList.find((s) => s.id === id)?.name ?? "A service") : "All services";

  const open = useCallback(
    (question: FormQuestion | null) => setEditing((e) => ({ key: (e?.key ?? 0) + 1, question })),
    [],
  );

  const move = async (q: FormQuestion, dir: -1 | 1) => {
    const updates = moveUpdates(all, q.id, dir);
    if (!updates) return;
    setMoving(true);
    try {
      await Promise.all(updates.map(({ id, sortOrder }) => update.mutateAsync({ id, input: { sortOrder } })));
    } catch (err) {
      feedback.failed(err);
    } finally {
      setMoving(false);
    }
  };

  const renderItem = ({ item, index }: { item: FormQuestion; index: number }) => (
    <GroupedItem first={index === 0} last={index === list.length - 1}>
      <QuestionRow
        question={item}
        summary={questionSummary(item, serviceName)}
        movable={filter === "all"}
        first={all[0]?.id === item.id}
        last={all[all.length - 1]?.id === item.id}
        busy={moving}
        onPress={open}
        onMove={(q, dir) => void move(q, dir)}
      />
    </GroupedItem>
  );

  const failed = questions.isError && !questions.data;

  return (
    <SettingsPage
      segment="questions"
      scroll={false}
      headerRight={() => (
        <HeaderActions business={business.slug}>
          <IconButton
            icon={Plus}
            accessibilityLabel="New question"
            color="brand"
            onPress={() => open(null)}
            testID="question-new"
          />
        </HeaderActions>
      )}
    >
      <FlashList
        testID="questions-list"
        data={failed ? [] : list}
        keyExtractor={(q) => q.id}
        renderItem={renderItem}
        extraData={{ moving, filter, services: serviceList }}
        ListHeaderComponent={<Header services={serviceList} filter={filter} onFilter={setFilter} />}
        ListEmptyComponent={
          failed ? (
            <ErrorState error={questions.error} onRetry={() => void refetch()} />
          ) : questions.data ? (
            <Empty onAdd={() => open(null)} />
          ) : (
            <Loading />
          )
        }
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
      {editing ? (
        <QuestionSheet
          key={editing.key}
          question={editing.question}
          nextSort={nextSortOrder(all)}
          defaultService={filter !== "all" && filter !== "global" ? filter : ALL_SERVICES}
          services={serviceList}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SettingsPage>
  );
}

function Header({
  services,
  filter,
  onFilter,
}: {
  services: readonly Service[];
  filter: QuestionFilter;
  onFilter: (f: QuestionFilter) => void;
}) {
  return (
    <View style={[styles.width, styles.header]}>
      <SettingsPageHeader segment="questions" />
      <Text variant="callout" tone="muted">
        Asked after people pick a time. Name, email and phone are always collected.
      </Text>
      {services.length > 0 ? (
        <Select
          label="Show"
          testID="questions-filter"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: "Every question" },
            { value: "global", label: "Asked for all services" },
            ...services.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      ) : null}
    </View>
  );
}

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.width}>
      <Card>
        <EmptyState
          testID="questions-empty"
          icon={MessageSquareText}
          title="No questions"
          description="Ask for what you need to prepare — a vehicle registration, an instrument, the reason for a visit."
          action={{ label: "New question", icon: Plus, onPress: onAdd }}
        />
      </Card>
    </View>
  );
}

function Loading() {
  return (
    <View
      style={[styles.width, styles.loading]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the questions"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={64} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], paddingBottom: space[12] },
  width: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  header: { gap: space[4], paddingBottom: space[4] },
  loading: { gap: space[2] },
});
