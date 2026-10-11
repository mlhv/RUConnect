import { chunkText, htmlToText } from './html';

/**
 * Public Rutgers event pages that allow crawlers (robots.txt does not block /events) and list events in plain HTML.
 * newbrunswick.rutgers.edu/events and masongross.rutgers.edu are behind a bot check, so they are left out on purpose.
 */
export const SITES = [
  'https://zimmerli.rutgers.edu/events',
  'https://www.libraries.rutgers.edu/events',
  'https://www.rutgers.edu/events',
  'https://recreation.rutgers.edu/events',
  'https://careers.rutgers.edu/events',
  // honorscollege, success, and scarletfirst .rutgers.edu/events load their listings with JavaScript, so a plain
  // fetch finds no events there (checked Oct 10). Add them back if they start serving listings as HTML.
];

const USER_AGENT = 'RUConnect/0.1 (HackRU student project; campus events map)';
const TIMEOUT_MS = 15000;

export interface SitePage {
  url: string;
  /** The page as text, split so each piece fits one model call. */
  chunks: string[];
}

/** Listing pages after the first. These are Drupal sites, which page with ?page=N. */
const EXTRA_PAGES = 2;

/** Fetches one page as text. Used for listings and by the Scout's open_event_page tool. */
export async function fetchPage(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return htmlToText(await res.text(), res.url || url);
}

/**
 * Fetches a site's listing and up to two more pages of it. Throws when the first page fails so the swarm marks
 * the site failed and moves on; later pages that fail or repeat the first are ignored.
 */
export async function fetchSite(url: string, fetchImpl: typeof fetch = fetch): Promise<SitePage> {
  const first = await fetchPage(url, fetchImpl);
  const texts = [first];
  for (let page = 1; page <= EXTRA_PAGES; page++) {
    const next = await fetchPage(`${url}?page=${page}`, fetchImpl).catch(() => null);
    if (!next || texts.includes(next)) break;
    texts.push(next);
  }
  return { url, chunks: texts.flatMap((t) => chunkText(t)) };
}
