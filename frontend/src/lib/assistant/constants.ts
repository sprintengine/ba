/** The assistant's name, everywhere in the UI. Change it here only. */
export const ASSISTANT_NAME = "Bo";

/** ⌘J / Ctrl+J opens and closes the assistant. */
export const ASSISTANT_SHORTCUT = { key: "j", label: "⌘J" } as const;

/** How long Bo stays happy after a good answer before settling back to idle. */
export const SUCCESS_MS = 2_400;
