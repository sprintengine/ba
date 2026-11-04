import { AppProviders } from "@/app/app-providers";
import { AuthShell } from "@/components/shells/auth-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AuthShell>{children}</AuthShell>
    </AppProviders>
  );
}
