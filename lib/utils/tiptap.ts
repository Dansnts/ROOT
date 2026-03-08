/**
 * Shared TipTap utilities used across services and stores.
 */

/** Recursively extracts plain text from a TipTap/ProseMirror node. */
export function extractText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content))
    return (node.content as Record<string, unknown>[]).map(extractText).join("");
  return "";
}
