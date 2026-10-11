export interface Line {
  id: number;
  role: 'user' | 'agent' | 'tool' | 'system';
  text: string;
}

export type TranscriptAction = { type: 'add'; role: Line['role']; text: string } | { type: 'clear' };

const MAX_LINES = 50;

/** The conversation as shown in the panel. Drops blanks and an immediate repeat (an echoed typed message). */
export function transcriptReducer(state: Line[], action: TranscriptAction): Line[] {
  if (action.type === 'clear') return [];
  const text = action.text.trim();
  if (!text) return state;
  const last = state[state.length - 1];
  if (last && last.role === action.role && last.text === text) return state;
  return [...state, { id: (last?.id ?? 0) + 1, role: action.role, text }].slice(-MAX_LINES);
}
