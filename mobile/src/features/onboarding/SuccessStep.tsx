import { Share, StyleSheet, View } from "react-native";
import { ArrowRight, Check, Share2 } from "lucide-react-native";
import { env } from "~/config/env";
import { Button, Card, Icon, Text, useTheme } from "~/ui";
import { FormScroll } from "~/ui/form";
import { radius, space } from "~/ui/tokens";
import { publicHost } from "./BusinessSheet";
import type { CreatedBusiness } from "./wizard";

/** The business exists (the website's SuccessStep, without the payments card): share its page, open its dashboard. */
export function SuccessStep({ business, onOpen }: { business: CreatedBusiness; onOpen: () => void }) {
  const { colors } = useTheme();
  const url = `${env.webUrl || "https://bookanything.ie"}/${business.slug}`;

  return (
    <FormScroll testID="onboarding-success">
      <View style={styles.hero}>
        <View style={[styles.check, { backgroundColor: colors.success }]}>
          <Icon icon={Check} size={30} color="successForeground" strokeWidth={2.5} />
        </View>
        <Text variant="title1" align="center" accessibilityLiveRegion="polite">
          {business.name} is ready
        </Text>
        <Text tone="muted" align="center">
          Your booking page is live. Share the link and customers can book straight away.
        </Text>
      </View>
      <Card>
        <View style={styles.link}>
          <Text variant="footnote" tone="muted">
            Your booking page
          </Text>
          <Text weight="medium" selectable testID="onboarding-success-url">
            {publicHost()}/{business.slug}
          </Text>
          <Button
            label="Share link"
            variant="secondary"
            icon={Share2}
            testID="onboarding-share"
            onPress={() => void Share.share({ message: url, url }).catch(() => undefined)}
          />
        </View>
      </Card>
      <Button
        label="Open dashboard"
        variant="brand"
        size="lg"
        icon={ArrowRight}
        fullWidth
        testID="onboarding-open-dashboard"
        onPress={onOpen}
      />
      <Text variant="footnote" tone="muted" align="center">
        Invite your team and fine-tune services, staff and hours from your dashboard.
      </Text>
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space[3], paddingTop: space[8] },
  check: {
    width: space[16],
    height: space[16],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[2],
  },
  link: { gap: space[2], alignItems: "flex-start" },
});
