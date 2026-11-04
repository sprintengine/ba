import { richText } from "@shared/assistant/rich-text";

/**
 * A reply's words without Bo's formatting marks (`**`, list bullets), lists as sentences: for screen reader labels
 * and for reading aloud.
 */
export function plainText(source: string): string {
  return richText(source)
    .map((block) =>
      block.kind === "paragraph"
        ? block.inlines.map((i) => i.text).join("")
        : block.items
            .map((item) =>
              item
                .map((i) => i.text)
                .join("")
                .replace(/([^.!?])$/u, "$1."),
            )
            .join(" "),
    )
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}
