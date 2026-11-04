"use client";

import { usePublicServices } from "@/lib/api/hooks";
import type { PublicService } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";

/** The services the public site shows (public, bookable), for the preview and pickers. */
export function useEditorServices(): PublicService[] {
  const business = useCurrentBusiness();
  return usePublicServices(business.slug, { staleTime: 60_000 }).data ?? EMPTY;
}

const EMPTY: PublicService[] = [];
