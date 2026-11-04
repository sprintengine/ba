import { describe, expect, it } from "vitest";
import { optionalHttpUrl, URL_MAX_LENGTH } from "./url";

const schema = optionalHttpUrl("Enter a web address");
const problem = (value: string) => {
  const r = schema.safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? "invalid");
};

describe("optionalHttpUrl", () => {
  it("takes a blank or an http(s) address", () => {
    expect(problem("")).toBeNull();
    expect(problem("https://example.com/logo.png")).toBeNull();
    expect(problem("http://example.com")).toBeNull();
  });

  it("refuses other schemes and things that aren't addresses, as the backend does", () => {
    expect(problem("ftp://example.com/logo.png")).toBe("Enter a web address");
    expect(problem("javascript:alert(1)")).toBe("Enter a web address");
    expect(problem("logo.png")).toBe("Enter a web address");
  });

  it("refuses addresses over the backend's limit", () => {
    const long = `https://example.com/${"a".repeat(URL_MAX_LENGTH)}`;
    expect(problem(long)).toBe(`Keep it under ${URL_MAX_LENGTH} characters`);
  });
});
