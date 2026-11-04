import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { CalendarPlus, Mail, MessageSquare, Phone, Share2, ShieldAlert, Trash2 } from "lucide-react-native";
import { errorMessage, isApiError } from "@shared/api/client";
import { useCustomerGroups } from "@shared/api/hooks/use-business";
import { useCustomer, useExportCustomer, useUpdateCustomer } from "@shared/api/hooks/use-customers";
import type { CustomerDetail as Detail } from "@shared/api/types";
import { useCurrentBusiness, usePermissions } from "@shared/business/business-context";
import { useNow } from "@shared/hooks/use-now";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh } from "~/api/use-refresh";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  Screen,
  ScreenScroll,
  Skeleton,
  Text,
  useToast,
} from "~/ui";
import { space } from "~/ui/tokens";
import { callNumber, sendEmail } from "~/lib/links";
import { logError } from "~/lib/logger";
import { useBookingActions } from "~/features/bookings/BookingActions";
import { sendMessage } from "~/features/bookings/BookingDetail";
import { BookingRow } from "~/features/bookings/BookingRow";
import { useFmt } from "~/features/bookings/fmt";
import { haptics } from "~/features/bookings/haptics";
import { PersonAvatar, SectionTitle } from "~/features/bookings/parts";
import { CustomerForm } from "./CustomerForm";
import { EraseSheet } from "./EraseSheet";

/** One customer by id (from the route, or given by the split view): loading, unavailable and error states. */
export function CustomerPanel({ customerId, onErased }: { customerId: string; onErased: () => void }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const customer = useCustomer(business.id, customerId);
  const { refreshing, onRefresh } = usePullToRefresh(customer.refetch);
  // A failed refresh keeps showing the customer already loaded; the error is for when there is none.
  if (customer.data) {
    return (
      <CustomerDetail
        customer={customer.data}
        onErased={onErased}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
    );
  }
  if (customer.isError) {
    if (isApiError(customer.error) && (customer.error.isNotFound || customer.error.isForbidden)) {
      return (
        <EmptyState
          testID="customer-unavailable"
          icon={ShieldAlert}
          title={`This ${v("customer")} isn't available`}
          description={`They may have been erased, or they only have ${v("bookings")} on calendars you can't see.`}
        />
      );
    }
    return <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />;
  }
  return (
    <View
      style={styles.loading}
      accessible
      accessibilityLabel={`Loading ${v("customer")}`}
      accessibilityRole="progressbar"
    >
      <Skeleton height={48} width="60%" />
      <Skeleton height={44} />
      <Skeleton height={72} radius="2xl" />
      <Skeleton height={160} radius="2xl" />
    </View>
  );
}

/** `/dashboard/[slug]/customers/[id]`: a customer on their own screen (phones, and "View profile" on a booking). */
export function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  return (
    <Screen testID="customer-screen">
      <Stack.Screen options={{ title: v("customer", { title: true }) }} />
      <CustomerPanel
        customerId={id}
        onErased={() =>
          router.canGoBack() ? router.back() : router.replace(`/dashboard/${business.slug}/customers` as Href)
        }
      />
    </Screen>
  );
}

/**
 * Everything about a customer, top to bottom (the website's customer page): who they are and how to reach them, a new
 * booking for them, their numbers, their history (newest first, each opens the booking), their details and notes
 * (editable), and for owners and admins, their data (share it, erase it).
 */
