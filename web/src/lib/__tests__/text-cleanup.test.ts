import { cleanupPromptPreview, cleanupPromptText } from "../text-cleanup";

describe("cleanupPromptPreview", () => {
  it("returns empty string for undefined/null/empty", () => {
    expect(cleanupPromptPreview(undefined)).toBe("");
    expect(cleanupPromptPreview("")).toBe("");
    expect(cleanupPromptPreview("   ")).toBe("");
  });

  it("strips <user_query> wrapper", () => {
    expect(cleanupPromptPreview("<user_query>Hello world</user_query>")).toBe(
      "Hello world",
    );
  });

  it("strips <user_message> wrapper", () => {
    expect(
      cleanupPromptPreview("<user_message>Test prompt</user_message>"),
    ).toBe("Test prompt");
  });

  it("handles dangling opener without closing tag (truncated)", () => {
    expect(cleanupPromptPreview("<user_query>Hello world")).toBe("Hello world");
  });

  it("collapses slash command envelopes", () => {
    const raw =
      "<command-message>set effort</command-message><command-name>/effort</command-name><command-args>max</command-args>";
    expect(cleanupPromptPreview(raw)).toBe("/effort max");
  });

  it("collapses slash command without args", () => {
    const raw =
      "<command-message>help</command-message><command-name>/help</command-name>";
    expect(cleanupPromptPreview(raw)).toBe("/help");
  });

  it("strips local-command envelopes", () => {
    expect(
      cleanupPromptPreview(
        "<local-command-stdout>output text</local-command-stdout>",
      ),
    ).toBe("output text");
  });

  it("takes only first non-empty line", () => {
    expect(cleanupPromptPreview("Line one\n\nLine two\nLine three")).toBe(
      "Line one",
    );
  });

  it("collapses whitespace", () => {
    expect(cleanupPromptPreview("  lots   of    spaces  ")).toBe(
      "lots of spaces",
    );
  });

  it("truncates to maxLen with ellipsis", () => {
    const long = "A".repeat(100);
    const result = cleanupPromptPreview(long, 50);
    expect(result.length).toBe(51); // 50 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate when within maxLen", () => {
    expect(cleanupPromptPreview("Short text", 100)).toBe("Short text");
  });
});

describe("cleanupPromptText", () => {
  it("strips wrappers but preserves line breaks", () => {
    const raw = "<user_query>Line one\nLine two\nLine three</user_query>";
    const result = cleanupPromptText(raw);
    expect(result).toBe("Line one\nLine two\nLine three");
  });

  it("returns empty string for undefined", () => {
    expect(cleanupPromptText(undefined)).toBe("");
  });
});
