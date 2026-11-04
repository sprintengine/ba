import { StyleSheet, View } from "react-native";
import { ArrowUpRight, Sparkles } from "lucide-react-native";
import { quickActions } from "@shared/assistant/quick-actions";
import { useBusinessContext } from "@shared/business/business-context";
import { dashboardHref } from "@shared/dashboard/nav";
import { useVocabulary } from "@shared/vocabulary";
import { Button } from "~/ui";
import { space } from "~/ui/tokens";
import { useAssistantControls } from "./assistant-context";

/** Starting points: questions for Bo (when it can answer) and shortcuts, in the business's own words. */
export function QuickActions({ centred = false }: { centred?: boolean }) {
  const { business, role } = useBusinessContext();
  const { v } = useVocabulary();
  const { ask, navigate, state } = useAssistantControls();
  const canAsk = !!state?.configured && !state.credits.limitReached;
  const actions = quickActions(role, {
    booking: v("booking", { title: true }),
    bookings: v("bookings", { title: true }),
    customer: v("customer"),
  }).filter((a) => a.kind === "link" || canAsk);
  return (
    <View style={[styles.list, centred ? styles.centred : null]}>
      {actions.map((a) =>
        a.kind === "ask" ? (
          <Button
            key={a.id}
            size="sm"
            variant="secondary"
            icon={Sparkles}
            label={a.label}
            onPress={() => ask(a.prompt)}
            testID={`quick-${a.id}`}
          />
        ) : (
          <Button
            key={a.id}
            size="sm"
            variant="ghost"
            icon={ArrowUpRight}
            label={a.label}
            onPress={() => navigate(dashboardHref(business.slug, a.path))}
            testID={`quick-${a.id}`}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  centred: { justifyContent: "center" },
});
