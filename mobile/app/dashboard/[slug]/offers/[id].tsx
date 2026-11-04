import { useLocalSearchParams } from "expo-router";
import { OfferEditorScreen } from "~/features/offers/OfferEditorScreen";
import { RequireRole } from "~/shell/RequireRole";

/** An offer's editor on phones (`new` creates one); iPad edits beside the list instead. */
export default function OfferRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireRole min="admin">
      <OfferEditorScreen id={id ?? "new"} />
    </RequireRole>
  );
}
