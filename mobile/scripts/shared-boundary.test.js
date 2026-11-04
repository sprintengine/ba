const path = require("node:path");
const { FRONTEND_SRC } = require("../shared-code");
const { checkModule, checkSharedBoundary } = require("./shared-boundary");

const ctx = {
  mobileDeps: { react: "19.2.3", zod: "^4.6.5", "date-fns": "^4.4.0" },
  frontendDeps: { react: "^19.3.0", zod: "^4.6.5", "date-fns": "^3.0.0" },
  tsPaths: { react: ["x"], zod: ["x"], "date-fns": ["x"] },
};
const file = (name) => path.join(FRONTEND_SRC, "lib", name);

describe("shared code boundary", () => {
  it("holds for everything the app imports from the website", () => {
    const { files, problems } = checkSharedBoundary();
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith(path.join("lib", "api", "client.ts")))).toBe(true);
    expect(problems).toEqual([]);
  });

  // The checker must be able to fail (a guard that can't fail is decoration).
  it.each([
    ['import Link from "next/link";', /web-only package next\/link/],
    ['import { cn } from "@/components/ui/button";', /website component/],
    ["export const w = () => window.innerWidth;", /browser global window/],
    ["export const s = localStorage.getItem('x');", /browser global localStorage/],
    ['import { useForm } from "react-hook-form";', /isn't a dependency/],
    ['import { format } from "date-fns";', /keep the same major/],
  ])("flags %s", (source, problem) => {
    expect(checkModule(file("x.ts"), source, ctx).join("\n")).toMatch(problem);
  });

  it("doesn't take a module's own variable for a browser global", () => {
    const own =
      "export function radius(location: Loc) { return location.kind; }\nconst history = []; history.push(1);\n";
    expect(checkModule(file("x.ts"), own, ctx)).toEqual([]);
    expect(checkModule(file("x.ts"), "export const p = location.pathname;", ctx).join()).toMatch(
      /browser global location/,
    );
  });

  it("flags DOM elements in components but not prose or generics", () => {
    expect(checkModule(file("x.tsx"), "export const A = () => <div />;", ctx).join()).toMatch(/<div>/);
    const fine =
      '// window.open in a comment\nexport const t = "document.title";\nconst f = <T,>(x: T) => x;\n';
    expect(checkModule(file("x.tsx"), fine, ctx)).toEqual([]);
  });
});
