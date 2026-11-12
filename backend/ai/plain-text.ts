/** The feedback goes to the student as plain text: drop Markdown the model may still add. */
export function plainText(text: string) {
  // [ \t] rather than \s at line starts: \s would also eat the blank line between paragraphs.
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')               // headings
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '')   // horizontal rules
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '')        // bullets and numbered items
    .replace(/(\*\*|__)(.+?)\1/g, '$2')                     // bold
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?![\w*])/g, '$1$2') // italic
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
