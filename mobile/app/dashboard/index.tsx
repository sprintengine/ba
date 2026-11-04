import { Redirect } from "expo-router";
import { homeHref, lastVisit, useSignedInMe } from "~/shell/session";
import { ErrorState, Screen } from "~/ui";

/** `/dashboard` (the website's link to "your dashboard"): the business last opened, else the first. */
export default function DashboardIndex() {
  const me = useSignedInMe();
  if (me.data) return <Redirect href={homeHref(me.data, { ...lastVisit(), experience: "business" })} />;
  if (me.isError) {
    return (
      <Screen>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </Screen>
    );
  }
  return <Screen />;
}
