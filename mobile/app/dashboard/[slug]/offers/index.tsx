import { OffersScreen } from "~/features/offers/OffersScreen";
import { RequireRole } from "~/shell/RequireRole";

export default function OffersRoute() {
  return (
    <RequireRole min="admin">
      <OffersScreen />
    </RequireRole>
  );
}
