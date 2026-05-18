import {
  escapeHtml,
  highlightHtml,
  highlightSegments,
  snippetWithHighlight,
} from "../highlight-shared";

describe("escapeHtml", () => {
  it("escapes &, <, >, and quotes", () => {
    expect(escapeHtml('a & b < c > "d"')).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot;',
    );
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("highlightHtml", () => {
  it("wraps matches in <mark> tags", () => {
    expect(highlightHtml("Hello World", "world")).toBe(
      "Hello <mark>World</mark>",
    );
  });

  it("is case-insensitive", () => {
    expect(highlightHtml("ABC abc", "abc")).toBe(
      "<mark>ABC</mark> <mark>abc</mark>",
    );
  });

  it("returns escaped text when query is empty", () => {
    expect(highlightHtml("a < b", "")).toBe("a &lt; b");
  });

  it("escapes HTML in matched text", () => {
    expect(highlightHtml("<script>", "script")).toBe(
      "&lt;<mark>script</mark>&gt;",
    );
  });

  it("handles multiple adjacent matches", () => {
    expect(highlightHtml("aaa", "a")).toBe(
      "<mark>a</mark><mark>a</mark><mark>a</mark>",
    );
  });
});

describe("highlightSegments", () => {
  it("returns single text segment for no query", () => {
    const result = highlightSegments("Hello", "");
    expect(result).toEqual([{ type: "text", value: "Hello" }]);
  });

  it("splits text into segments around matches", () => {
    const result = highlightSegments("Hello World Hello", "Hello");
    expect(result).toEqual([
      { type: "mark", value: "Hello" },
      { type: "text", value: " World " },
      { type: "mark", value: "Hello" },
    ]);
  });

  it("is case-insensitive", () => {
    const result = highlightSegments("Test test TEST", "test");
    expect(result).toHaveLength(5);
    expect(result.filter((s) => s.type === "mark")).toHaveLength(3);
  });

  it("returns single text segment when no match", () => {
    const result = highlightSegments("Hello", "xyz");
    expect(result).toEqual([{ type: "text", value: "Hello" }]);
  });

  it("handles empty text", () => {
    const result = highlightSegments("", "test");
    expect(result).toEqual([{ type: "text", value: "" }]);
  });
});

describe("snippetWithHighlight", () => {
  it("returns highlighted snippet around first match", () => {
    const text = "A".repeat(100) + "TARGET" + "B".repeat(100);
    const result = snippetWithHighlight(text, "TARGET", 40);
    expect(result).toContain("<mark>TARGET</mark>");
    expect(result.startsWith("…")).toBe(true);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns plain text when no match", () => {
    const result = snippetWithHighlight("Hello World", "xyz", 50);
    expect(result).toBe("Hello World");
    expect(result).not.toContain("<mark>");
  });

  it("returns escaped text for empty query", () => {
    const result = snippetWithHighlight("a < b", "", 50);
    expect(result).toBe("a &lt; b");
  });
});
