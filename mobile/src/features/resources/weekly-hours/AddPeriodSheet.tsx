import { useState } from "react";
import { useBusinessContext } from "@shared/business/business-context";
import { todayInTz } from "@shared/format";
import { Button, DateField, Sheet, Text } from "~/ui";
import { periodError } from "../resources";

/** Pick the dates of a new seasonal schedule (the website's AddPeriodDialog). */
export function AddPeriodSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (from: string, until: string | null) => void;
}) {
  const { business } = useBusinessContext();
  const today = todayInTz(business.timezone);
  const [from, setFrom] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const error = periodError(from, until);
  const close = () => {
    setFrom(null);
    setUntil(null);
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Seasonal hours"
      testID="period-sheet"
      footer={
        <Button
          testID="period-add"
          label="Add period"
          fullWidth
          disabled={!from || !!error}
          onPress={() => {
            if (!from) return;
            onAdd(from, until);
            close();
          }}
        />
      }
    >
      <Text tone="muted">
        Extra hours for a date range — summer evenings, a holiday rota. They add to your regular hours.
      </Text>
      <DateField
        label="From"
        testID="period-from"
        value={from}
        onChange={setFrom}
        clearable
        defaultDate={today}
        locale={business.locale}
      />
      <DateField
        label="Until (optional)"
        testID="period-until"
        value={until}
        onChange={setUntil}
        clearable
        min={from}
        defaultDate={from ?? today}
        error={error}
        locale={business.locale}
      />
    </Sheet>
  );
}
