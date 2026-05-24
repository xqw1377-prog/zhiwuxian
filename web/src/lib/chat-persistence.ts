import type { ChatMessage, ReplyMode } from '../context/ZhiChatContext';

const MAX_MESSAGES = 50;

export type ChatPersistedState = {
  messages: ChatMessage[];
  replyMode: ReplyMode;
  savedAt: number;
};

function storageKey(userId: string): string {
  return `wuxian_chat_v1_${userId}`;
}

export function loadChatState(userId: string): ChatPersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatPersistedState;
    if (!Array.isArray(parsed.messages)) return null;
    return {
      messages: parsed.messages.slice(-MAX_MESSAGES),
      replyMode: parsed.replyMode === 'deep' ? 'deep' : 'fast',
      savedAt: parsed.savedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function saveChatState(userId: string, messages: ChatMessage[], replyMode: ReplyMode): void {
  try {
    const payload: ChatPersistedState = {
      messages: messages.slice(-MAX_MESSAGES),
      replyMode,
      savedAt: Date.now(),
    };
    localStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clearChatState(userId: string): void {
  localStorage.removeItem(storageKey(userId));
}
