import { router, Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Bot, UserRound } from "lucide-react-native";
import { useBusinessContext } from "@shared/business/business-context";
import { Card, Divider, ListRow, ScreenScroll, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { businessNav, moreItems } from "./nav";

/** Phones: every business section not in the tab bar, then the customer side and AI apps. */
export function MoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { business, role } = useBusinessContext();
  const items = moreItems(
    businessNav({ slug, role, sitesEnabled: !!business.sitesEnabled, vocabulary: business.vocabulary }),
  );
  return (
    <>
      <Stack.Screen options={{ title: "More", headerLargeTitle: true }} />
      <ScreenScroll testID="more">
        <Card padding={0}>
          {items.map((item, i) => (
            <View key={item.key}>
              {i > 0 ? <Divider inset={space[12]} /> : null}
              <ListRow
                testID={`more-${item.key}`}
                icon={item.icon}
                title={item.label}
                onPress={() => router.navigate(item.href)}
              />
            </View>
          ))}
        </Card>
        <View style={styles.section}>
          <Text variant="caption" tone="subtle">
            YOU
          </Text>
          <Card padding={0}>
            <ListRow
              icon={UserRound}
              title="My bookings"
              subtitle="As a customer"
              onPress={() => router.navigate("/my/bookings")}
            />
            <Divider inset={space[12]} />
            <ListRow
              icon={Bot}
              title="Run the business from ChatGPT or Claude"
              onPress={() => router.push({ pathname: "/connect-ai", params: { server: "business" } })}
            />
          </Card>
        </View>
      </ScreenScroll>
    </>
  );
}

const styles = StyleSheet.create({ section: { gap: space[2] } });
