import {
  getLanguageFromPath,
  isImagePath,
  extractOutputText,
  shortenPath,
} from "../tool-rendering";

describe("getLanguageFromPath", () => {
  it("returns empty for undefined/empty", () => {
    expect(getLanguageFromPath(undefined)).toBe("");
    expect(getLanguageFromPath("")).toBe("");
  });

  it("returns empty for no extension", () => {
    expect(getLanguageFromPath("Makefile")).toBe("");
    expect(getLanguageFromPath("/path/no-ext")).toBe("");
  });

  it("maps common extensions", () => {
    expect(getLanguageFromPath("foo.ts")).toBe("typescript");
    expect(getLanguageFromPath("foo.tsx")).toBe("typescript");
    expect(getLanguageFromPath("bar.js")).toBe("javascript");
    expect(getLanguageFromPath("bar.jsx")).toBe("javascript");
    expect(getLanguageFromPath("app.py")).toBe("python");
    expect(getLanguageFromPath("main.go")).toBe("go");
    expect(getLanguageFromPath("lib.rs")).toBe("rust");
    expect(getLanguageFromPath("style.css")).toBe("css");
    expect(getLanguageFromPath("config.yml")).toBe("yaml");
    expect(getLanguageFromPath("config.yaml")).toBe("yaml");
    expect(getLanguageFromPath("data.json")).toBe("json");
    expect(getLanguageFromPath("script.sh")).toBe("bash");
    expect(getLanguageFromPath("query.sql")).toBe("sql");
  });

  it("is case-insensitive", () => {
    expect(getLanguageFromPath("FOO.TS")).toBe("typescript");
    expect(getLanguageFromPath("bar.PY")).toBe("python");
  });

  it("returns empty for unknown extensions", () => {
    expect(getLanguageFromPath("file.xyz")).toBe("");
  });
});

describe("isImagePath", () => {
  it("returns false for undefined/empty", () => {
    expect(isImagePath(undefined)).toBe(false);
    expect(isImagePath("")).toBe(false);
  });

  it("returns false for no extension", () => {
    expect(isImagePath("screenshot")).toBe(false);
  });

  it("detects image extensions", () => {
    expect(isImagePath("photo.png")).toBe(true);
    expect(isImagePath("photo.jpg")).toBe(true);
    expect(isImagePath("photo.jpeg")).toBe(true);
    expect(isImagePath("anim.gif")).toBe(true);
    expect(isImagePath("icon.svg")).toBe(true);
    expect(isImagePath("image.webp")).toBe(true);
    expect(isImagePath("icon.ico")).toBe(true);
    expect(isImagePath("pic.avif")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isImagePath("PHOTO.PNG")).toBe(true);
    expect(isImagePath("IMG.JPG")).toBe(true);
  });

  it("rejects non-image extensions", () => {
    expect(isImagePath("file.ts")).toBe(false);
    expect(isImagePath("doc.pdf")).toBe(false);
  });
});

describe("extractOutputText", () => {
  it("returns empty for falsy input", () => {
    expect(extractOutputText(null)).toBe("");
    expect(extractOutputText(undefined)).toBe("");
    expect(extractOutputText("")).toBe("");
  });

  it("returns string as-is", () => {
    expect(extractOutputText("hello")).toBe("hello");
  });

  it("joins array of text objects", () => {
    const arr = [{ text: "line1" }, { text: "line2" }];
    expect(extractOutputText(arr)).toBe("line1\nline2");
  });

  it("handles mixed array with strings", () => {
    expect(extractOutputText(["a", { text: "b" }])).toBe("a\nb");
  });

  it("extracts .text from object", () => {
    expect(extractOutputText({ text: "result" })).toBe("result");
  });

  it("extracts .content string from object", () => {
    expect(extractOutputText({ content: "data" })).toBe("data");
  });

  it("handles .content array", () => {
    expect(extractOutputText({ content: [{ text: "nested" }] })).toBe(
      "nested",
    );
  });

  it("falls back to JSON.stringify for plain objects", () => {
    const result = extractOutputText({ key: "val" });
    expect(result).toContain('"key"');
    expect(result).toContain('"val"');
  });
});

describe("shortenPath", () => {
  it("returns empty for empty input", () => {
    expect(shortenPath("")).toBe("");
  });

  it("returns short paths unchanged", () => {
    expect(shortenPath("/a")).toBe("/a");
    expect(shortenPath("/a/b")).toBe("/a/b");
  });

  it("shortens long paths to last 2 segments", () => {
    expect(shortenPath("/Users/foo/projects/repo/src/file.ts")).toBe(
      "…/src/file.ts",
    );
  });

  it("handles 3-segment paths", () => {
    expect(shortenPath("/a/b/c")).toBe("…/b/c");
  });
});
