"use client";

import { createContext, useContext } from "react";
import Link from "next/link";

const NoPrefetch = createContext(false);

/** Links inside stop prefetching: for a sample of the app on a page where they lead nowhere. */
export const NoPrefetchProvider = NoPrefetch.Provider;

/** `next/link` for the app's screens that the home page also shows on sample data. */
export function AppLink(props: React.ComponentProps<typeof Link>) {
  const off = useContext(NoPrefetch);
  return <Link {...props} prefetch={off ? false : props.prefetch} />;
}