export function CustomerDetail({
  customer: c,
  onErased,
  refreshing,
  onRefresh,
}: {
  customer: Detail;
  onErased: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const business = useCurrentBusiness();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const toast = useToast();
  const { openBooking, openNewBooking } = useBookingActions();
  const groups = useCustomerGroups(business.id);
  const update = useUpdateCustomer(business.id);
  const [erasing, setErasing] = useState(false);
  const group = groups.data?.find((g) => g.id === c.groupId);
  const now = useNow(60_000).getTime();
  const upcoming = c.bookings.filter((b) => Date.parse(b.start) > now && b.status !== "cancelled");

  return (
    <ScreenScroll
      testID="customer-detail"
      keyboardShouldPersistTaps="handled"
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      <View style={styles.header}>
        <View style={styles.row}>
          <PersonAvatar name={c.name} size={48} />
          <View style={styles.flex}>
            <Text variant="title2" numberOfLines={2} accessibilityRole="header">
              {c.name}
            </Text>
            <View style={styles.badges}>
              {group ? <Badge label={group.name} tone="brand" /> : null}
              {c.hasAccount ? <Badge label="Has an account" /> : null}
            </View>
          </View>
        </View>
        <Button
          testID="customer-new-booking"
          label={`New ${v("booking")}`}
          icon={CalendarPlus}
          onPress={() =>
            openNewBooking({ customer: { id: c.id, name: c.name, email: c.email, phone: c.phone } })
          }
        />
      </View>

      <Contact customer={c} />

      <View style={styles.stats}>
        <Stat label={v("bookings", { title: true })} value={String(c.bookingCount)} />
        <Stat label="Upcoming" value={String(upcoming.length)} />
        <Stat label={`${v("customer", { title: true })} since`} value={fmt.date(c.createdAt, "monthYear")} />
      </View>

      <View>
        <SectionTitle title="History" />
        <Card padding={0}>
          {c.bookings.length === 0 ? (
            <View style={styles.padded}>
              <Text variant="callout" tone="muted">
                {`No ${v("bookings")} yet. Book something for ${c.name.split(" ")[0]}.`}
              </Text>
            </View>
          ) : (
            c.bookings.map((b, i) => (
              <View key={b.id}>
                {i > 0 ? <Divider /> : null}
                <BookingRow booking={b} fmt={fmt} onOpen={openBooking} when="date" />
              </View>
            ))
          )}
        </Card>
      </View>

      <View>
        <SectionTitle title="Details" />
        <Card>
          <CustomerForm
            key={`${c.id}-${c.name}-${c.email ?? ""}-${c.phone ?? ""}-${c.groupId ?? ""}-${c.notes ?? ""}`}
            testID="customer-details-form"
            initial={c}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              await update.mutateAsync({ id: c.id, input });
              haptics.success();
              toast.show("Saved", "success");
            }}
          />
        </Card>
      </View>

      {perms.manageCustomerData ? (
        <View>
          <SectionTitle title="Privacy" />
          <Card padding={0}>
            <ExportRow customer={c} />
            <Divider inset={space[12]} />
            <ListRow
              testID="erase-customer"
              icon={Trash2}
              title="Erase personal data"
              subtitle="Respond to a request to be forgotten"
              destructive
              onPress={() => setErasing(true)}
            />
          </Card>
        </View>
      ) : null}

      <EraseSheet
        customer={c}
        visible={erasing}
        onClose={() => setErasing(false)}
        onErased={() => {
          setErasing(false);
          onErased();
        }}
      />
    </ScreenScroll>
  );
}

/** Call, message and email, or a note that there's no way to reach them. */
function Contact({ customer: c }: { customer: Detail }) {
  const { phone, email } = c;
  return (
    <Card padding={0}>
      {phone ? (
        <>
          <ListRow icon={Phone} title={phone} subtitle="Call" onPress={() => void callNumber(phone)} />
          <Divider inset={space[12]} />
          <ListRow
            icon={MessageSquare}
            title={phone}
            subtitle="Message"
            onPress={() => void sendMessage(phone)}
          />
        </>
      ) : null}
      {email ? (
        <>
          {phone ? <Divider inset={space[12]} /> : null}
          <ListRow icon={Mail} title={email} subtitle="Email" onPress={() => void sendEmail(email)} />
        </>
      ) : null}
      {!phone && !email ? (
        <View style={styles.padded}>
          <Text variant="callout" tone="muted">
            No contact details. Add an email or phone under Details.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/** Everything held about them as JSON (a GDPR access request), handed to the share sheet (Mail, Files, AirDrop). */
function ExportRow({ customer: c }: { customer: Detail }) {
  const business = useCurrentBusiness();
  const toast = useToast();
  const exportData = useExportCustomer(business.id);
  const share = async () => {
    try {
      const data = await exportData.mutateAsync(c.id);
      await Share.share({
        title: `${c.name}: data export`,
        message: JSON.stringify(data, null, 2),
      });
    } catch (err) {
      logError(err, { feature: "customers", action: "export" });
      toast.show(errorMessage(err), "danger");
    }
  };
  return (
    <ListRow
      testID="export-customer"
      icon={Share2}
      title={exportData.isPending ? "Preparing their data…" : "Share their data"}
      subtitle="Everything held about them, as JSON"
      onPress={exportData.isPending ? undefined : () => void share()}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat} padding={3}>
      <View accessible accessibilityLabel={`${label}: ${value}`}>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="headline" numeric numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: { padding: space[4], gap: space[3] },
  header: { gap: space[3] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  flex: { flex: 1, gap: space[1] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5] },
  stats: { flexDirection: "row", gap: space[2] },
  stat: { flex: 1 },
  padded: { padding: space[4] },
});
