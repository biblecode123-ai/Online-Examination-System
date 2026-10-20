/**
 * Dependency-free HTML sanitiser for teacher-authored content (exam
 * instructions, section instructions and shared material).
 *
 * The content is authored in the CMS rich-text editor and stored as HTML, so
 * the student application has to render it as markup — but never as a script.
 * Only a small allow-list of formatting tags survives; everything else is
 * dropped, together with event handlers and javascript: URLs.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code', 'span', 'div',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'a', 'img',
]);

/** Tags whose content is removed as well (script/style/iframe/...). */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'form',
  'noscript', 'template', 'svg', 'math', 'base', 'link', 'meta',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  td: new Set(['colspan', 'rowspan']),
  ol: new Set(['start']),
  span: new Set(['class']),
  div: new Set(['class']),
  p: new Set(['class']),
};

const SAFE_URL = /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i;
const SAFE_IMAGE_URL = /^(https?:|\/|\.\/|\.\.\/|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,)/i;

function isSafeUrl(value: string, tag: string): boolean {
  const url = value.trim();
  if (tag === 'img') return SAFE_IMAGE_URL.test(url);
  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return true;
  }
  return SAFE_URL.test(url);
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Removes the tags that must disappear together with their content. */
function stripDangerousBlocks(html: string): string {
  let output = html;

  for (const tag of DROP_WITH_CONTENT) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    output = output.replace(paired, '');
    const orphan = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    output = output.replace(orphan, '');
  }

  return output.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
}

function sanitiseAttributes(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRIBUTES[tag];
  if (!allowed) return '';

  const attributes: string[] = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';

    // Event handlers and style attributes never survive.
    if (name.startsWith('on')) continue;
    if (name === 'style') continue;
    if (!allowed.has(name)) continue;
    if ((name === 'href' || name === 'src') && !isSafeUrl(value, tag)) continue;

    attributes.push(`${name}="${escapeAttribute(value)}"`);
  }

  return attributes.length ? ` ${attributes.join(' ')}` : '';
}

/**
 * Returns a safe HTML string for the given teacher-authored markup.
 * When the value is not markup at all it is returned as escaped text.
 */
export function sanitizeHtml(value: string | null | undefined): string {
  if (!value) return '';
  const input = String(value);
  if (!input.includes('<')) return escapeText(input);

  const cleaned = stripDangerousBlocks(input);
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(cleaned)) !== null) {
    result += escapeText(cleaned.slice(lastIndex, match.index));
    lastIndex = tagPattern.lastIndex;

    const tag = match[1].toLowerCase();
    const isClosing = match[0].startsWith('</');
    const rawAttributes = match[2] ?? '';

    if (!ALLOWED_TAGS.has(tag)) continue;

    if (isClosing) {
      result += `</${tag}>`;
      continue;
    }

    if (VOID_TAGS.has(tag)) {
      result += `<${tag}${sanitiseAttributes(tag, rawAttributes)} />`;
      continue;
    }

    result += `<${tag}${sanitiseAttributes(tag, rawAttributes)}>`;
  }

  result += escapeText(cleaned.slice(lastIndex));

  return result;
}

/** Plain-text version of teacher-authored markup (used for lists and titles). */
export function htmlToText(value: string | null | undefined): string {
  if (!value) return '';
  return sanitizeHtml(value)
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
