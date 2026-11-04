"use client";

/**
 * Businesses rename the core nouns: a physio's "resources" are "therapists",
 * a GP's "customers" are "patients". Never hard-code these words in UI copy —
 * use `useVocabulary()`:
 *
 *   const { v } = useVocabulary();
 *   v("customer")                  // "patient"
 *   v("customers", { title: true }) // "Patients"
 *   v("booking", { count: 3 })     // "appointments"
 *
 * The dashboard layout and the public booking shell provide the vocabulary.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Vocabulary } from "@/lib/api/types";

export type VocabularyKey = keyof Vocabulary;

export const DEFAULT_VOCABULARY: Vocabulary = {
  resource: "resource",
  resources: "resources",
  customer: "customer",
  customers: "customers",
  booking: "booking",
  bookings: "bookings",
};

type VOptions = {
  /** Capitalise first letter ("Patients"). */
  title?: boolean;
  /** Choose singular/plural from a count (uses the singular key's family). */
  count?: number;
};

const PLURAL: Record<VocabularyKey, VocabularyKey> = {
  resource: "resources",
  resources: "resources",
  customer: "customers",
  customers: "customers",
  booking: "bookings",
  bookings: "bookings",
};
const SINGULAR: Record<VocabularyKey, VocabularyKey> = {
  resource: "resource",
  resources: "resource",
  customer: "customer",
  customers: "customer",
  booking: "booking",
  bookings: "booking",
};

export function vocab(
  vocabulary: Partial<Vocabulary> | null | undefined,
  key: VocabularyKey,
  options: VOptions = {},
) {
  const resolvedKey = options.count === undefined ? key : options.count === 1 ? SINGULAR[key] : PLURAL[key];
  const word = vocabulary?.[resolvedKey]?.trim() || DEFAULT_VOCABULARY[resolvedKey];
  if (options.title) return word.charAt(0).toUpperCase() + word.slice(1);
  // Stored vocabularies may be capitalised ("Appointments"); mid-sentence we want
  // "3 appointments". Leave acronyms ("GPs") alone.
  return /^[A-Z][a-z]/.test(word) ? word.charAt(0).toLowerCase() + word.slice(1) : word;
}

const VocabularyContext = createContext<Vocabulary>(DEFAULT_VOCABULARY);

export function VocabularyProvider({
  vocabulary,
  children,
}: {
  vocabulary: Vocabulary | null | undefined;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ ...DEFAULT_VOCABULARY, ...(vocabulary ?? {}) }), [vocabulary]);
  return <VocabularyContext.Provider value={value}>{children}</VocabularyContext.Provider>;
}

export function useVocabulary() {
  const vocabulary = useContext(VocabularyContext);
  return useMemo(
    () => ({ vocabulary, v: (key: VocabularyKey, options?: VOptions) => vocab(vocabulary, key, options) }),
    [vocabulary],
  );
}
