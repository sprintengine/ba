"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowRight, FlaskConical } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { afterSignInUrl } from "@/lib/auth/components";
import { DEMO_ACCOUNTS, devSignIn, devSubForEmail } from "@/lib/auth/dev-auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormSubmit } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  name: z.string().trim().min(1, "Enter your name").max(120),
});
type Values = z.infer<typeof schema>;

/** Local-development sign-in (no Clerk). Creates a `dev.<base64url>` token — see architecture §3.2. */
export function DevSignInForm({
  mode,
  redirectUrl,
}: {
  mode: "sign-in" | "sign-up";
  redirectUrl: string | null;
}) {
  const router = useRouter();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", name: "" } });

  const done = () => router.replace(afterSignInUrl(redirectUrl, { signUp: mode === "sign-up" }));

  const signInAs = (identity: { sub: string; email: string; name: string }) => {
    devSignIn(identity);
    done();
  };

  if (isLoaded && isSignedIn && user) {
    return (
      <div className="flex flex-col gap-6">
        <Header mode={mode} />
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs">
          <Avatar name={user.name ?? user.email} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" onClick={done}>
            Continue as {user.name?.split(" ")[0] ?? user.email} <ArrowRight />
          </Button>
          <Button variant="ghost" onClick={() => signOut()}>
            Use a different account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Header mode={mode} />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-subtle-foreground">Demo accounts</p>
        <div className="grid gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.sub}
              type="button"
              onClick={() => signInAs(account)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-xs transition-[border-color,box-shadow,transform] hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]"
            >
              <Avatar name={account.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                {/* Wraps on a narrow phone rather than pushing the page sideways. */}
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                  {account.role}
                  <span className="min-w-0 text-xs font-normal break-all text-subtle-foreground">
                    {account.email}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{account.description}</span>
              </span>
              <ArrowRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-subtle-foreground">
        <Separator className="flex-1" /> or use any email <Separator className="flex-1" />
      </div>

      <Form
        form={form}
        onSubmit={(v) =>
          signInAs({ sub: devSubForEmail(v.email), email: v.email.trim().toLowerCase(), name: v.name.trim() })
        }
      >
        <FormField name="email" label="Email">
          {(field) => (
            <Input
              size="lg"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.ie"
              {...field}
            />
          )}
        </FormField>
        <FormField name="name" label="Name">
          {(field) => <Input size="lg" autoComplete="name" placeholder="Alex Morgan" {...field} />}
        </FormField>
        <FormSubmit size="lg">{mode === "sign-up" ? "Create account" : "Sign in"}</FormSubmit>
      </Form>
    </div>
  );
}

function Header({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-soft-foreground">
        <FlaskConical className="size-3" /> Development sign-in
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "sign-up" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="text-sm text-muted-foreground">
        Clerk isn&apos;t configured, so you&apos;re using dev auth. The backend must run with{" "}
        <code className="font-mono text-xs">AUTH_MODE=dev</code>.
      </p>
    </div>
  );
}
