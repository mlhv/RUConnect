const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/**
 * Reduces a page to readable text with line breaks between blocks, so the model sees one listing per few lines.
 * Links that look like event pages keep their URL in brackets.
 */
export function htmlToText(html: string, baseUrl: string): string {
  let s = html
    .replace(/<(script|style|noscript|svg|head|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, ' ');

  s = s.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    if (!/event/i.test(href)) return inner;
    try {
      return `${inner} [${new URL(decodeEntities(href), baseUrl).href}]`;
    } catch {
      return inner;
    }
  });

  s = s
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|article|section|time|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(s)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Splits text on line boundaries into chunks of at most `max` characters. */
export function chunkText(text: string, max = 15000): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > max) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}\n${line.slice(0, max)}` : line.slice(0, max);
  }
  if (current) chunks.push(current);
  return chunks;
}
