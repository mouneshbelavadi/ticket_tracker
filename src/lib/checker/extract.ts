import * as cheerio from "cheerio";

/**
 * Extracts normalized, lowercase visible text from an HTML document or sub-selector.
 * Strips script, style, noscript, svg, and iframe tags to focus purely on visible human text.
 */
export function extractText(html: string, selector?: string | null): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const $ = cheerio.load(html);

  // Remove elements that don't represent visible body content
  $("script, style, noscript, svg, iframe").remove();

  let rawText = "";
  if (selector && selector.trim()) {
    const selected = $(selector.trim());
    if (selected.length > 0) {
      rawText = selected.text();
    }
  }

  if (!rawText) {
    rawText = $("body").text();
  }

  // Collapse consecutive whitespaces and normalize to lowercase
  return rawText.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Detects whether an HTML page appears to be a client-rendered "JS shell" (SPA)
 * where the initial HTML contains very little readable text (< 500 chars).
 */
export function isJsShell(html: string): boolean {
  const visibleText = extractText(html);
  return visibleText.length < 500;
}
