import { RequireSignIn } from "~/auth/RequireSignIn";
import { InvitationScreen } from "~/features/invitations/InvitationScreen";

/** A team invitation email's link: signed in (as the invited email), and back here after "Use a different account". */
export default function InvitationRoute() {
  return (
    <RequireSignIn returnAfterSignOut>
      <InvitationScreen />
    </RequireSignIn>
  );
}
