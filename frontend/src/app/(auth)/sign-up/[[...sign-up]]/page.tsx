import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return <AuthPage mode="sign-up" />;
}
