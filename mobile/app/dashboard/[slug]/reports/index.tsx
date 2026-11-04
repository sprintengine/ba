import { ReportsScreen } from "~/features/reports/ReportsScreen";
import { RequireRole } from "~/shell/RequireRole";

export default function ReportsRoute() {
  return (
    <RequireRole min="admin">
      <ReportsScreen />
    </RequireRole>
  );
}
