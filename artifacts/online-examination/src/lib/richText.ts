/**
 * Dependency-free rich-text rendering for teacher-authored content that is
 * stored as plain text (reading passages).
 *
 * Teachers write a small, predictable markdown subset — headings, bold/italic,
 * links, images, bullet/numbered lists, quotes, fenced code and pipe tables —
 * so a passage can carry the data a question refers to (a table of values, a
 * schedule, a diagram caption) without the CMS shipping an editor library.
 *
 * Safety: every line is HTML-escaped before any markup is generated, then the
 * result goes through the same allow-list sanitizer used for exam
 * instructions (`sanitizeHtml`), so authored content can never inject script.
 * Content that already contains HTML tags (CMS-authored instructions/shared
 * material) skips the markdown pass and is sanitised directly.
 */
import { sanitizeHtml } from './sanitize';

const HTML_LIKE = /<[a-z][^>]*>/i;

/** A row like `| a | b |` or `a | b`, with a `| --- | --- |` separator after it. */
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markup: `code`, **bold**, *italic*, [link](https://…), ![alt](https://…). */
function renderInline(escaped: string): string {
  return escaped
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

function renderTableRow(row: string, header: boolean): string {
  const tag = header ? 'th' : 'td';
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => `<${tag}>${renderInline(escapeHtml(cell.trim()))}</${tag}>`)
    .join('');
}

/** Convert the markdown-lite subset to HTML. Output is sanitised by the caller. */
function markdownToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let i = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${paragraph.map((line) => renderInline(escapeHtml(line))).join('<br />')}</p>`);
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence (or stop at EOF)
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Pipe table: header row followed by a `| --- |` separator row
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      flushParagraph();
      const header = renderTableRow(line, true);
      const body: string[] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        body.push(`<tr>${renderTableRow(lines[i], false)}</tr>`);
        i++;
      }
      out.push(
        `<table><thead><tr>${header}</tr></thead><tbody>${body.join('')}</tbody></table>`,
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, heading[1].length);
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2].trim()))}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      out.push('<hr />');
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(
        `<blockquote><p>${body.map((l) => renderInline(escapeHtml(l))).join('<br />')}</p></blockquote>`,
      );
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(escapeHtml(lines[i].replace(/^\s*[-*+]\s+/, '')))}</li>`,
        );
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Numbered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(escapeHtml(lines[i].replace(/^\s*\d+[.)]\s+/, '')))}</li>`,
        );
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Blank line closes the paragraph
    if (!line.trim()) {
      flushParagraph();
      i++;
      continue;
    }

    paragraph.push(line);
    i++;
  }

  flushParagraph();
  return out.join('\n');
}

/**
 * Render teacher-authored text to sanitised HTML for `dangerouslySetInnerHTML`.
 * Returns '' for empty content, so callers can guard with a plain truthiness check.
 */
export function renderRichText(source: string | null | undefined): string {
  const text = (source ?? '').trim();
  if (!text) return '';
  const html = HTML_LIKE.test(text) ? text : markdownToHtml(text);
  return sanitizeHtml(html);
}
