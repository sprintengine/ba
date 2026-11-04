import type { CustomerGroup } from "@shared/api/types";
import { Button, Checkbox, Sheet, Text } from "~/ui";

/**
 * Who can book a time range (the website's AudiencePicker): everyone, or only the chosen customer groups. Changes
 * apply as they're ticked; Done closes.
 */
export function AudienceSheet({
  visible,
  label,
  groups,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  /** Names the range ("Monday 09:00–17:00"). */
  label: string;
  groups: readonly CustomerGroup[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Who can book these hours"
      testID="audience-sheet"
      footer={<Button testID="audience-done" label="Done" fullWidth onPress={onClose} />}
    >
      <Text weight="medium">{label}</Text>
      <Text variant="callout" tone="muted">
        Leave empty for everyone. Restricted groups can only book hours that list them.
      </Text>
      {groups.map((g) => (
        <Checkbox
          key={g.id}
          testID={`audience-${g.id}`}
          label={g.name}
          description={g.restricted ? "Restricted" : undefined}
          checked={value.includes(g.id)}
          onChange={(on) => onChange(on ? [...value, g.id] : value.filter((x) => x !== g.id))}
        />
      ))}
    </Sheet>
  );
}
