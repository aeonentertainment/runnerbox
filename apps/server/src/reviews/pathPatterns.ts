// The owner's ignore patterns, in .gitignore's syntax: `*` and `?` stay within a path segment, `**`
// crosses them, a pattern with no inner slash matches at any depth, a leading slash anchors it to
// the root, and a match on a directory covers everything inside it.
const toRegExp = (pattern: string) => {
  const trimmed = pattern.trim().replace(/\/+$/, "");
  const anchored = trimmed.startsWith("/") || trimmed.slice(0, -1).includes("/");
  const body = trimmed
    .replace(/^\//, "")
    .split(/(\*\*\/|\/\*\*$|\*\*|\*|\?)/)
    .map((part) => {
      if (part === "**/") return "(?:.*/)?";
      if (part === "/**") return "/.*";
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      if (part === "?") return "[^/]";
      return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${body}(?:/.*)?$`);
};

export function matchesAny(patterns: ReadonlyArray<string>) {
  const compiled = patterns.filter((pattern) => pattern.trim().replace(/\/+$/, "") !== "").map(toRegExp);
  return (path: string) => compiled.some((pattern) => pattern.test(path));
}
