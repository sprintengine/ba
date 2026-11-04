import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { BusinessSetup } from "@shared/api/types";
import type { SetupAction } from "@shared/onboarding/actions";
import { describeProblem } from "@shared/onboarding/problems";
import type { SetupErrors } from "@shared/onboarding/types";
import { Banner, Button, Sheet, Text, TextField } from "~/ui";
import { confirmAction } from "~/ui/form";
import { space } from "~/ui/tokens";
import { HoursEditor } from "./HoursEditor";
import { errorsUnder } from "./wizard";

/**
 * One resource (a staff member, room, bay…): its name and weekly hours (the website's resources section, lighter).
 * Its kind, capacity and description are edited in Resources once the business exists.
 */
export function ResourceSheet({
  resourceKey,
  onClose,
  setup,
  errors,
  dispatch,
}: {
  /** The resource being edited, or null when the sheet is closed. */
  resourceKey: string | null;
  onClose: () => void;
  setup: BusinessSetup;
  errors: SetupErrors;
  dispatch: (action: SetupAction) => void;
}) {
  const index = setup.resources.findIndex((r) => r.key === resourceKey);
  const resource = setup.resources[index];
  const noun = setup.vocabulary.resource;
  const prefix = `resources[${index}].`;
  const others = errorsUnder(errors, prefix).filter(
    ([field]) => field !== "name" && !field.startsWith("weeklyHours["),
  );

  const remove = async () => {
    if (!resource) return;
    const ok = await confirmAction({
      title: `Remove ${resource.name.trim() || `this ${noun.toLowerCase()}`}?`,
      message: "Services that needed it no longer will.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    onClose();
    dispatch({ type: "removeResource", key: resource.key });
  };

  return (
    <Sheet
      visible={!!resource}
      onClose={onClose}
      title={resource?.name.trim() || noun}
      testID="onboarding-resource-sheet"
      footer={<Button label="Done" fullWidth testID="onboarding-resource-done" onPress={onClose} />}
    >
      {resource ? (
        <>
          <TextField
            label="Name"
            testID="onboarding-resource-name"
            value={resource.name}
            onChangeText={(name) => dispatch({ type: "updateResource", key: resource.key, patch: { name } })}
            error={errors[`${prefix}name`]}
            maxLength={100}
          />
          <HoursEditor
            resource={resource}
            resourceIndex={index}
            groups={setup.customerGroups}
            errors={errors}
            otherResourceCount={setup.resources.length - 1}
            resourcesNoun={setup.vocabulary.resources}
            dispatch={dispatch}
          />
          {others.length > 0 ? (
            <Banner tone="warning" title="Also needs fixing" testID="onboarding-resource-other-problems">
              <View style={styles.problems}>
                {others.map(([field, message]) => (
                  <Text key={field} variant="callout">
                    {describeProblem(setup, prefix + field, message).label}: {message}
                  </Text>
                ))}
              </View>
            </Banner>
          ) : null}
          <Text variant="footnote" tone="subtle">
            Its type and capacity can be changed in Resources after you create your business.
          </Text>
          <Button
            label={`Remove ${noun.toLowerCase()}`}
            variant="ghost"
            icon={Trash2}
            testID="onboarding-resource-remove"
            onPress={() => void remove()}
          />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  problems: { gap: space[1] },
});
