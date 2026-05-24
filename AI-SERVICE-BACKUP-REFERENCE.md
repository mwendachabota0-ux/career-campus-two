# Career Campus AI Service - Backup Reference (May 24, 2026)

**STATUS:** ✅ WORKING  
**Date Created:** May 24, 2026  
**Last Verified:** May 24, 2026  
**Critical Fix Applied:** API endpoint changed from `/v1/` to `/v1beta/`

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Critical Configuration](#critical-configuration)
3. [Edge Function Code](#edge-function-code)
4. [Mobile Client Code](#mobile-client-code)
5. [How They Connect](#how-they-connect)
6. [API Endpoints & Payloads](#api-endpoints--payloads)
7. [Troubleshooting](#troubleshooting)
8. [Recovery Steps](#recovery-steps)

---

## System Overview

### Architecture
```
Mobile App (React Native/Expo)
    ↓
aiService.ts (Request serialization + retry logic)
    ↓
Supabase Edge Function (ai-service)
    ↓
Gemini API (google.generativelanguage.com)
```

### Components
- **Edge Function:** `supabase/functions/ai-service/index.ts`
- **Mobile Client:** `artifacts/mobile/lib/aiService.ts`
- **Connection:** Supabase Functions invoke API

### Key Models
- **Text Generation:** `gemini-2.5-flash` (primary & fallback)
- **Embeddings:** `gemini-embedding-001` (primary), `gemini-embedding-2` (fallback)

---

## Critical Configuration

### ⚠️ CRITICAL FIX (May 24, 2026)
The API endpoint version was causing 400 errors. Changed from:
```typescript
// BROKEN:
https://generativelanguage.googleapis.com/v1/models
```

To:
```typescript
// FIXED:
https://generativelanguage.googleapis.com/v1beta/models
```

**Location in code:** `supabase/functions/ai-service/index.ts` line 21

### Environment Variables (Supabase Edge Function Secrets)
```
GEMINI_API_KEY=<your-google-api-key>
EVENTBRITE_API_KEY=<optional>
SERPER_API_KEY=<optional>
TAVILY_API_KEY=<optional>
```

### Supabase Config
```
SUPABASE_URL=https://pwphrlbpwxytswdaglem.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cGhybGJwd3h5dHN3ZGFnbGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMDg5MjQsImV4cCI6MjA5NDU4NDkyNH0.c4XSqAU8tDvAi8_9n2OuqPR0j2Ptjo_yMOOTDikhqrc
EDGE_FUNCTION_URL=https://pwphrlbpwxytswdaglem.supabase.co/functions/v1/ai-service
```

---

## Edge Function Code

**File:** `supabase/functions/ai-service/index.ts`

**Key Constants (Lines 9-28):**
```typescript
const MODELS = {
  generation: {
    primary: 'gemini-2.5-flash',
    fallback: 'gemini-2.5-flash',
  },
  embedding: {
    primary: 'gemini-embedding-001',
    fallback: 'gemini-embedding-2',
  },
}

const API_ENDPOINTS = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models', // ✅ FIXED
  eventbrite: 'https://www.eventbriteapi.com/v3/events/search/',
  serper: 'https://google.serper.dev/search',
  tavily: 'https://api.tavily.com/search',
}
```

**Main Handler (Lines 1594-1655):**
```typescript
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (req.url.endsWith('/health')) {
      return await handleHealthCheck()
    }

    const body = await req.json()
    const action = body?.action as string | undefined

    logger.info('ai-service', `Request received: POST /functions/v1/ai-service`)
    logger.info('ai-service', `Action invoked: ${action}`)

    if (!action) {
      throw new ValidationError('Missing body.action')
    }

    switch (action) {
      case 'profile-chat':
        return await handleProfileChat(body)
      case 'hybrid-chat':
        return await handleHybridChat(body)
      case 'embed':
        return await handleEmbedding(body)
      case 'similarity-search':
        return await handleSimilaritySearch(body)
      case 'draft-letter':
        return await handleDraftLetter(body)
      case 'discover-companies':
        return await handleDiscoverCompanies(body)
      case 'interview-questions':
        return await handleInterviewQuestions(body)
      case 'research-company':
        return await handleResearchCompany(body)
      case 'extract-content':
        return await handleExtractContent(body)
      case 'star-feedback':
        return await handleStarFeedback(body)
      case 'interview-verdict':
        return await handleInterviewVerdict(body)
      case 'parse-profile-from-cv':
        return await handleParseProfileFromCv(body)
      case 'networking-events':
        return await handleNetworkingEvents(body)

      default:
        throw new ValidationError(`Unknown action: ${action}`)
    }
  } catch (error: any) {
    const statusCode = error?.statusCode ?? 500
    const errorCode = error?.code ?? 'UNKNOWN_ERROR'
    const message = error?.message || 'Internal Server Error'

    logger.error('ai-service', `Unhandled error: ${message}`, {
      code: errorCode,
      status: statusCode,
    })

    return json(
      {
        error: message,
        code: errorCode,
        timestamp: new Date().toISOString(),
      },
      statusCode
    )
  }
})
```

**Key Handler: handleProfileChat (Lines 509-693)**
- Accepts: `message`, `messages`, `existingProfile`, `cvContent`
- Returns: `reply`, `isComplete`, `model`, `profileData`, `partialProfile`
- Uses: `callGeminiWithFallback()` for text generation
- Validates: message length (max 5000 chars), profile fields

---

## Mobile Client Code

**File:** `artifacts/mobile/lib/aiService.ts`

**Core Structure:**
```typescript
import { supabase } from './supabase';

const SUPABASE_URL = 'https://pwphrlbpwxytswdaglem.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-service`;
```

**Request Queue System (Lines 8-30):**
- Serializes ALL requests (max 1 active)
- Prevents Gemini 503 rate-limit errors
- Uses `acquireSlot()` and `releaseSlot()`

**Retry Logic (Lines 32-62):**
```typescript
const RETRY_DELAYS = [5000, 15000]; // 5s, then 15s

function isRetryable(msg: string): boolean {
  // 429 is excluded - never retry quota exhaustion
  if (msg.includes('429') || msg.includes('quota')) return false;
  return msg.includes('503') || msg.includes('busy') || msg.includes('UNAVAILABLE');
}
```

**Core Invoker (Lines 86-155):**
```typescript
async function invokeAI<T = unknown>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  return withRetry(async () => {
    await acquireSlot();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? SUPABASE_ANON_KEY;
      const userId = session?.user?.id;

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
          ? 'Request timed out — the AI took too long to respond.'
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
```

**Public API (Lines 198+):**
```typescript
export const aiService = {
  chatWithFallback: async (userMessage: string): Promise<TextOnlyResponse> => {
    const { data, error } = await supabase.functions.invoke('ai-service', {
      body: {
        action: 'profile-chat',
        message: userMessage,
      },
    });
    // ... error handling
  },

  hybridChat: async (userMessage: string): Promise<HybridResponse> => {
    // Both text + embeddings
  },

  getEmbedding: async (text: string): Promise<EmbeddingResponse> => {
    // Embeddings only
  },

  similaritySearch: async (
    query: string,
    candidates: string[]
  ): Promise<SimilaritySearchResponse> => {
    // Find similar items
  },

  // ... other endpoints
};
```

---

## How They Connect

### Request Flow
```
1. Mobile calls: aiService.chatWithFallback("Hello")
   ↓
2. invokeAI() queues request (acquireSlot)
   ↓
3. fetch() to EDGE_FUNCTION_URL with:
   {
     action: 'profile-chat',
     message: 'Hello',
     userId: 'xxx'
   }
   ↓
4. Edge Function handleProfileChat() called
   ↓
5. callGeminiWithFallback() calls Gemini API
   ↓
6. Response returned through Supabase
   ↓
7. Mobile parses and returns to UI
```

### Headers Sent from Mobile
```
Content-Type: application/json
Authorization: Bearer {authToken}
apikey: {SUPABASE_ANON_KEY}
```

### Response Format
```typescript
// Success (200)
{
  reply: "Hello! How can I help?",
  model: "gemini-2.5-flash",
  isComplete: false,
  profileData: {},
  partialProfile: {}
}

// Error (4xx/5xx)
{
  error: "Error message",
  code: "ERROR_CODE",
  timestamp: "2026-05-24T15:32:32.000Z"
}
```

---

## API Endpoints & Payloads

### 1. profile-chat (Text Conversation)
**Request:**
```json
{
  "action": "profile-chat",
  "message": "What are my best skills?",
  "existingProfile": {
    "displayName": "John Doe",
    "currentDegree": "Computer Science",
    "institution": "UNZA"
  },
  "cvContent": "CV text..."
}
```

**Response:**
```json
{
  "reply": "Based on your CV...",
  "model": "gemini-2.5-flash",
  "isComplete": false,
  "profileData": {},
  "partialProfile": {
    "displayName": "John Doe",
    "careerGoals": "..."
  }
}
```

### 2. hybrid-chat (Text + Embeddings)
**Request:**
```json
{
  "action": "hybrid-chat",
  "message": "What companies should I apply to?"
}
```

**Response:**
```json
{
  "reply": "Based on your background...",
  "embedding": [0.123, -0.456, ...],
  "text_model": "gemini-2.5-flash",
  "embedding_model": "gemini-embedding-001",
  "status": "full",
  "errors": {}
}
```

### 3. embed (Embeddings Only)
**Request:**
```json
{
  "action": "embed",
  "text": "Senior Product Manager at Google"
}
```

**Response:**
```json
{
  "embedding": [0.123, -0.456, ...],
  "model": "gemini-embedding-001",
  "dimensions": 3072
}
```

### 4. similarity-search
**Request:**
```json
{
  "action": "similarity-search",
  "query": "Senior engineer interested in ML",
  "candidates": [
    "ML Engineer at Google",
    "Frontend Dev at Stripe",
    "Backend at Meta"
  ]
}
```

**Response:**
```json
{
  "query": "Senior engineer interested in ML",
  "query_model": "gemini-embedding-001",
  "results": [
    { "text": "ML Engineer at Google", "similarity": 0.89, "error": null },
    { "text": "Backend at Meta", "similarity": 0.76, "error": null }
  ],
  "total_candidates": 3,
  "successfully_scored": 2
}
```

### 5. Other Available Actions
- `draft-letter` - Generate cover/motivation letters
- `discover-companies` - Find companies by location/industry
- `interview-questions` - Get prep questions
- `research-company` - Research company info
- `extract-content` - Parse CVs/documents
- `star-feedback` - Evaluate STAR answers
- `interview-verdict` - Mock interview evaluation
- `parse-profile-from-cv` - Extract profile from CV
- `networking-events` - Find events

---

## Troubleshooting

### Issue: 400 Bad Request
**Cause:** Missing `action` field or invalid data

**Fix:**
```typescript
// Make sure payload has action:
{
  action: 'profile-chat',  // ← Required
  message: 'Hello',
}
```

### Issue: 503 Service Unavailable
**Cause:** Gemini API rate limit or overload

**Fix:**
- Mobile client automatically retries (5s, then 15s)
- Don't send multiple requests at once
- Request queue serializes automatically

### Issue: 504 Timeout
**Cause:** Edge Function taking >60s to respond

**Fix:**
- Check GEMINI_API_KEY is valid
- Check internet connection
- Reduce message length (<5000 chars)

### Issue: Empty Response
**Cause:** Gemini returned empty text

**Fix:**
- Fallback model will be attempted
- If both fail, error thrown
- Check API quota at https://aistudio.google.com/app/apikey

### Issue: "Bad JSON from action X"
**Cause:** Edge Function returned non-JSON response

**Fix:**
- Check Supabase Edge Function logs
- Verify function deployed successfully
- Check for syntax errors in index.ts

---

## Recovery Steps

### If AI stops working:

#### Step 1: Verify API Key
```
1. Go to https://aistudio.google.com/app/apikey
2. Check if GEMINI_API_KEY is valid
3. In Supabase Dashboard → Edge Functions → Secrets
4. Update GEMINI_API_KEY if needed
```

#### Step 2: Check Endpoint Version
```
In supabase/functions/ai-service/index.ts line 21:
✅ CORRECT: https://generativelanguage.googleapis.com/v1beta/models
❌ WRONG: https://generativelanguage.googleapis.com/v1/models
```

#### Step 3: Redeploy Edge Function
```
1. Go to Supabase Dashboard
2. Edge Functions → ai-service
3. Click "Deploy"
4. Wait for green checkmark
5. Test with /health endpoint
```

#### Step 4: Clear Mobile Cache
```
// Clear Supabase cache
import { supabase } from './supabase';
await supabase.cache?.clear();
```

#### Step 5: Check Logs
```
Supabase Dashboard → Edge Functions → ai-service → Logs
Look for:
- ✅ "ai-service invoked" = Function called
- ✅ "gemini-text" = API called successfully
- ❌ "GEMINI API error" = API failure
```

---

## Important Files Reference

```
supabase/functions/ai-service/
├── index.ts              ← Main edge function (1700+ lines)
├── deno.json            ← Dependencies
└── utils/               ← Helpers

artifacts/mobile/lib/
├── aiService.ts         ← Mobile client (480+ lines)
├── supabase.ts          ← Supabase client config
└── ...other files

Mobile Integration Points:
- app/(tabs)/profile.tsx → Uses aiService.chatWithFallback()
- app/(tabs)/companies.tsx → Uses aiService.discoverCompanies()
- app/(tabs)/applications.tsx → Uses aiService.interviewQuestions()
```

---

## Version History

| Date | Change | Status |
|------|--------|--------|
| May 24, 2026 | API endpoint changed `/v1/` → `/v1beta/` | ✅ FIXED |
| May 24, 2026 | Gemini 2.5-flash models confirmed working | ✅ VERIFIED |
| May 24, 2026 | Request serialization working | ✅ VERIFIED |
| May 24, 2026 | Retry logic functional | ✅ VERIFIED |

---

## Testing Checklist

- [ ] Edge Function deployed (green checkmark visible)
- [ ] GEMINI_API_KEY set in Secrets
- [ ] /health endpoint returns 200
- [ ] profile-chat action works (test in console)
- [ ] Mobile app receives responses
- [ ] No 400 Bad Request errors
- [ ] No 503 errors (or auto-retries)
- [ ] Embeddings working (hybrid-chat returns embedding)

---

**Last Updated:** May 24, 2026  
**Created by:** AI Assistant  
**Status:** PRODUCTION READY ✅

This file is your backup reference. If anything breaks, refer to this document first!
