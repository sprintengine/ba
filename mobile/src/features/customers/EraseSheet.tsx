import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@shared/api/client";
import { useEraseCustomer } from "@shared/api/hooks/use-customers";
import type { Customer } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Sheet, Text, TextField, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { haptics } from "~/features/bookings/haptics";

/** GDPR erase, confirmed by typing the customer's name (it can't be undone). */
export function EraseSheet({
  customer,
  visible,
  onClose,
  onErased,
}: {
  customer: Pick<Customer, "id" | "name">;
  visible: boolean;
  onClose: () => void;
  onErased: () => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const toast = useToast();
  const erase = useEraseCustomer(business.id);
  const [typed, setTyped] = useState("");
  const match = typed.trim().toLowerCase() === customer.name.trim().toLowerCase();

  const close = () => {
    if (erase.isPending) return;
    setTyped("");
    onClose();
  };
  const submit = async () => {
    try {
      await erase.mutateAsync(customer.id);
      haptics.warning();
      toast.show("Personal data erased", "success");
      setTyped("");
      onErased();
    } catch (err) {
      haptics.error();
      toast.show(errorMessage(err), "danger");
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={`Erase ${customer.name}?`}
      testID="erase-sheet"
      footer={
        <View style={styles.actions}>
          <Button label="Keep" variant="secondary" onPress={close} />
          <Button
            testID="confirm-erase"
            label="Erase permanently"
            variant="destructive"
            disabled={!match}
            loading={erase.isPending}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      <Text tone="muted">
        {`Their name, email, phone, notes and answers are anonymised on every ${v("booking")}. ${v("bookings", { title: true })} stay in your reports without personal data. This can't be undone.`}
      </Text>
      <TextField
        testID="erase-confirm-name"
        label={`Type ${customer.name} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space[2], flexWrap: "wrap" },
});
