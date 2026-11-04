import { FlashList } from "@shopify/flash-list";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BadgePercent, Clock3, Hourglass, Lock, Plus, Sparkles } from "lucide-react-native";
import type { Offer, Service } from "@shared/api/types";
import { useOffers } from "@shared/api/hooks/use-offers";
import { useServices } from "@shared/api/hooks/use-services";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { todayInTz } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import {
  Button,
  EmptyState,
  ErrorState,
  GroupedItem,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  SplitView,
  Text,
  useLayout,
  useTheme,
  type IconComponent,
} from "~/ui";
import { UnsavedChangesScope, useConfirmLeave } from "~/ui/form";
import { layout, radius, space } from "~/ui/tokens";
import { OfferCard } from "./OfferCard";
import { OfferEditor } from "./OfferEditor";
import { editorServices, sortOffers } from "./offers";

const NO_SERVICES: Service[] = [];

const INTRO =
  "Deals that fill quiet times. They're applied automatically when people book online, never more than one per booking.";

/**
 * `/dashboard/[slug]/offers` (the website's OffersPage, admins): the business's deals with their status, schedule
 * and use; pause, resume and delete from the card. Phones open the editor on its own screen; iPad edits beside the
 * list (asking before unsaved changes are dropped).
 */
export function OffersScreen({ previewDelay }: { previewDelay?: number } = {}) {
  const { business } = useBusinessContext();
  const { manageOffers } = usePermissions();
  if (!manageOffers) {
    return (
      <Screen testID="offers-no-access">
        <Stack.Screen
          options={{ title: "Offers", headerRight: () => <HeaderActions business={business.slug} /> }}
        />
        <EmptyState
          icon={Lock}
          title="Offers are for admins"
          description="Ask an owner or admin of this business to set up deals."
        />
      </Screen>
    );
  }
  return (
    <UnsavedChangesScope>
      <OffersView previewDelay={previewDelay} />
    </UnsavedChangesScope>
  );
}

/** What the iPad's detail pane shows: a deal's editor, a new one, or nothing chosen yet. */
type Selection = { kind: "offer"; id: string; saved?: Offer } | { kind: "new"; key: number } | null;

