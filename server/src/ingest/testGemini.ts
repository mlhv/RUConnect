import type { AgentTool, Gemini, GeminiRequest } from './gemini';

type Agent = 'reader' | 'critic' | 'deduper';
type Reply = string | ((req: GeminiRequest) => string);

/**
 * A scripted Gemini for tests. Each agent's prompt names its role, so replies are queued per agent.
 * An agent with an empty queue gets a harmless default: no events, an approving critique, no duplicate.
 * `scoutOpens` lists the URLs the Scout "decides" to open, with a reason each.
 */
export function scriptedGemini(script: Partial<Record<Agent, Reply[]>> & { scoutOpens?: string[] } = {}) {
  const calls: { agent: Agent | 'scout'; prompt: string }[] = [];
  const defaults: Record<Agent, string> = {
    reader: '{"events":[]}',
    critic: '{"reviews":[],"missed":[]}',
    deduper: '{"sameAsId":null,"reason":"different"}',
  };
  const gemini: Gemini = {
    async generateJson(req) {
      const agent: Agent = req.prompt.includes('You are the Critic') ? 'critic' : req.prompt.includes('You are the Deduper') ? 'deduper' : 'reader';
      calls.push({ agent, prompt: req.prompt });
      const next = script[agent]?.shift();
      return next === undefined ? defaults[agent] : typeof next === 'function' ? next(req) : next;
    },
    async runTools({ prompt, tools }: { prompt: string; tools: AgentTool[] }) {
      calls.push({ agent: 'scout', prompt });
      for (const url of script.scoutOpens ?? []) await tools[0].run({ url, reason: 'listing has no room' });
      return 'DONE';
    },
  };
  return { gemini, calls, count: (agent: Agent | 'scout') => calls.filter((c) => c.agent === agent).length };
}

export const draft = (over: Record<string, unknown> = {}) => ({
  title: 'Highlights Tour', description: '', category: 'arts', campus: 'college_ave', buildingId: 'voorhees-hall',
  locationText: null, room: null, start: '2026-10-11T14:00:00-04:00', end: null, expectedAttendance: null, tags: [],
  freeFood: false, confidence: { title: 0.9, time: 0.9, location: 0.9 }, ...over,
});

export const events = (...drafts: Record<string, unknown>[]) => JSON.stringify({ events: drafts });
