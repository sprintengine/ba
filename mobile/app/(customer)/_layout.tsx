/**
 * The customer experience: Explore, My bookings, Approvals, Account (tabs on phones, a sidebar on iPad). Signed out,
 * Explore alone (a business's page and booking as a guest), without the tabs; the others ask to sign in.
 */
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@shared/auth/context";
import { AdaptiveTabs } from "~/shell/AdaptiveTabs";
import { BrandMark } from "~/shell/BrandMark";
import { BusinessSwitcher } from "~/shell/BusinessSwitcher";
import { CUSTOMER_NAV } from "~/shell/nav";
import { useSignedInMe } from "~/shell/session";
import { space } from "~/ui/tokens";

export default function CustomerLayout() {
  const { isSignedIn } = useAuth();
  const me = useSignedInMe();
  const hasBusinesses = (me.data?.memberships.length ?? 0) > 0;
  return (
    <AdaptiveTabs
      items={CUSTOMER_NAV}
      barHidden={!isSignedIn}
      sidebarHeader={
        <View style={styles.header}>
          <BrandMark />
          {hasBusinesses ? <BusinessSwitcher current={null} /> : null}
        </View>
      }
    >
      {CUSTOMER_NAV.map((item) => (
        <Tabs.Screen key={item.key} name={item.routeName} options={{ title: item.label }} />
      ))}
    </AdaptiveTabs>
  );
}

const styles = StyleSheet.create({ header: { gap: space[3], paddingVertical: space[2] } });
