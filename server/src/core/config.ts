import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface Config {
  port: number;
  mock: boolean;
  databaseUrl: string | null;
  dbSchema: string;
  demoNow: string | null;
  swarmConcurrency: number;
  geminiApiKey: string | null;
  geminiVisionModel: string | null;
  geminiEmbedModel: string | null;
  elevenLabsApiKey: string | null;
  elevenLabsAgentId: string | null;
}

// DB_SCHEMA is interpolated into SQL identifiers, so it is restricted to a safe alphabet.
const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Loads the repo-root .env if present. Real environment variables win. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(resolve(REPO_ROOT, '.env'));
  } catch {
    // No .env file: rely on the process environment (CI, production).
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbSchema = env.DB_SCHEMA || 'dev_local';
  if (!SCHEMA_RE.test(dbSchema)) {
    throw new Error(`DB_SCHEMA must be lowercase letters, digits, and underscores (got "${dbSchema}")`);
  }
  const mock = env.MOCK === '1';
  const databaseUrl = env.DATABASE_URL || null;
  if (!mock && !databaseUrl) throw new Error('DATABASE_URL is required unless MOCK=1');
  const demoNow = env.DEMO_NOW || null;
  if (demoNow && Number.isNaN(Date.parse(demoNow))) throw new Error('DEMO_NOW must be an ISO 8601 datetime');
  return {
    port: Number(env.PORT) || 3001,
    mock,
    databaseUrl,
    dbSchema,
    demoNow: demoNow ? new Date(demoNow).toISOString() : null,
    swarmConcurrency: Number(env.SWARM_CONCURRENCY) || 4,
    geminiApiKey: env.GEMINI_API_KEY || null,
    geminiVisionModel: env.GEMINI_VISION_MODEL || null,
    geminiEmbedModel: env.GEMINI_EMBED_MODEL || null,
    elevenLabsApiKey: env.ELEVENLABS_API_KEY || null,
    elevenLabsAgentId: env.ELEVENLABS_AGENT_ID || null,
  };
}
