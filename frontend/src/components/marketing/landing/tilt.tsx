"use client";

import { useRef } from "react";

/**
 * Tilts the glass panes inside it towards the pointer (fine pointers only; still under reduced motion). The panes
 * read `--rx`, `--ry` and `--ra` (the rim's light angle) from their own style; see prism.module.css `.gl`.
 */
export function Tilt({ className, children, ...props }: React.ComponentProps<"article">) {
  const ref = useRef<HTMLElement>(null);
  const panes = () => ref.current?.querySelectorAll<HTMLElement>("[data-tilt]") ?? [];
  const allowed = () =>
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <article
      ref={ref}
      className={className}
      onPointerMove={(e) => {
        if (!allowed()) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        for (const g of panes()) {
          g.style.setProperty("--ry", `${x * 10}deg`);
          g.style.setProperty("--rx", `${-y * 8}deg`);
          g.style.setProperty("--ra", `${200 + x * 120}deg`);
        }
      }}
      onPointerLeave={() => {
        for (const g of panes()) {
          g.style.setProperty("--ry", "0deg");
          g.style.setProperty("--rx", "0deg");
        }
      }}
      {...props}
    >
      {children}
    </article>
  );
}