function OffersView({ previewDelay }: { previewDelay?: number }) {
  const { business } = useBusinessContext();
  const { isWide } = useLayout();
  const offers = useOffers(business.id);
  const services = useServices(business.id);
  const confirmLeave = useConfirmLeave();
  const [selection, setSelection] = useState<Selection>(null);
  const refetch = offers.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  const list = sortOffers(offers.data);
  const allServices = services.data ?? NO_SERVICES;
  const today = todayInTz(business.timezone);
  // iPad: the chosen deal, else the first one, so the pane is never empty when there are deals.
  // A deal just created may not be in the refetched list yet: keep showing what the save returned.
  const chosen =
    selection?.kind === "offer" ? (list.find((o) => o.id === selection.id) ?? selection.saved) : undefined;
  const current: Offer | null = selection?.kind === "new" ? null : (chosen ?? list[0] ?? null);
  const creating = selection?.kind === "new";

  const select = useCallback(
    async (next: Selection) => {
      if (await confirmLeave()) setSelection(next);
    },
    [confirmLeave],
  );
  const openNew = useCallback(() => {
    if (isWide) void select({ kind: "new", key: Date.now() });
    else router.push(`/dashboard/${business.slug}/offers/new`);
  }, [isWide, select, business.slug]);
  const onEdit = useCallback(
    (offer: Offer) => {
      if (isWide) void select({ kind: "offer", id: offer.id });
      else router.push(`/dashboard/${business.slug}/offers/${offer.id}`);
    },
    [isWide, select, business.slug],
  );
  const onDeleted = useCallback(
    (offer: Offer) => setSelection((s) => (s?.kind === "offer" && s.id === offer.id ? null : s)),
    [],
  );

  const selectedId = isWide && !creating ? (current?.id ?? null) : null;
  const renderItem = useCallback(
    ({ item, index }: { item: Offer; index: number }) => (
      <GroupedItem first={index === 0} last={index === list.length - 1}>
        <OfferCard
          offer={item}
          services={allServices}
          today={today}
          onEdit={onEdit}
          onDeleted={onDeleted}
          selected={item.id === selectedId}
        />
      </GroupedItem>
    ),
    [list, allServices, today, onEdit, onDeleted, selectedId],
  );

  const header = (
    <Stack.Screen
      options={{
        title: "Offers",
        headerLargeTitle: !isWide,
        headerRight: () => (
          <HeaderActions business={business.slug}>
            {list.length > 0 ? (
              <IconButton
                icon={Plus}
                accessibilityLabel="New offer"
                color="brand"
                disabled={services.isPending}
                onPress={openNew}
                testID="offers-new"
              />
            ) : null}
          </HeaderActions>
        ),
      }}
    />
  );

  const listView =
    offers.isError && !offers.data ? (
      <View style={styles.fill}>
        <ErrorState error={offers.error} onRetry={() => void refetch()} />
      </View>
    ) : (
      <FlashList
        testID="offers-list"
        data={list}
        keyExtractor={(o) => o.id}
        renderItem={renderItem}
        extraData={selectedId}
        ListHeaderComponent={
          <Text variant="callout" tone="muted" style={[styles.width, styles.intro]}>
            {INTRO}
          </Text>
        }
        ListEmptyComponent={
          offers.data ? <Empty onCreate={openNew} disabled={services.isPending} /> : <Loading />
        }
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
    );

  if (!isWide) {
    return (
      <Screen testID="offers">
        {header}
        {listView}
      </Screen>
    );
  }

  const ready = !!services.data && !!offers.data;
  const detail = !ready ? null : creating || current ? (
    <OfferEditor
      key={creating ? `new-${selection.key}` : `${current!.id}-${current!.updatedAt}`}
      offer={creating ? null : current}
      services={editorServices(allServices, creating ? null : current)}
      variant="pane"
      previewDelay={previewDelay}
      onSaved={(saved) => setSelection({ kind: "offer", id: saved.id, saved })}
    />
  ) : (
    <EmptyState
      icon={BadgePercent}
      title="No offer open"
      description="Create one to start filling quiet times."
      action={{ label: "New offer", icon: Plus, onPress: openNew }}
    />
  );
  return (
    <Screen testID="offers">
      {header}
      <SplitView list={listView} detail={detail} />
    </Screen>
  );
}

/** No deals yet: why they help, how they work, and ideas (the website's empty state). */
function Empty({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  const { v } = useVocabulary();
  return (
    <View style={[styles.width, styles.empty]} testID="offers-empty">
      <EmptyState
        icon={BadgePercent}
        title="No offers yet"
        description={`Turn empty slots into ${v("bookings")}. The best deal for the ${v("customer")} is applied to the price automatically.`}
      />
      <View style={styles.newButton}>
        <Button label="New offer" icon={Plus} onPress={onCreate} disabled={disabled} testID="offers-create" />
      </View>
      <View style={styles.ideas}>
        <Idea icon={Clock3} title="Off-peak" text="e.g. 20% off Tuesday and Wednesday afternoons." />
        <Idea icon={Hourglass} title="Last-minute" text="e.g. €10 off times starting within 3 hours." />
        <Idea icon={Sparkles} title="Launch" text="e.g. 15% off everything until the end of the month." />
      </View>
    </View>
  );
}

function Idea({ icon, title, text }: { icon: IconComponent; title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.idea} accessible accessibilityLabel={`${title}: ${text}`}>
      <View style={[styles.ideaIcon, { backgroundColor: colors.brandSoft }]}>
        <Icon icon={icon} size={16} color="brandSoftForeground" />
      </View>
      <View style={styles.fill}>
        <Text variant="callout" weight="medium">
          {title}
        </Text>
        <Text variant="footnote" tone="muted">
          {text}
        </Text>
      </View>
    </View>
  );
}

function Loading() {
  return (
    <View
      style={[styles.width, styles.loading]}
      accessible
      accessibilityLabel="Loading offers"
      accessibilityRole="progressbar"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={128} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space[4], paddingBottom: space[12] },
  width: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  intro: { paddingBottom: space[4] },
  loading: { gap: space[2] },
  empty: { gap: space[4] },
  newButton: { alignItems: "center" },
  ideas: { gap: space[3], paddingTop: space[2] },
  idea: { flexDirection: "row", gap: space[3] },
  ideaIcon: {
    width: space[8],
    height: space[8],
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
