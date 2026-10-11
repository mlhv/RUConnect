export interface Line {
  id: number;
  role: 'user' | 'agent' | 'tool' | 'system';
  text: string;
}

export type TranscriptAction = { type: 'add'; role: Line['role']; text: string } | { type: 'clear' };

const MAX_LINES = 50;

/** Expressive voice models write delivery cues such as "[excited]" into the agent's text. Lowercase only, so "[CANCELLED]" in a title stays. */
const DELIVERY_TAG = /\[[a-z][a-z ]{0,30}\]\s*/g;

/** The conversation as shown in the panel. Drops blanks, an immediate repeat (an echoed typed message), and the agent's delivery tags. */
export function transcriptReducer(state: Line[], action: TranscriptAction): Line[] {
  if (action.type === 'clear') return [];
  const text = (action.role === 'agent' ? action.text.replace(DELIVERY_TAG, '') : action.text).trim();
  if (!text) return state;
  const last = state[state.length - 1];
  if (last && last.role === action.role && last.text === text) return state;
  return [...state, { id: (last?.id ?? 0) + 1, role: action.role, text }].slice(-MAX_LINES);
}
