// LinkedIn's composer strips markdown and has no real bold/italic. The common
// workaround is Unicode math-alphanumeric characters that *look* bold/italic.
// This converts **bold** and *italic* markdown into those, and tidies spacing.

const BOLD_OFFSET_UPPER = 0x1d400 - 0x41; // 𝐀
const BOLD_OFFSET_LOWER = 0x1d41a - 0x61; // 𝐚
const ITAL_OFFSET_UPPER = 0x1d434 - 0x41; // 𝐴
const ITAL_OFFSET_LOWER = 0x1d44e - 0x61; // 𝑎

function mapChars(text: string, upper: number, lower: number): string {
  return [...text]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (c >= 0x41 && c <= 0x5a) return String.fromCodePoint(c + upper);
      if (c >= 0x61 && c <= 0x7a) return String.fromCodePoint(c + lower);
      return ch;
    })
    .join("");
}

export function markdownToLinkedIn(md: string): string {
  let out = md;
  // Strip a leading H1 (LinkedIn posts have no title).
  out = out.replace(/^#\s+.*$/m, "").trimStart();
  // Bold then italic (order matters so ** isn't caught by *).
  out = out.replace(/\*\*(.+?)\*\*/g, (_, t) =>
    mapChars(t, BOLD_OFFSET_UPPER, BOLD_OFFSET_LOWER)
  );
  out = out.replace(/\*(.+?)\*/g, (_, t) =>
    mapChars(t, ITAL_OFFSET_UPPER, ITAL_OFFSET_LOWER)
  );
  // Turn markdown bullets into a bullet glyph LinkedIn keeps.
  out = out.replace(/^\s*[-*]\s+/gm, "• ");
  // Strip inline code backticks (LinkedIn shows them literally).
  out = out.replace(/`([^`]+)`/g, "$1");
  // Collapse 3+ blank lines to a single blank line.
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export interface LintResult {
  ok: boolean;
  charCount: number;
  warnings: string[];
}

// LinkedIn post hard limit is 3000 characters; ~210 chars show before "…more".
export function lintPost(text: string): LintResult {
  const warnings: string[] = [];
  const charCount = [...text].length;
  if (charCount > 3000)
    warnings.push(`Over the 3000-char limit (${charCount}). Will be rejected.`);
  if (charCount < 3)
    warnings.push("Post looks empty.");
  const firstLine = text.split("\n")[0] ?? "";
  if (firstLine.length > 210)
    warnings.push(
      "First line is long; the hook may get cut off before '…more'."
    );
  if (!/#\w+/.test(text))
    warnings.push("No hashtags found — consider 3-5 for reach.");
  return { ok: warnings.length === 0, charCount, warnings };
}
