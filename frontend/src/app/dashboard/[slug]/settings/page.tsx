"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentBusiness } from "@/lib/business/business-context";

export default function SettingsIndex() {
  const business = useCurrentBusiness();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/dashboard/${business.slug}/settings/general`);
  }, [business.slug, router]);
  return null;
}
