import { describe, expect, it } from 'vitest';
import { TOOL_ARG_SCHEMAS } from '../toolSchemas';
import toolDefs from './tools.json';

/** tools.json is what the owner types into the ElevenLabs dashboard. It must match what the client registers. */
describe('agent tool contract', () => {
  it('defines exactly the tools the client registers', () => {
    expect(toolDefs.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_ARG_SCHEMAS).sort());
  });

  it.each(toolDefs)('$name has the same parameters and required flags as its schema', (tool) => {
    const shape = TOOL_ARG_SCHEMAS[tool.name as keyof typeof TOOL_ARG_SCHEMAS].shape as Record<
      string, { safeParse(v: unknown): { success: boolean } }
    >;
    expect(tool.parameters.map((p) => p.name).sort()).toEqual(Object.keys(shape).sort());
    for (const p of tool.parameters) {
      expect(!shape[p.name].safeParse(undefined).success, `${tool.name}.${p.name} required`).toBe(p.required);
    }
  });

  it('makes every tool wait for its response', () => {
    expect(toolDefs.every((t) => t.waitForResponse)).toBe(true);
  });
});
