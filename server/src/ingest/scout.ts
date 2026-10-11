import type { AgentTool, Gemini } from './gemini';

export interface ScoutResult {
  url: string;
  text: string;
  reason: string;
}

export interface ScoutOptions {
  gemini: Gemini;
  /** The listing page the Scout starts from, and its text with event links in [brackets]. */
  listingUrl: string;
  listingText: string;
  fetchPage(url: string): Promise<string>;
  maxPages?: number;
  /** Called as the Scout opens each page, so the swarm panel can show its choices live. */
  onOpen?(url: string, reason: string): void;
}

/**
 * The Scout agent: reads a listing page and decides which event detail pages are worth opening,
 * using a tool to fetch them. Listings often leave out the room or exact time; detail pages have them.
 * It stays on the listing's own site and opens at most `maxPages` pages.
 */
export async function scout(opts: ScoutOptions): Promise<ScoutResult[]> {
  const maxPages = opts.maxPages ?? 4;
  const host = new URL(opts.listingUrl).hostname;
  const opened: ScoutResult[] = [];

  const openPage: AgentTool = {
    name: 'open_event_page',
    description: 'Fetch an event detail page from this site so the Reader can read it. Returns how much text it found.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL from the listing, shown in [brackets].' },
        reason: { type: 'string', description: 'Why this page is worth reading, in a few words.' },
      },
      required: ['url', 'reason'],
    },
    async run(args) {
      const url = String(args.url ?? '');
      const reason = String(args.reason ?? '');
      if (opened.length >= maxPages) return { error: `page limit reached (${maxPages}); stop now` };
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { error: 'not a valid URL' };
      }
      if (parsed.hostname !== host) return { error: `only pages on ${host} are allowed` };
      if (opened.some((o) => o.url === url)) return { error: 'already opened' };
      opts.onOpen?.(url, reason);
      const text = await opts.fetchPage(url);
      opened.push({ url, text, reason });
      return { ok: true, characters: text.length, pagesLeft: maxPages - opened.length };
    },
  };

  await opts.gemini.runTools({
    prompt: `You are the Scout in a team of agents that finds Rutgers campus events for a map of College Avenue.
Below is an event listing page from ${opts.listingUrl}. The Reader agent will read this listing either way.
Your job: open the detail pages that will help the Reader, using open_event_page. Prefer upcoming events that could be on College Avenue (Zimmerli, Alexander Library, the Student Center, Scott Hall, Voorhees, and similar) where the listing leaves out the time, building, or room. Skip events that are clearly online, on another campus, or already over.
You may open at most ${maxPages} pages; fewer is fine. When you are done, reply with the single word DONE.

--- Listing ---
${opts.listingText.slice(0, 20000)}`,
    tools: [openPage],
    maxSteps: maxPages + 2,
  });
  return opened;
}
