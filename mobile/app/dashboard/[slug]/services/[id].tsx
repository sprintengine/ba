import { useLocalSearchParams } from "expo-router";
import { ServiceEditorScreen } from "~/features/services/ServiceEditorScreen";
import { RequireRole } from "~/shell/RequireRole";

/** A service's editor on phones (`new` creates one); iPad edits beside the list instead. */
export default function ServiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireRole min="admin">
      <ServiceEditorScreen id={id ?? "new"} />
    </RequireRole>
  );
}
