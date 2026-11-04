/**
 * The little formatting Bo uses (pure): paragraphs, "- " / "* " / "1. " lists and **bold**. Everything else is plain
 * text; nothing is ever rendered as HTML.
 */
export type Inline = { text: string; bold: boolean };
export type RichBlock =
  { kind: "paragraph"; inlines: Inline[] } | { kind: "list"; ordered: boolean; items: Inline[][] };

export function inlines(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const [whole, bold = ""] = m;
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: bold, bold: true });
    last = m.index + whole.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

const BULLET = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;

export function richText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const chunk of source.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ kind: "paragraph", inlines: inlines(para.join(" ").trim()) });
      para = [];
    };
    for (const line of lines) {
      const m = BULLET.exec(line);
      if (!m) {
        para.push(line.trim());
        continue;
      }
      flush();
      const [, number, item = ""] = m;
      const ordered = number !== undefined;
      const prev = blocks.at(-1);
      if (prev?.kind === "list" && prev.ordered === ordered) prev.items.push(inlines(item));
      else blocks.push({ kind: "list", ordered, items: [inlines(item)] });
    }
    flush();
  }
  return blocks;
}
