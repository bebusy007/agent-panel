/**
 * Pre-display text scrubbing for user-prompt previews.
 *
 * Different agent CLIs wrap the actual prompt in different XML-style
 * sentinels — Cursor uses <user_query>…</user_query>, Claude Code's
 * slash commands use <command-message>…</command-message><command-name>…
 * </command-name>, and various tools attach <local-command-stdout> /
 * <local-command-caveat> envelopes around real text.
 *
 * If we surface those tags raw in a TurnSidebar / SessionItem / page
 * header, every conversation in those sources looks identical ("<user_query>"
 * everywhere). This module returns the human-meaningful inner text so
 * previews are actually useful.
 *
 * Pure functions, no React, no DOM. Safe for both server (sessions-cache /
 * scanners) and client (turn-grouping, sidebar) consumers.
 */

/** Wrapper tags whose *contents* are the real prompt — strip the shell. */
const WRAPPER_TAGS = [
  "user_query",
  "user_message",
  "user_input",
  "query",
  "system_reminder",
  "system_notification",
] as const;

/** Strip wrapper tags. Tries the full `^<tag>…</tag>$` form first
 *  (cleanest when the whole prompt is wrapped), then falls back to
 *  shaving any leading `<tag>` and any trailing `</tag>` independently
 *  — important because server-side `truncate(text, 60)` often slices
 *  before the closing tag, leaving an unbalanced opener that the
 *  full-form regex can't match. */
function stripWrapper(text: string): string {
  let s = text.trim();
  // Pass 1: full balanced wrapper (preferred).
  for (const tag of WRAPPER_TAGS) {
    const re = new RegExp(`^<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>\\s*$`, "i");
    const m = s.match(re);
    if (m) s = m[1]!.trim();
  }
  // Pass 2: dangling opener / closer (truncated previews).
  for (const tag of WRAPPER_TAGS) {
    s = s.replace(new RegExp(`^<${tag}>\\s*`, "i"), "");
    s = s.replace(new RegExp(`\\s*<\\/${tag}>\\s*$`, "i"), "");
    // Also handle a closing tag with the trailing ellipsis truncation marker
    // we add server-side ("…</user_query>" never happens but "<user_query>…"
    // does — this catches it after wrapper strip).
  }
  return s.trim();
}

/** Claude Code slash-command envelopes:
 *    <command-message>foo</command-message>
 *    <command-name>/effort</command-name>
 *    <command-args>max</command-args>
 *  We collapse them into a friendlier "/<name> <args>" form so
 *  TurnSidebar shows "/effort max" instead of "<command-message>...". */
function collapseSlashCommand(text: string): string {
  const m = text.match(
    /<command-message>([^<]*)<\/command-message>\s*<command-name>([^<]*)<\/command-name>(?:\s*<command-args>([^<]*)<\/command-args>)?/i,
  );
  if (!m) return text;
  const name = m[2]?.trim() ?? "";
  const args = (m[3] ?? "").trim();
  const display = name ? `/${name.replace(/^\//, "")}` : "(slash command)";
  return args ? `${display} ${args}` : display;
}

/** `<local-command-stdout>...</local-command-stdout>` and friends —
 *  these wrap raw shell output that we'd rather skip past entirely.
 *  When the *whole* line is one of these envelopes, return what's
 *  inside it; otherwise just strip the tags and keep going. */
function stripLocalCommandEnvelopes(text: string): string {
  return text
    .replace(/<\/?local-command-(?:stdout|stderr|caveat)>/gi, "")
    .replace(/<\/?command-(?:message|name|args)>/gi, "")
    .trim();
}

/** Public: turn raw prompt text into a human-readable preview snippet.
 *  Strips wrapper tags + slash command envelopes, then collapses
 *  whitespace and (optionally) truncates. */
export function cleanupPromptPreview(raw: string | undefined, maxLen = 80): string {
  if (!raw) return "";
  let s = raw.trim();
  s = stripWrapper(s);
  s = collapseSlashCommand(s);
  s = stripLocalCommandEnvelopes(s);
  // Take the first non-empty line — the rest is usually elaboration.
  const firstLine = s.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  // Collapse runs of whitespace within that line.
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, maxLen) + "…";
}

/** Public: clean prompt text for *full* display (favorites detail,
 *  message body view) — same wrapper / envelope stripping as the
 *  preview helper but preserves line breaks and full content.
 *  Use this when the whole text is shown and only the surrounding
 *  XML-style scaffolding should disappear. */
export function cleanupPromptText(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.trim();
  s = stripWrapper(s);
  s = collapseSlashCommand(s);
  s = stripLocalCommandEnvelopes(s);
  return s.trim();
}
