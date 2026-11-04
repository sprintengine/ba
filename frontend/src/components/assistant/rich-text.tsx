import { richText, type Inline } from "@/lib/assistant/rich-text";

function Inlines({ parts }: { parts: Inline[] }) {
  return parts.map((p, i) =>
    p.bold ? (
      <strong key={i} className="font-semibold">
        {p.text}
      </strong>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

/** Bo's answer text: paragraphs, lists and bold only (never HTML). */
export function RichText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {richText(text).map((block, i) =>
        block.kind === "paragraph" ? (
          <p key={i}>
            <Inlines parts={block.inlines} />
          </p>
        ) : block.ordered ? (
          <ol key={i} className="flex list-decimal flex-col gap-1 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines parts={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-subtle-foreground">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines parts={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
