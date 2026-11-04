import { cleanSlugInput } from "@/lib/slug";
import type { BusinessAction, SetupHandlers } from "../actions";
import { createDraft, deriveSlug } from "../draft";
import { withSetup } from "./edit";

/** Business details. The slug follows the name until the owner edits it. */
export const businessHandlers: SetupHandlers<BusinessAction> = {
  load: (_draft, action) => createDraft(action.setup),
  setName: (draft, action) => ({
    ...draft,
    setup: {
      ...draft.setup,
      name: action.name,
      slug: draft.slugEdited ? draft.setup.slug : deriveSlug(action.name) || null,
    },
  }),
  setSlug: (draft, action) => ({
    slugEdited: true,
    setup: { ...draft.setup, slug: cleanSlugInput(action.slug) },
  }),
  resetSlug: (draft) => ({
    slugEdited: false,
    setup: { ...draft.setup, slug: deriveSlug(draft.setup.name) || null },
  }),
  updateBusiness: (draft, action) => withSetup(draft, (s) => ({ ...s, ...action.patch })),
  setVocabulary: (draft, action) =>
    withSetup(draft, (s) => ({ ...s, vocabulary: { ...s.vocabulary, ...action.patch } })),
  setBrandColor: (draft, action) =>
    withSetup(draft, (s) => ({ ...s, branding: { ...s.branding, primaryColor: action.color } })),
};
