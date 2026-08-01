export function countMarkdownWords(markdown: string): number {
  return markdown
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_>`~\[\]()-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
