import { supabase } from './supabase';

const SUPABASE_URL = 'https://pwphrlbpwxytswdaglem.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cGhybGJwd3h5dHN3ZGFnbGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMDg5MjQsImV4cCI6MjA5NDU4NDkyNH0.c4XSqAU8tDvAi8_9n2OuqPR0j2Ptjo_yMOOTDikhqrc';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-service`;

// ── Request queue ─────────────────────────────────────────────────────────────
// Serialise ALL AI requests so they never fire simultaneously.
// This is the primary defence against Gemini 503 rate-limit errors.

let _active = 0;
const _queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (_active < 1) {
    _active++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => _queue.push(resolve));
}

function releaseSlot(): void {
  const next = _queue.shift();
  if (next) {
    next(); // hands the slot directly to the next waiter
  } else {
    _active--;
  }
}

// ── Retry with exponential backoff ────────────────────────────────────────────
// Retries automatically on transient 503/429 errors.

// Only retry on transient server-busy errors (503/overload).
// NEVER retry on 429 — it makes rate limiting worse.
const RETRY_DELAYS = [5000, 15000]; // 5 s, then 15 s — only for 503s

function isRetryable(msg: string): boolean {
  // 429 is explicitly excluded: retrying only burns more quota
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return false;
  }
  return (
    msg.includes('503') ||
    msg.includes('busy') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overload')
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_DELAYS.length && isRetryable(msg)) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ── Friendly error parser ─────────────────────────────────────────────────────

function parseErrorMessage(status: number, body: string): string {
  if (status === 429) return 'AI is busy right now — please wait a moment and try again.';
  if (status === 503) return 'AI service is under high demand — retrying…';
  try {
    const data = JSON.parse(body) as { error?: string };
    if (typeof data.error === 'string') {
      const raw = data.error;
      if (raw.includes('503') || raw.includes('high demand') || raw.includes('UNAVAILABLE')) {
        return 'AI service is under high demand. Please try again in a moment.';
      }
      if (raw.includes('429') || raw.includes('quota') || raw.includes('RESOURCE_EXHAUSTED')) {
        return 'AI rate limit reached. Please wait a moment before retrying.';
      }
      const firstLine = raw.split('\n')[0].replace(/[{}"\\]/g, '').trim();
      if (firstLine.length > 5) return firstLine.slice(0, 120);
    }
  } catch {
    // ignore parse errors
  }
  return `AI service error (${status}). Please try again.`;
}

// ── Core invoker ──────────────────────────────────────────────────────────────

async function invokeAI<T = unknown>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  return withRetry(async () => {
    await acquireSlot();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? SUPABASE_ANON_KEY;
      const userId = session?.user?.id;

      // Abort the request if it hangs for more than 50 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50_000);

      let res: Response;
      try {
        res = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action, ...(payload ?? {}), ...(userId ? { userId } : {}) }),
          signal: controller.signal,
        });
      } catch (networkErr) {
        const isAbort = networkErr instanceof Error && networkErr.name === 'AbortError';
        const msg = isAbort
          ? 'Request timed out — the AI took too long to respond. Please try again.'
          : 'Network error — check your connection and try again.';
        throw new Error(msg);
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await res.text();

      if (!res.ok) {
        const msg = parseErrorMessage(res.status, text);
        console.error(`[aiService] ${action} ${res.status}:`, text.slice(0, 200));
        throw new Error(msg);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        console.error('[aiService] Bad JSON from', action, text.slice(0, 200));
        throw new Error('Unexpected response from AI service. Please try again.');
      }
    } finally {
      releaseSlot();
    }
  });
}

// ===== TYPE DEFINITIONS =====
interface TextOnlyResponse {
  reply: string;
  model: string;
  isComplete: boolean;
  error?: string;
}

interface HybridResponse {
  reply?: string;
  embedding?: number[];
  text_model?: string;
  embedding_model?: string;
  status: 'full' | 'text_only' | 'embedding_only' | 'failed';
  errors?: Record<string, string>;
}

interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  error?: string;
}

interface SimilarityResult {
  text: string;
  similarity: number;
  error: null | string;
}

interface SimilaritySearchResponse {
  query: string;
  query_model: string;
  results: SimilarityResult[];
  total_candidates: number;
  successfully_scored: number;
  error?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const aiService = {
  // ===== NEW HYBRID & EMBEDDING FUNCTIONS =====

  /**
   * Simple text chat with automatic fallback to gemini-1.5-flash if gemini-2.5-flash fails
   */
  chatWithFallback: async (userMessage: string): Promise<TextOnlyResponse> => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-service', {
        body: {
          action: 'profile-chat',
          message: userMessage,
        },
      });

      if (error) throw new Error(`Edge Function error: ${error.message}`);
      if (data?.error) throw new Error(data.error);

      console.log('[Career Campus AI] Response received from', data?.model);
      return {
        reply: data.reply || '',
        model: data.model || 'unknown',
        isComplete: data.isComplete ?? true,
      };
    } catch (err: any) {
      console.error('[Career Campus AI] Error:', err.message);
      throw err;
    }
  },

  /**
   * Advanced chat that returns both text response AND embeddings
   * Perfect for getting AI advice while also computing semantic similarity
   */
  hybridChat: async (userMessage: string): Promise<HybridResponse> => {
    try {
      console.log('[Career Campus AI] Calling hybrid-chat action...');
      const { data, error } = await supabase.functions.invoke('ai-service', {
        body: {
          action: 'hybrid-chat',
          message: userMessage,
        },
      });

      if (error) {
        console.error('[Career Campus AI] Hybrid chat error:', error.message);
        return {
          status: 'failed',
          errors: { network: error.message },
        };
      }

      console.log('[Career Campus AI] Hybrid response status:', data?.status);
      return (data as HybridResponse) || { status: 'failed', errors: { unknown: 'No data' } };
    } catch (err: any) {
      console.error('[Career Campus AI] Hybrid chat exception:', err.message);
      return {
        status: 'failed',
        errors: { exception: err.message },
      };
    }
  },

  /**
   * Get semantic embedding for text without generating a response
   * Perfect for pre-computing embeddings for job descriptions or building vector databases
   */
  getEmbedding: async (text: string): Promise<EmbeddingResponse> => {
    try {
      console.log('[Career Campus AI] Computing embedding...');
      const { data, error } = await supabase.functions.invoke('ai-service', {
        body: {
          action: 'embed',
          text,
        },
      });

      if (error) throw new Error(`Embedding error: ${error.message}`);
      if (data?.error) throw new Error(data.error);

      console.log('[Career Campus AI] Embedding computed with', data?.model);
      return {
        embedding: data.embedding || [],
        model: data.model || 'unknown',
        dimensions: data.dimensions || 0,
      };
    } catch (err: any) {
      console.error('[Career Campus AI] Embedding error:', err.message);
      throw err;
    }
  },

  /**
   * Find the most similar items from a list of candidates using semantic similarity
   * Uses cosine similarity on embeddings
   */
  similaritySearch: async (
    query: string,
    candidates: string[]
  ): Promise<SimilaritySearchResponse> => {
    try {
      console.log('[Career Campus AI] Running similarity search...');
      console.log('[Career Campus AI] Candidates:', candidates.length);

      const { data, error } = await supabase.functions.invoke('ai-service', {
        body: {
          action: 'similarity-search',
          query,
          candidates,
        },
      });

      if (error) throw new Error(`Similarity search error: ${error.message}`);
      if (data?.error) throw new Error(data.error);

      console.log('[Career Campus AI] Similarity search results:', data?.results?.length);
      return (data as SimilaritySearchResponse) || {
        query,
        query_model: 'unknown',
        results: [],
        total_candidates: 0,
        successfully_scored: 0,
      };
    } catch (err: any) {
      console.error('[Career Campus AI] Similarity search error:', err.message);
      throw err;
    }
  },

  /**
   * Chat with graceful fallback - handles different failure scenarios
   */
  chatWithGracefulFallback: async (userMessage: string) => {
    try {
      const response = await aiService.hybridChat(userMessage);

      switch (response.status) {
        case 'full':
          return {
            message: response.reply,
            hasEmbedding: true,
            canRecommend: true,
            icon: '✨',
          };
        case 'text_only':
          return {
            message: response.reply,
            hasEmbedding: false,
            canRecommend: false,
            icon: '💬',
            warning: 'Recommendations temporarily unavailable',
          };
        case 'embedding_only':
          return {
            message:
              'Sorry, I had trouble generating a response, but I can still find similar content for you.',
            hasEmbedding: true,
            canRecommend: true,
            icon: '🔍',
            error: response.errors?.text_generation,
          };
        case 'failed':
          return {
            message:
              'I apologize, but I encountered an issue. Please check your connection and try again.',
            hasEmbedding: false,
            canRecommend: false,
            icon: '❌',
            error: Object.entries(response.errors || {})
              .map(([k, v]) => `${k}: ${v}`)
              .join('; '),
          };
      }
    } catch (err: any) {
      return {
        message: 'An unexpected error occurred. Please try again.',
        hasEmbedding: false,
        canRecommend: false,
        icon: '⚠️',
        error: err.message,
      };
    }
  },

  // ===== EXISTING FUNCTIONS (BACKWARDS COMPATIBLE) =====

  profileChat: (payload: Record<string, unknown>) => {
    const messages = (payload.messages as Array<{ role: string; content: string }> | undefined) ?? [];
    const message =
      (payload.message as string | undefined) ??
      [...messages].reverse().find((m) => m.role === 'user')?.content ??
      messages[messages.length - 1]?.content;

    return invokeAI<{
      reply: string;
      isComplete: boolean;
      profileData?: Record<string, unknown>;
      partialProfile?: Record<string, unknown>;
    }>('profile-chat', {
      ...payload,
      ...(message ? { message } : {}),
    });
  },

  discoverCompanies: (payload: Record<string, unknown>) =>
    invokeAI<unknown[]>('discover-companies', payload),

  draftLetter: (payload: Record<string, unknown>) =>
    invokeAI<{ letter: string }>('draft-letter', payload),

  researchCompany: (payload: Record<string, unknown>) =>
    invokeAI<{ summary: string }>('research-company', payload),

  starFeedback: (payload: Record<string, unknown>) =>
    invokeAI<{ feedback: string }>('star-feedback', payload),

  interviewQuestions: (payload: Record<string, unknown>) =>
    invokeAI<{ personal: string[]; company: string[]; experience: string[] }>(
      'interview-questions',
      payload,
    ),

  parseProfileFromCv: (payload: Record<string, unknown>) =>
    invokeAI<Record<string, unknown>>('parse-profile-from-cv', payload),

  networkingEvents: (payload: Record<string, unknown>) =>
    invokeAI<unknown[]>('networking-events', payload),

  interviewVerdict: (payload: Record<string, unknown>) =>
    invokeAI<Record<string, unknown>>('interview-verdict', payload),

  extractContent: (payload: {
    fileContent: string;
    contentType: string;
    category: string;
  }) => invokeAI<{ extractedText: string }>('extract-content', payload),
};

// ===== EXPORT TYPES =====
export type {
  TextOnlyResponse,
  HybridResponse,
  EmbeddingResponse,
  SimilaritySearchResponse,
};
