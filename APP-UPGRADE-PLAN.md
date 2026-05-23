# Career Campus App Upgrade Plan
## From Simplified to Sophisticated AI Backend Architecture

**Document Version:** 1.0  
**Created:** May 23, 2026  
**Status:** Ready for Implementation  
**Purpose:** Complete technical roadmap to upgrade from current simplified MVP to full-featured sophisticated AI backend

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Phase 1: Foundation & Refactoring](#phase-1-foundation--refactoring)
6. [Phase 2: Profile Chat Enhancement](#phase-2-profile-chat-enhancement)
7. [Phase 3: Advanced Features](#phase-3-advanced-features)
8. [Phase 4: External API Integration](#phase-4-external-api-integration)
9. [Phase 5: Polish & Optimization](#phase-5-polish--optimization)
10. [Deployment & Rollout](#deployment--rollout)
11. [Testing & Validation](#testing--validation)

---

## Executive Summary

The current Career Campus backend is a **working MVP** that successfully implements 10 core features but lacks the sophistication described in BACKEND_ARCHITECTURE.md. This plan systematically upgrades the system through **5 implementation phases** totaling **40-60 hours of development work**.

### What We're Doing

| Aspect | Current | After Upgrade |
|--------|---------|---------------|
| **Endpoints** | 10 | 14 |
| **Data Sources** | 1 (Gemini only) | 4 (Gemini + Eventbrite + Serper + Tavily) |
| **Profile Extraction** | Regex-based | Marker-based live extraction |
| **Networking Events** | Text generation only | Multi-source with aggregation & fallbacks |
| **CV Integration** | None | CV-aware conversation strategies |
| **Error Handling** | Basic | Hierarchical with specific error types |
| **Logging** | Console.log | Structured JSON logging |
| **Code Organization** | Monolithic (784 lines) | Modular (2,400+ lines across utils/handlers) |

### Success Criteria

- ✅ All 14 endpoints functional and tested
- ✅ Multi-source API integration with graceful fallbacks
- ✅ Profile chat with 18-26 exchange minimum
- ✅ Real-time profile extraction via markers
- ✅ Zambian context throughout all features
- ✅ Structured logging and error handling
- ✅ Comprehensive test coverage
- ✅ Zero breaking changes to mobile client

---

## Current State Analysis

### ✅ What's Working (Current Simplified Version)

```
FUNCTIONAL ENDPOINTS (10):
├─ profile-chat          ✅ Basic Q&A, never closes
├─ hybrid-chat           ✅ Text + embeddings with fallback
├─ embed                 ✅ Dual-model fallback (001→002)
├─ similarity-search     ✅ Cosine similarity scoring
├─ draft-letter          ✅ Gemini text generation
├─ discover-companies    ✅ Gemini + regex JSON parsing
├─ interview-questions   ✅ Gemini + regex JSON parsing
├─ extract-content       ✅ Gemini text summary
├─ research-company      ✅ Gemini text generation
└─ networking-events     ✅ Gemini text generation (INCOMPLETE)

INFRASTRUCTURE:
├─ Supabase Edge Function deployment ✅
├─ Gemini API integration ✅
├─ CORS handling ✅
├─ Error responses ✅
└─ Request routing ✅
```

### ❌ What's Missing (From Architecture Doc)

```
MISSING ENDPOINTS (3):
├─ star-feedback         ❌ STAR answer evaluation
├─ interview-verdict     ❌ Full mock interview panel
└─ parse-profile-from-cv ❌ CV text parsing

MISSING CAPABILITIES:
├─ Profile Chat:
│  ├─ Marker-based extraction (PARTIAL_PROFILE, PROFILE_COMPLETE)
│  ├─ CV-aware opening strategies
│  └─ 18-26 exchange minimum enforcement
├─ Networking Events:
│  ├─ Eventbrite API integration
│  ├─ Serper.dev Google Search
│  ├─ Tavily advanced search
│  └─ Multi-source aggregation & fallbacks
├─ Context Enhancement:
│  ├─ Zambian institution awareness
│  ├─ Professional body context
│  ├─ Document grounding
│  └─ Student profile context injection
└─ Infrastructure:
   ├─ Structured logging
   ├─ Error hierarchy
   ├─ Health check endpoint
   ├─ Batch processing utils
   └─ Timeout handling per API

CURRENT ISSUES:
├─ Profile chat never completes (by design, but no completion mechanism)
├─ Networking events: text-only, no real event sources
├─ No CV-aware conversation strategies
├─ No live profile extraction (PARTIAL_PROFILE markers)
├─ Limited Zambian context
├─ Error handling: generic 500s, no specific error types
├─ Logging: console.log only, no structured JSON
└─ Code: monolithic at 784 lines (hard to maintain/test)
```

### 📊 Gap Analysis Summary

| Category | Gap | Impact |
|----------|-----|--------|
| **Endpoints** | Missing 3 of 14 | Can't evaluate interviews, parse CVs |
| **Data Sources** | Only Gemini, missing 3 APIs | Networking events low quality, no real data |
| **Profile System** | No markers, no CV strategy | No live profile updates during chat |
| **Context** | Minimal Zambian awareness | Generic advice, misses local relevance |
| **Error Handling** | Generic 500s | Hard to debug, poor UX |
| **Code Quality** | Monolithic, no modularity | Hard to test, modify, scale |

---

## Target Architecture

### Data Flow (Post-Upgrade)

```
┌─────────────┐
│ Mobile App  │
└──────┬──────┘
       │ action + payload
       │
       ▼
┌──────────────────────────────────────┐
│  Supabase Edge Function (ai-service) │
├──────────────────────────────────────┤
│ Route Handler (12 switch cases)      │
└──────┬───────────────────────────────┘
       │
       ├─► profile-chat
       │   ├─ Assemble context (profile + CV)
       │   ├─ Rich system prompt
       │   ├─ Call Gemini with context
       │   ├─ Parse PARTIAL_PROFILE marker
       │   ├─ Check for PROFILE_COMPLETE
       │   └─ Return with live profile
       │
       ├─► networking-events
       │   ├─ Parallel calls:
       │   │  ├─ fetchEventbriteEvents()
       │   │  ├─ fetchSerperEvents()
       │   │  └─ fetchTavilyEvents()
       │   ├─ Aggregate & deduplicate
       │   ├─ Sort by relevance
       │   ├─ Fallback to Gemini grounding
       │   └─ Return top 12-15 events
       │
       ├─ Other endpoints...
       │  (all with timeout handling,
       │   structured logging, error types)
       │
       └─► External APIs (with fallbacks)
           ├─ Eventbrite API (10s timeout)
           ├─ Serper.dev (10s timeout)
           ├─ Tavily API (15s timeout)
           ├─ Gemini API (60s timeout)
           └─ Error → log & continue to next
```

### Key Architectural Improvements

**1. Context Assembly**
```typescript
// Build rich context before calling Gemini
const context = {
  studentProfile: buildStudentProfileString(profile),
  documents: buildDocumentContextString(docs),
  zambiaContext: getZambianContextParagraph()
};
// Automatically enriches prompts
```

**2. Multi-Source APIs with Fallbacks**
```
Request events → Try Eventbrite (10s)
                ├─ Success? → Add results
                └─ Fail? → Continue
             → Try Serper (10s)
                ├─ Success? → Add results
                └─ Fail? → Continue
             → Try Tavily (15s)
                ├─ Success? → Add results
                └─ Fail? → Continue
             → If < 5 events → Use Gemini grounding
             → Return aggregated & sorted results
```

**3. Marker-Based Profile Extraction**
```
AI response includes markers:
"Your message here...

PARTIAL_PROFILE: {
  "displayName": "John",
  "institution": "UNZA",
  "skills": ["React", "Python"]
}

PROFILE_COMPLETE: {
  ... full profile JSON ...
}"

Client parses markers, strips from display text,
saves partial profile in real-time
```

**4. Error Hierarchy**
```
AIServiceError (base)
├─ ValidationError (400) - missing fields
├─ APIError (503) - API failed
├─ RateLimitError (429) - quota exceeded
└─ TimeoutError (504) - request too slow

Each error has: code, status, message, details
Allows specific retry logic, user messaging
```

**5. Structured Logging**
```json
{
  "level": "INFO",
  "timestamp": "2026-05-23T16:58:39Z",
  "action": "gemini-text",
  "message": "Text generation successful",
  "metadata": {
    "model": "gemini-2.5-flash",
    "duration_ms": 2341
  }
}
```

---

## Implementation Phases

### Phase Overview & Timeline

| # | Phase | Duration | Focus | Deliverables |
|---|-------|----------|-------|--------------|
| 1 | Foundation & Refactoring | 6-8h | Infrastructure, utils, logging | 7 utility files, ~600 LOC |
| 2 | Profile Chat Enhancement | 8-10h | Markers, CV strategy, exchanges | Enhanced handleProfileChat |
| 3 | Advanced Features | 8-10h | STAR, Verdict, CV Parse | 3 new handlers |
| 4 | External API Integration | 8-12h | Eventbrite, Serper, Tavily | 4 API clients + aggregation |
| 5 | Polish & Optimization | 6-8h | Health check, batch, docs | ~120 LOC, comprehensive docs |

**Total Estimated Effort:** 40-60 implementation hours  
**Plus Testing:** 4-8 hours  
**Plus Deployment:** 2-4 hours

---

## Phase 1: Foundation & Refactoring

**Duration:** 6-8 hours  
**Goal:** Create reusable infrastructure and utilities  
**Outcome:** Clean foundation for all other phases

### 1.1 Create `utils/constants.ts`

```typescript
// Gemini Models
export const MODELS = {
  generation: {
    primary: 'gemini-2.5-flash',
    fallback: 'gemini-1.5-flash',
  },
  embedding: {
    primary: 'gemini-embedding-001',
    fallback: 'gemini-embedding-2',
  },
  image: 'gemini-2.5-flash-image',
};

// API Endpoints
export const API_ENDPOINTS = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  eventbrite: 'https://www.eventbriteapi.com/v3/events/search/',
  serper: 'https://google.serper.dev/search',
  tavily: 'https://api.tavily.com/search',
};

// Timeouts (milliseconds)
export const TIMEOUTS = {
  gemini: 60_000,
  eventbrite: 10_000,
  serper: 10_000,
  tavily: 15_000,
  default: 30_000,
};

// Zambian Context
export const ZAMBIAN_CONTEXT = {
  cities: ['Lusaka', 'Kitwe', 'Ndola', 'Livingstone', 'Kabwe', 'Chingola'],
  universities: [
    'University of Zambia (UNZA)',
    'Copperbelt University (CBU)',
    'Mulungushi University',
    'Nkrumah University',
    'Cavendish University',
  ],
  professionBodies: [
    'Engineering Institution of Zambia (EIZ)',
    'Zambia Institute of Chartered Accountants (ZICA)',
    'Information and Communication Technology Association of Zambia (ICTAZ)',
    'Law Association of Zambia (LAZ)',
    'TEVETA (Technical Education, Vocational and Entrepreneurship Training Authority)',
  ],
  languages: ['English', 'Nyanja', 'Bemba', 'Tonga', 'Lozi'],
  jobTypes: ['Industrial Attachment', 'Internship', 'Graduate Programme'],
  industries: [
    'Mining', 'Agriculture', 'Energy', 'Finance', 'Technology',
    'Healthcare', 'Education', 'NGOs', 'Government'
  ],
};

export const RESPONSE_STATUS = {
  FULL: 'full',
  TEXT_ONLY: 'text_only',
  EMBEDDING_ONLY: 'embedding_only',
  PARTIAL: 'partial',
  FAILED: 'failed',
};
```

**Purpose:** Single source of truth for all configuration  
**Usage:** `import { MODELS, TIMEOUTS, ZAMBIAN_CONTEXT } from './utils/constants.ts'`

---

### 1.2 Create `utils/types.ts`

TypeScript interfaces for all request/response bodies (request bodies first, then responses):

```typescript
// ===== REQUEST BODIES =====

export interface ProfileChatBody {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  message?: string;
  existingProfile?: Record<string, unknown>;
  cvContent?: string;
}

export interface StarFeedbackBody {
  question: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  companyContext?: string;
  cvContent?: string;
}

export interface InterviewVerdictBody {
  companyName: string;
  interviewAnswers: Array<{ question: string; answer: string }>;
  companyResearch?: string;
  cvContent?: string;
}

export interface ParseProfileBody {
  cvContent: string;
}

export interface NetworkingEventsBody {
  location?: string;
  city?: string;
  interests?: string;
  goals?: string;
  studentLevel?: string;
}

// ===== RESPONSE BODIES =====

export interface ProfileChatResponse {
  reply: string;
  isComplete: boolean;
  model: string;
  profileData?: Record<string, unknown>;
  partialProfile?: Record<string, string | string[]>;
  errors?: Record<string, string>;
}

export interface StarFeedbackResponse {
  feedback: string;
  score: number;
  model: string;
  dimension?: string;
}

export interface InterviewVerdictResponse {
  verdict: 'accepted' | 'shortlisted' | 'rejected';
  score: number;
  answers: Array<{
    question: string;
    answer: string;
    score: number;
    feedback: string;
  }>;
  overallFeedback: string;
  areasToImprove: string[];
  recommendation: string;
  model: string;
}

export interface ParsedProfileResponse {
  displayName: string;
  email?: string;
  phone?: string;
  currentDegree?: string;
  institution?: string;
  yearOfStudy?: string;
  city?: string;
  preferredIndustries?: string[];
  careerGoals?: string;
  portfolioUrl?: string;
  profileFields: Array<{
    category: string;
    value: string;
  }>;
  model: string;
}

export interface NetworkingEvent {
  id: string;
  eventName: string;
  eventType: string;
  date?: string;
  location: string;
  isOnline: boolean;
  description: string;
  relevance: number;
  source: string;
  url?: string;
}

export interface NetworkingEventsResponse {
  events: NetworkingEvent[];
  totalFound: number;
  sources: string[];
  model?: string;
  errors?: Record<string, string>;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  timestamp: string;
  details?: Record<string, string>;
}

// Internal types
export interface StudentProfile {
  displayName?: string;
  email?: string;
  phone?: string;
  currentDegree?: string;
  institution?: string;
  yearOfStudy?: string;
  city?: string;
  preferredIndustries?: string[];
  careerGoals?: string;
  portfolioUrl?: string;
  profileFields?: Array<{ category: string; value: string }>;
}

export interface DocumentContext {
  name: string;
  category: string;
  extractedText: string;
}
```

---

### 1.3 Create `utils/logger.ts`

```typescript
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  private startTimes: Map<string, number> = new Map();

  log(level: LogLevel, action: string, message: string, metadata?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      action,
      message,
      metadata,
    };
    console.log(JSON.stringify(entry));
  }

  debug(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, action, message, metadata);
  }

  info(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.INFO, action, message, metadata);
  }

  warn(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.WARN, action, message, metadata);
  }

  error(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, action, message, metadata);
  }

  startTimer(label: string) {
    this.startTimes.set(label, Date.now());
  }

  endTimer(label: string, action: string, metadata?: Record<string, unknown>) {
    const start = this.startTimes.get(label);
    if (start) {
      const duration = Date.now() - start;
      this.info(action, `Completed in ${duration}ms`, {
        ...metadata,
        duration_ms: duration,
      });
      this.startTimes.delete(label);
    }
  }
}

export const logger = new Logger();
```

---

### 1.4 Create `utils/errors.ts`

```typescript
export class AIServiceError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class ValidationError extends AIServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class APIError extends AIServiceError {
  constructor(message: string, statusCode: number = 503, details?: Record<string, unknown>) {
    super('API_ERROR', statusCode, message, details);
    this.name = 'APIError';
  }
}

export class RateLimitError extends AIServiceError {
  constructor(message: string = 'Rate limit exceeded') {
    super('RATE_LIMIT_ERROR', 429, message);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends AIServiceError {
  constructor(service: string) {
    super('TIMEOUT_ERROR', 504, `${service} request timed out`);
    this.name = 'TimeoutError';
  }
}

export function isRetryable(error: AIServiceError): boolean {
  return [503, 429, 504].includes(error.statusCode);
}
```

---

### 1.5 Create `utils/context.ts`

```typescript
import { StudentProfile, DocumentContext } from './types.ts';
import { ZAMBIAN_CONTEXT } from './constants.ts';

export function buildStudentProfileString(profile: StudentProfile): string {
  const parts: string[] = [];

  if (profile.displayName) parts.push(`Name: ${profile.displayName}`);
  if (profile.currentDegree) parts.push(`Degree: ${profile.currentDegree}`);
  if (profile.institution) parts.push(`Institution: ${profile.institution}`);
  if (profile.yearOfStudy) parts.push(`Year of Study: ${profile.yearOfStudy}`);
  if (profile.city) parts.push(`City: ${profile.city}`);
  if (profile.preferredIndustries?.length)
    parts.push(`Industries: ${profile.preferredIndustries.join(', ')}`);
  if (profile.careerGoals) parts.push(`Goals: ${profile.careerGoals}`);

  if (profile.profileFields?.length) {
    const jobs = profile.profileFields.filter((f) => f.category === 'job');
    const skills = profile.profileFields.filter((f) => f.category === 'skill');
    if (jobs.length) parts.push(`Experience: ${jobs.map((j) => j.value).join('; ')}`);
    if (skills.length) parts.push(`Skills: ${skills.map((s) => s.value).join(', ')}`);
  }

  return parts.join('\n');
}

export function buildDocumentContextString(documents: DocumentContext[]): string {
  if (!documents.length) return '';

  return documents
    .map((doc) => `[${doc.category}]\n${doc.extractedText.slice(0, 2000)}`)
    .join('\n\n---\n\n');
}

export function isZambiaLocation(location: string): boolean {
  const zambianCities = [
    'lusaka', 'kitwe', 'ndola', 'livingstone', 'kabwe', 'chingola',
    'copperbelt', 'northern province', 'zambia'
  ];
  return zambianCities.some((city) => location.toLowerCase().includes(city));
}

export function normalizeLocation(location: string): string {
  if (!location) return 'Lusaka, Zambia';
  if (isZambiaLocation(location)) {
    return location.includes('Zambia') ? location : `${location}, Zambia`;
  }
  return location;
}

export function getZambianContextParagraph(): string {
  const contexts = [
    `Universities: ${ZAMBIAN_CONTEXT.universities.slice(0, 3).join(', ')}`,
    `Professional Bodies: ${ZAMBIAN_CONTEXT.professionBodies.slice(0, 3).join(', ')}`,
    `Major Industries: ${ZAMBIAN_CONTEXT.industries.slice(0, 4).join(', ')}`,
    `Languages: ${ZAMBIAN_CONTEXT.languages.join(', ')}`,
  ];

  return `Context: You are providing advice for Zambian professionals/students. 
Consider: ${contexts.join('; ')}.
Use local terminology and mention Zambian-specific context when relevant.`;
}
```

---

### 1.6 Create `utils/formatters.ts`

```typescript
export function extractJSON<T>(text: string, defaultValue?: T): T | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Try extracting JSON object/array
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }

    return defaultValue ?? null;
  }
}

export function extractProfileFields(text: string): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};

  const patterns: Record<string, RegExp> = {
    displayName: /(?:name|full name):\s*([^\n.]+)/i,
    email: /(?:email):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    phone: /(?:phone|mobile):\s*(\+?[\d\s-()]+)/i,
    currentDegree: /(?:degree|studying|pursuing):\s*([^\n.]+)/i,
    institution: /(?:university|institution|college):\s*([^\n.]+)/i,
    yearOfStudy: /(?:year|year of study):\s*([^\n.]+)/i,
    city: /(?:city|location|based in):\s*([^\n.]+)/i,
    preferredIndustries: /(?:interested in|industries?|sectors?):\s*([^\n.]+)/i,
    careerGoals: /(?:goals?|career goals|aspiring to):\s*([^\n.]+)/i,
    portfolioUrl: /(?:portfolio|website|github):\s*(https?:\/\/[^\s\n]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim();
      if (key === 'preferredIndustries') {
        fields[key] = value.split(',').map((s) => s.trim());
      } else {
        fields[key] = value;
      }
    }
  }

  return fields;
}

export function extractPartialProfile(text: string): Record<string, unknown> | null {
  const marker = 'PARTIAL_PROFILE:';
  const idx = text.indexOf(marker);
  if (idx === -1) return null;

  const jsonStart = idx + marker.length;
  const jsonEnd = text.indexOf('\n', jsonStart);
  const jsonStr = text.substring(jsonStart, jsonEnd === -1 ? undefined : jsonEnd).trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function extractProfileComplete(text: string): { reply: string; profile: Record<string, unknown> | null } {
  const marker = 'PROFILE_COMPLETE:';
  const idx = text.indexOf(marker);

  if (idx === -1) {
    return { reply: text, profile: null };
  }

  const reply = text.substring(0, idx).trim();
  const jsonStart = idx + marker.length;
  const jsonEnd = text.indexOf('\n', jsonStart);
  const jsonStr = text.substring(jsonStart, jsonEnd === -1 ? undefined : jsonEnd).trim();

  try {
    const profile = JSON.parse(jsonStr);
    return { reply, profile };
  } catch {
    return { reply, profile: null };
  }
}

export function cleanMarkdown(text: string): string {
  return (
    text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n\n+/g, '\n\n')
      .trim()
  );
}

export function formatZambianDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-ZM', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
```

---

### 1.7 Create `utils/batch.ts`

```typescript
import { logger } from './logger.ts';

export async function processBatchWithRateLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<R[]> {
  const { concurrency = 1, delayMs = 0 } = options;

  const results: R[] = [];
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];

      try {
        const result = await processor(item);
        results[currentIndex] = result;
        
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (err) {
        logger.error('batch-processor', `Failed to process item ${currentIndex}`, {
          error: String(err),
        });
      }
    }
  };

  const workers = Array(concurrency).fill(null).map(() => worker());
  await Promise.all(workers);

  return results;
}
```

---

### 1.8 Update Main `callGeminiWithFallback`

Refactor to use new utilities (timeout handling, context enrichment, structured logging):

```typescript
// At top of index.ts
import { MODELS, API_ENDPOINTS, TIMEOUTS } from './utils/constants.ts';
import { logger } from './utils/logger.ts';
import { ValidationError, APIError, TimeoutError } from './utils/errors.ts';
import { extractJSON } from './utils/formatters.ts';
import { StudentProfile, DocumentContext } from './utils/types.ts';
import { buildStudentProfileString, buildDocumentContextString, getZambianContextParagraph } from './utils/context.ts';

async function callGeminiWithFallback(
  systemPrompt: string,
  userMessage: string,
  context?: { profile?: StudentProfile; documents?: DocumentContext[] }
): Promise<TextResponse> {
  logger.startTimer('gemini-call');
  
  if (!GEMINI_API_KEY) {
    throw new ValidationError('Missing GEMINI_API_KEY secret');
  }
  if (!userMessage?.trim()) {
    throw new ValidationError('Empty user message');
  }

  // Enrich system prompt with context
  let enrichedPrompt = systemPrompt;
  if (context?.profile) {
    enrichedPrompt += '\n\n' + buildStudentProfileString(context.profile);
  }
  if (context?.documents) {
    enrichedPrompt += '\n\nDocument Context:\n' + buildDocumentContextString(context.documents);
  }
  enrichedPrompt += '\n\n' + getZambianContextParagraph();

  const models = [MODELS.generation.primary, MODELS.generation.fallback];
  let lastError: AIServiceError | null = null;

  for (const model of models) {
    try {
      logger.info('gemini-text', `Attempting with ${model}`);
      
      const url = `${API_ENDPOINTS.gemini}/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.gemini);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: enrichedPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const text = await res.text().catch(() => '');

        if (!res.ok) {
          lastError = new APIError(
            `${model} returned ${res.status}`,
            res.status,
            { response: text.slice(0, 200) }
          );
          logger.warn('gemini-text', `${model} failed: ${res.status}`, { error: lastError.message });
          continue;
        }

        const data = extractJSON<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>(text);
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        if (!reply?.trim()) {
          lastError = new APIError(`${model} returned empty response`);
          logger.warn('gemini-text', `${model} empty response`);
          continue;
        }

        logger.endTimer('gemini-call', 'gemini-text', { model, success: true });
        return {
          reply: reply.trim(),
          model,
          isComplete: true,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          lastError = new TimeoutError(model);
        } else {
          lastError = new APIError(err.message);
        }
        logger.error('gemini-text', `${model} error`, { error: err.message });
      }
    } catch (err: any) {
      lastError = new APIError(err.message);
    }
  }

  throw lastError || new APIError('All text generation models failed');
}
```

---

### 1.9 Phase 1 Deliverables Checklist

- ✅ `utils/constants.ts` - All models, APIs, timeouts, Zambian context (100 LOC)
- ✅ `utils/types.ts` - Complete TypeScript interfaces (200 LOC)
- ✅ `utils/logger.ts` - Structured JSON logging (60 LOC)
- ✅ `utils/errors.ts` - Error hierarchy with specific types (50 LOC)
- ✅ `utils/context.ts` - Context assembly & student profile utilities (120 LOC)
- ✅ `utils/formatters.ts` - JSON extraction, markdown cleaning, date formatting (150 LOC)
- ✅ `utils/batch.ts` - Batch processing with rate limiting (40 LOC)
- ✅ Refactored `callGeminiWithFallback` with timeout handling and context enrichment
- ✅ Environment variables setup in Supabase (GEMINI_API_KEY, etc.)
- ✅ Code organization: utilities separate from business logic

**Phase 1 Total:** ~720 LOC across 7 files + refactored main handler

---

## Phase 2: Profile Chat Enhancement

**Duration:** 8-10 hours  
**Goal:** Sophisticated profile chat with markers and CV strategy  
**Outcome:** Real-time profile extraction, CV-aware conversations

### 2.1 Enhanced `handleProfileChat`

Replace the current simple version with this sophisticated implementation:

```typescript
/**
 * Enhanced Profile Chat with CV-Aware Conversation & Live Extraction
 * 
 * Features:
 * - CV-aware opening strategies (different based on what's known)
 * - PARTIAL_PROFILE & PROFILE_COMPLETE marker-based extraction
 * - Exchange count tracking (18-26 minimum for depth)
 * - Deep follow-up questions (one question per turn)
 * - Zambian context awareness
 * - Never closes conversation early
 */
async function handleProfileChat(body: ProfileChatBody): Promise<Response> {
  try {
    const messages = body.messages ?? [];
    const existingProfile = body.existingProfile ?? {};
    const cvContent = body.cvContent ?? '';

    // Extract current user message
    const userMessage =
      body.message ??
      [...messages].reverse().find((m) => m.role === 'user')?.content ??
      messages[messages.length - 1]?.content ??
      '';

    if (!userMessage?.trim()) {
      throw new ValidationError('No user message provided');
    }

    // Count exchanges (pairs of user-assistant)
    const exchangeCount = Math.floor(messages.length / 2) + 1;

    // Analyze what we know
    const hasCv = !!cvContent?.trim();
    const hasPartialProfile = Object.keys(existingProfile).length > 0;
    const hasName = !!existingProfile.displayName;

    // Determine opening strategy
    let openingStrategy = '';
    if (hasCv && exchangeCount === 1) {
      openingStrategy = `CV UPLOADED: Read this CV carefully, then greet warmly by name (if shown) and mention something specific you learned from it. Ask ONE follow-up question about something missing or to dig deeper on an interesting point. Never ask about things the CV already explains.`;
    } else if (hasPartialProfile && exchangeCount === 1) {
      openingStrategy = `PARTIAL PROFILE EXISTS: You already know their name: "${existingProfile.displayName}", degree: "${existingProfile.currentDegree}", and institution: "${existingProfile.institution}". Skip these topics. Greet them warmly by name and ask ONE focused question about the most important missing information.`;
    } else if (exchangeCount === 1) {
      openingStrategy = `NEW CONVERSATION: You're meeting them for the first time. Introduce yourself warmly and ask for their full name as the first question.`;
    } else {
      openingStrategy = `CONTINUE CONVERSATION: Exchange #${exchangeCount}. Keep deepening the conversation. Ask ONE follow-up question that builds directly on their last answer. Reference something they mentioned earlier to show you're listening carefully.`;
    }

    // Build comprehensive system prompt
    const systemPrompt = `You are Career Compass AI, a warm, deeply curious career advisor helping students build their professional profile.

YOUR CORE MISSION:
Build the most complete picture of this person's skills, background, experience, and career aspirations through natural, engaging conversation.

OPENING STRATEGY FOR THIS EXCHANGE:
${openingStrategy}

═══════════════════════════════════════════════════════════════
CRITICAL CONVERSATION RULES (FOLLOW THESE STRICTLY):
═══════════════════════════════════════════════════════════════

1. ONE QUESTION PER TURN - Never ask multiple questions. Pick THE most important one.

2. NEVER NUMBER QUESTIONS - Don't write "1) Question? 2) Question?" - that's robotic. Write naturally.

3. BUILD ON THEIR ANSWERS - Always reference what they just said:
   "That's interesting you mentioned React—I saw earlier you also work with Node. How do those tie together?"

4. DEEP FOLLOW-UPS - If they give short answers, dig deeper:
   "That sounds cool! Tell me more about what you built—what was the most challenging part?"

5. WARM AND ENCOURAGING - Sound human. Use their name naturally. Show genuine interest:
   "Wow, that's an impressive project for someone starting out!"

6. EXTRACT SPECIFIC DETAILS - When they mention a skill, ask for proof:
   "You mentioned Python—what's the most complex thing you've built with it?"

7. NEVER WRAP UP EARLY - Keep going indefinitely. The profile is never "complete" until they explicitly say so.
   Don't say things like "We've covered everything" or "Your profile is ready". KEEP ASKING.

8. USE ZAMBIAN CONTEXT - Know about UNZA, CBU, EIZ, ZICA, ICTAZ, TEVETA.
   If they mention a Zambian institution or body, reference it naturally.

9. ASK ABOUT EVERYTHING - Dig into: name, degree, institution, year, city, skills, projects, work experience,
   languages (Nyanja, Bemba, Tonga?), extracurriculars, awards, goals, passions, preferred work environment.

10. LISTEN AND REMEMBER - Reference specific things they've told you earlier in the conversation:
    "You mentioned earlier you love Node.js—have you thought about backend engineering?"

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT:
═══════════════════════════════════════════════════════════════

Write your warm, conversational message normally. At the END of your response, add:

PARTIAL_PROFILE: {
  "displayName": "name if mentioned",
  "currentDegree": "degree if mentioned",
  "institution": "school if mentioned",
  "city": "city if mentioned",
  "skills": ["skill1", "skill2"],
  ... other fields mentioned so far
}

IF conversation is deep enough (usually after 18-26 exchanges), ALSO add:
PROFILE_COMPLETE: {
  "displayName": "...",
  "email": "...",
  "currentDegree": "...",
  ... ALL FIELDS
}

Default to PARTIAL_PROFILE only. Keep conversations going unless user explicitly leaves.

═══════════════════════════════════════════════════════════════
ZAMBIAN CONTEXT PARAGRAPH:
═══════════════════════════════════════════════════════════════

${getZambianContextParagraph()}

${hasCv ? `

═══════════════════════════════════════════════════════════════
CV CONTENT PROVIDED - USE TO INFORM QUESTIONS:
═══════════════════════════════════════════════════════════════

${cvContent.slice(0, 3000)}

Do NOT ask questions the CV already answers. Instead, ask: "I see from your CV that you have X experience. Tell me about the most challenging project in that area..."
` : ''}

${hasPartialProfile ? `

═══════════════════════════════════════════════════════════════
KNOWN PROFILE - DON'T RE-ASK THESE FIELDS:
═══════════════════════════════════════════════════════════════

${buildStudentProfileString(existingProfile as StudentProfile)}

Skip these fields in your questions. Build on them instead.
` : ''}

═══════════════════════════════════════════════════════════════
BE HUMAN. BE CURIOUS. KEEP THEM TALKING.
═══════════════════════════════════════════════════════════════`;

    // Call Gemini with rich context
    const result = await callGeminiWithFallback(systemPrompt, userMessage, {
      profile: existingProfile as StudentProfile,
      documents: cvContent ? [{ name: 'CV', category: 'CV / Resume', extractedText: cvContent }] : undefined,
    });

    // Parse markers from response
    const { reply: cleanedReply, profile: completeProfile } = extractProfileComplete(result.reply);
    const partialProfile = extractPartialProfile(result.reply) || extractProfileFields(cleanedReply);

    const response: ProfileChatResponse = {
      reply: cleanMarkdown(cleanedReply),
      isComplete: !!completeProfile,
      model: result.model,
      profileData: completeProfile || existingProfile,
      partialProfile,
    };

    logger.info('profile-chat', 'Response generated', {
      exchange: exchangeCount,
      isComplete: response.isComplete,
      hasPartialProfile: !!response.partialProfile,
    });

    return json(response, 200);
  } catch (error: any) {
    logger.error('profile-chat', `Error: ${error.message}`);
    return json({ error: error?.message || 'Failed to generate response' }, 500);
  }
}
```

### 2.2 Mobile Client Update

Update [artifacts/mobile/lib/aiService.ts](artifacts/mobile/lib/aiService.ts) to parse markers:

```typescript
async function invokeAI<T = unknown>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  // ... existing retry and slot logic ...

  try {
    const { data, error } = await supabase.functions.invoke('ai-service', {
      body: { action, ...(payload ?? {}) },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    // NEW: Parse markers from profile-chat response
    if (action === 'profile-chat' && data?.reply) {
      // Strip markers from display text
      let displayReply = data.reply
        .replace(/PARTIAL_PROFILE:[\s\S]*$/, '')
        .replace(/PROFILE_COMPLETE:[\s\S]*$/, '')
        .trim();

      // Extract PARTIAL_PROFILE
      const partialMatch = data.reply.match(/PARTIAL_PROFILE:\s*({[\s\S]*?})/);
      if (partialMatch) {
        try {
          const partialProfile = JSON.parse(partialMatch[1]);
          data.partialProfile = partialProfile;
          // Auto-save partial profile to local state here
        } catch (e) {
          console.error('Failed to parse PARTIAL_PROFILE', e);
        }
      }

      // Extract PROFILE_COMPLETE
      const completeMatch = data.reply.match(/PROFILE_COMPLETE:\s*({[\s\S]*?})/);
      if (completeMatch) {
        try {
          const completeProfile = JSON.parse(completeMatch[1]);
          data.isComplete = true;
          data.profileData = completeProfile;
        } catch (e) {
          console.error('Failed to parse PROFILE_COMPLETE', e);
        }
      }

      data.reply = displayReply;
    }

    return data as T;
  } catch (err: any) {
    // ... existing error handling ...
  }
}
```

### 2.3 Phase 2 Deliverables

- ✅ Enhanced `handleProfileChat` with CV-aware strategies
- ✅ Detailed 50+ line system prompt with conversation rules
- ✅ Marker extraction and parsing (`PARTIAL_PROFILE`, `PROFILE_COMPLETE`)
- ✅ Exchange counting (implicit from messages array)
- ✅ Mobile client updated to parse and strip markers
- ✅ Real-time profile accumulation logic
- ✅ Comprehensive logging

**Phase 2 Total:** ~150 LOC for handler + mobile client integration

---

## Phase 3: Advanced Features

**Duration:** 8-10 hours  
**Goal:** Implement three missing endpoints  
**Outcome:** STAR feedback, interview verdict, CV parsing

### 3.1 `handleStarFeedback`

```typescript
async function handleStarFeedback(body: StarFeedbackBody): Promise<Response> {
  try {
    const { question, situation, task, action, result, companyContext, cvContent } = body;

    // Validation
    if (!question?.trim() || !situation?.trim() || !task?.trim() || !action?.trim() || !result?.trim()) {
      throw new ValidationError('Missing STAR components (question, situation, task, action, result)');
    }

    const systemPrompt = `You are an experienced HR interview coach and recruiter. Your job is to evaluate STAR-format interview answers and provide constructive, specific feedback.

EVALUATION DIMENSIONS:
1. Clarity - Is the story easy to follow?
2. Relevance - Does it directly answer the question?
3. Specificity - Concrete details, numbers, outcomes?
4. Action Ownership - Did they take action or just observe?
5. Result Impact - What was the measurable outcome?
6. Learning - Does it show growth?

FEEDBACK STRUCTURE:
- Opening impression (1-2 sentences)
- Strengths (2-3 specific positives)
- Areas for improvement (2-3 specific suggestions)
- Reframed answer (show how to improve it)
- Score out of 10 with reasoning

Be encouraging but honest. The candidate is preparing for an interview.

${companyContext ? `\n\nCompany Context:\n${companyContext}\n\nAdjust feedback to show fit for this company.` : ''}

${cvContent ? `\n\nCandidate CV:\n${cvContent.slice(0, 1500)}\n\nNote any connections to their actual experience.` : ''}`;

    const userMessage = `Interview Question: "${question}"

SITUATION: ${situation}

TASK: ${task}

ACTION: ${action}

RESULT: ${result}

Please evaluate this STAR answer with specific, actionable feedback.`;

    const result_obj = await callGeminiWithFallback(systemPrompt, userMessage);

    // Parse score
    const scoreMatch = result_obj.reply.match(/Score[:\s]*(\d+)\s*\/\s*10/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 7;

    const response: StarFeedbackResponse = {
      feedback: cleanMarkdown(result_obj.reply),
      score: Math.min(10, Math.max(0, score)),
      model: result_obj.model,
    };

    logger.info('star-feedback', 'Feedback generated', { score: response.score });
    return json(response, 200);
  } catch (error: any) {
    logger.error('star-feedback', `Error: ${error.message}`);
    return json({ error: error?.message || 'Failed to evaluate STAR answer' }, 500);
  }
}
```

### 3.2 `handleInterviewVerdict`

```typescript
async function handleInterviewVerdict(body: InterviewVerdictBody): Promise<Response> {
  try {
    const { companyName, interviewAnswers, companyResearch, cvContent } = body;

    if (!companyName?.trim()) {
      throw new ValidationError('Company name is required');
    }

    if (!Array.isArray(interviewAnswers) || interviewAnswers.length === 0) {
      throw new ValidationError('No interview answers provided');
    }

    // Build QA transcript
    const qaTranscript = interviewAnswers
      .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
      .join('\n\n');

    const systemPrompt = `You are a strict HR recruitment panel evaluating a mock interview for a WIL placement/internship at ${companyName}.

EVALUATION CRITERIA:
1. Relevance - Answers address the actual questions
2. Depth - Specific examples and details
3. Communication - Clear, organized, confident
4. Technical Fit - Skills match requirements
5. Cultural Fit - Understanding of company
6. Potential - Can grow into the role
7. Authenticity - Genuine vs. rehearsed

VERDICT OPTIONS:
- ACCEPTED (8-10): Genuinely impressive, strong hire
- SHORTLISTED (6-7): Good effort, shows potential, needs improvement
- REJECTED (1-5): Significant gaps, not ready

For EACH answer provide:
- Score (1-10)
- Strengths
- Weaknesses

Then provide overall verdict, score, top 3 improvement areas, and specific recommendation.

${companyResearch ? `\n\nCompany Profile:\n${companyResearch}` : ''}

${cvContent ? `\n\nCandidate CV:\n${cvContent.slice(0, 2000)}\n\nVerify claims match CV. Flag discrepancies.` : ''}

Be HONEST and DIRECT. Most first attempts are shortlisted or rejected—that's normal.

Output as JSON.`;

    const userMessage = `Candidate Interview Answers:

${qaTranscript}

Provide a complete interview verdict with per-question scoring and overall recommendation in JSON format.`;

    const result = await callGeminiWithFallback(systemPrompt, userMessage);

    // Parse verdict JSON
    const verdictJSON = extractJSON<{
      answers?: Array<{ question: string; score: number; feedback: string }>;
      overall_score?: number;
      verdict?: string;
      top_improvements?: string[];
      recommendation?: string;
    }>(result.reply, {});

    const verdict = verdictJSON?.verdict?.toLowerCase() as 'accepted' | 'shortlisted' | 'rejected';
    const overallScore = verdictJSON?.overall_score ?? 6;

    const response: InterviewVerdictResponse = {
      verdict: ['accepted', 'shortlisted', 'rejected'].includes(verdict) ? verdict : 'shortlisted',
      score: overallScore,
      answers: verdictJSON?.answers ?? [],
      overallFeedback: result.reply,
      areasToImprove: verdictJSON?.top_improvements ?? [],
      recommendation: verdictJSON?.recommendation ?? '',
      model: result.model,
    };

    logger.info('interview-verdict', 'Verdict generated', {
      verdict: response.verdict,
      score: response.score,
    });

    return json(response, 200);
  } catch (error: any) {
    logger.error('interview-verdict', `Error: ${error.message}`);
    return json({ error: error?.message || 'Failed to evaluate interview' }, 500);
  }
}
```

### 3.3 `handleParseProfileFromCv`

```typescript
async function handleParseProfileFromCv(body: ParseProfileBody): Promise<Response> {
  try {
    const { cvContent } = body;

    if (!cvContent?.trim()) {
      throw new ValidationError('CV content is required');
    }

    const systemPrompt = `You are an expert CV parser. Extract structured profile information.

EXTRACT (return ONLY valid JSON, no explanation):
{
  "displayName": "Full name",
  "email": "Email or null",
  "phone": "Phone or null",
  "currentDegree": "Degree name",
  "institution": "University name",
  "yearOfStudy": "Year or graduation date",
  "city": "City/Location",
  "preferredIndustries": ["Tech", "Finance"],
  "careerGoals": "Career aspirations",
  "portfolioUrl": "Portfolio/GitHub URL or null",
  "profileFields": [
    { "category": "job", "value": "Job title at Company (dates)" },
    { "category": "skill", "value": "Technical skill" },
    { "category": "language", "value": "Language and proficiency" },
    { "category": "award", "value": "Award/achievement" },
    { "category": "certification", "value": "Professional certification" }
  ]
}

RULES:
- Extract EXACTLY what's in the CV
- For jobs: title, company, dates
- For skills: each skill separately
- For languages: include proficiency
- Include ALL achievements
- If field not in CV, set to null or empty array
- Default jobs/skills/languages as separate profileFields

CV:
${cvContent.slice(0, 5000)}`;

    const result = await callGeminiWithFallback(
      'You are a document parser. Extract structured data from CVs. Return ONLY valid JSON.',
      cvContent.slice(0, 2000)
    );

    const parsed = extractJSON<Record<string, unknown>>(result.reply);

    if (!parsed) {
      throw new APIError('Could not parse CV content. Ensure it is clear text.');
    }

    const response: ParsedProfileResponse = {
      displayName: (parsed.displayName as string) || '',
      email: (parsed.email as string) || undefined,
      phone: (parsed.phone as string) || undefined,
      currentDegree: (parsed.currentDegree as string) || undefined,
      institution: (parsed.institution as string) || undefined,
      yearOfStudy: (parsed.yearOfStudy as string) || undefined,
      city: (parsed.city as string) || undefined,
      preferredIndustries: (parsed.preferredIndustries as string[]) || undefined,
      careerGoals: (parsed.careerGoals as string) || undefined,
      portfolioUrl: (parsed.portfolioUrl as string) || undefined,
      profileFields: (parsed.profileFields as Array<{ category: string; value: string }>) || [],
      model: result.model,
    };

    logger.info('parse-profile-from-cv', 'Profile parsed', {
      name: response.displayName,
      fields_count: response.profileFields.length,
    });

    return json(response, 200);
  } catch (error: any) {
    logger.error('parse-profile-from-cv', `Error: ${error.message}`);
    return json({ error: error?.message || 'Failed to parse CV' }, 500);
  }
}
```

### 3.4 Update Main Router

Add three new cases to the switch statement:

```typescript
case 'star-feedback':
  return await handleStarFeedback(body as StarFeedbackBody);

case 'interview-verdict':
  return await handleInterviewVerdict(body as InterviewVerdictBody);

case 'parse-profile-from-cv':
  return await handleParseProfileFromCv(body as ParseProfileBody);
```

### 3.5 Phase 3 Deliverables

- ✅ `handleStarFeedback` - STAR answer evaluation with scoring
- ✅ `handleInterviewVerdict` - Full mock interview verdict (accepted/shortlisted/rejected)
- ✅ `handleParseProfileFromCv` - CV text parsing to structured profile
- ✅ Updated main router with three new endpoints
- ✅ Proper error handling and validation
- ✅ Structured logging for all three handlers

**Phase 3 Total:** ~250 LOC for three new handlers

---

## Phase 4: External API Integration

**Duration:** 8-12 hours  
**Goal:** Multi-source networking events with intelligent fallbacks  
**Outcome:** Real event data from Eventbrite, Serper, Tavily with Gemini grounding fallback

### 4.1 `fetchEventbriteEvents`

```typescript
async function fetchEventbriteEvents(
  city: string,
  query: string,
  apiKey: string
): Promise<NetworkingEvent[]> {
  logger.startTimer('eventbrite');

  if (!apiKey) {
    logger.warn('eventbrite', 'No API key configured');
    return [];
  }

  try {
    const normalizedCity = normalizeLocation(city);
    const url = new URL(API_ENDPOINTS.eventbrite);
    
    url.searchParams.append('q', query);
    url.searchParams.append('location.address', normalizedCity);
    url.searchParams.append('start_date.range_start', new Date().toISOString());
    url.searchParams.append('expand', 'venue');
    url.searchParams.append('page_size', '15');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.eventbrite);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.warn('eventbrite', `API returned ${res.status}`);
      return [];
    }

    const data = await res.json() as {
      events?: Array<{
        id: string;
        name: string;
        description?: { text?: string };
        start?: { utc?: string };
        venue?: { address?: { city?: string } };
        url?: string;
      }>;
    };

    const events = data.events?.map((e) => ({
      id: e.id || `eventbrite-${Date.now()}`,
      eventName: e.name || 'Untitled Event',
      eventType: 'conference',
      date: e.start?.utc || '',
      location: e.venue?.address?.city || 'Various',
      isOnline: false,
      description: e.description?.text?.slice(0, 200) || '',
      relevance: 0.8,
      source: 'eventbrite',
      url: e.url,
    })) || [];

    logger.endTimer('eventbrite', 'eventbrite-fetch', { count: events.length });
    return events;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('eventbrite', 'Request timed out');
    } else {
      logger.error('eventbrite', `Error: ${err.message}`);
    }
    return [];
  }
}
```

### 4.2 `fetchSerperEvents`

```typescript
async function fetchSerperEvents(
  query: string,
  apiKey: string
): Promise<NetworkingEvent[]> {
  logger.startTimer('serper');

  if (!apiKey) {
    logger.warn('serper', 'No API key configured');
    return [];
  }

  try {
    const searchQuery = `${query} networking events Zambia`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.serper);

    const res = await fetch(API_ENDPOINTS.serper, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: searchQuery,
        gl: 'zm',
        hl: 'en',
        num: 10,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.warn('serper', `API returned ${res.status}`);
      return [];
    }

    const data = await res.json() as {
      organic?: Array<{
        title: string;
        link: string;
        snippet: string;
        date?: string;
      }>;
    };

    const events = data.organic?.map((result, idx) => ({
      id: `serper-${idx}`,
      eventName: result.title || 'Event',
      eventType: 'webinar',
      date: result.date || '',
      location: 'Online/Various',
      isOnline: true,
      description: result.snippet || '',
      relevance: 0.7 - idx * 0.05,
      source: 'serper',
      url: result.link,
    })) || [];

    logger.endTimer('serper', 'serper-fetch', { count: events.length });
    return events;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('serper', 'Request timed out');
    } else {
      logger.error('serper', `Error: ${err.message}`);
    }
    return [];
  }
}
```

### 4.3 `fetchTavilyEvents`

```typescript
async function fetchTavilyEvents(
  query: string,
  apiKey: string
): Promise<NetworkingEvent[]> {
  logger.startTimer('tavily');

  if (!apiKey) {
    logger.warn('tavily', 'No API key configured');
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.tavily);

    const zambianDomains = [
      'eventbrite.com', 'meetup.com', 'lusakatimes.com', 'dailymail.co.zm',
      'times.co.zm', 'znbc.co.zm', 'zica.co.zm', 'eiz.org.zm', 'unza.zm',
      'cbu.ac.zm', 'africarena.com', 'careersafrica.com', 'linkedin.com',
    ];

    const res = await fetch(API_ENDPOINTS.tavily, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${query} Zambia networking events conference`,
        search_depth: 'advanced',
        max_results: 10,
        include_domains: zambianDomains,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.warn('tavily', `API returned ${res.status}`);
      return [];
    }

    const data = await res.json() as {
      results?: Array<{
        title: string;
        url: string;
        content: string;
        published_date?: string;
      }>;
    };

    const events = data.results?.map((result, idx) => ({
      id: `tavily-${idx}`,
      eventName: result.title || 'Event',
      eventType: 'conference',
      date: result.published_date || '',
      location: 'Zambia',
      isOnline: result.content?.toLowerCase().includes('online'),
      description: result.content?.slice(0, 200) || '',
      relevance: 0.85 - idx * 0.05,
      source: 'tavily',
      url: result.url,
    })) || [];

    logger.endTimer('tavily', 'tavily-fetch', { count: events.length });
    return events;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('tavily', 'Request timed out');
    } else {
      logger.error('tavily', `Error: ${err.message}`);
    }
    return [];
  }
}
```

### 4.4 Enhanced `handleNetworkingEvents`

```typescript
async function handleNetworkingEvents(body: NetworkingEventsBody): Promise<Response> {
  try {
    const { location, interests, goals } = body;
    const city = normalizeLocation(location || 'Lusaka, Zambia');

    const eventbriteKey = Deno.env.get('EVENTBRITE_API_KEY') || '';
    const serperKey = Deno.env.get('SERPER_API_KEY') || '';
    const tavilyKey = Deno.env.get('TAVILY_API_KEY') || '';

    logger.info('networking-events', 'Starting multi-source event search', { city, interests });

    // Parallel API calls
    const [eventbriteEvents, serperEvents, tavilyEvents] = await Promise.all([
      fetchEventbriteEvents(city, interests || 'career development', eventbriteKey),
      fetchSerperEvents(interests || 'networking events', serperKey),
      fetchTavilyEvents(interests || 'professional development', tavilyKey),
    ]);

    // Aggregate
    const allEvents = [...eventbriteEvents, ...serperEvents, ...tavilyEvents];
    
    // Deduplicate by name similarity
    const uniqueEvents = Array.from(
      new Map(
        allEvents.map((e) => [
          e.eventName.toLowerCase().replace(/\s+/g, ''),
          e,
        ])
      ).values()
    );

    // Sort by relevance
    uniqueEvents.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

    // Get top 12-15
    let topEvents = uniqueEvents.slice(0, 15);

    // If few events, use Gemini grounding
    if (topEvents.length < 5) {
      logger.info('networking-events', 'Few external events, using Gemini grounding');

      const geminiPrompt = `Suggest 5-10 professional networking events or webinars for ${interests || 'career development'} in Zambia or online.

For each: name, type, approximate dates, location, why it matters.`;

      try {
        const geminiResult = await callGeminiWithFallback(
          'You are a career networking advisor. Suggest real, valuable opportunities.',
          geminiPrompt
        );

        const geminiEvent: NetworkingEvent = {
          id: 'gemini-suggestions',
          eventName: 'Gemini AI Suggestions',
          eventType: 'other',
          location: city,
          isOnline: false,
          description: geminiResult.reply.slice(0, 300),
          relevance: 0.6,
          source: 'gemini',
        };

        topEvents.push(geminiEvent);
      } catch (err: any) {
        logger.warn('networking-events', `Gemini fallback failed: ${err.message}`);
      }
    }

    const sources = Array.from(new Set(topEvents.map((e) => e.source)));

    const response: NetworkingEventsResponse = {
      events: topEvents,
      totalFound: allEvents.length,
      sources,
    };

    logger.info('networking-events', 'Events compiled', {
      total: response.events.length,
      sources: response.sources,
    });

    return json(response, 200);
  } catch (error: any) {
    logger.error('networking-events', `Error: ${error.message}`);
    return json({ error: error?.message || 'Failed to find events' }, 500);
  }
}
```

### 4.5 Phase 4 Deliverables

- ✅ `fetchEventbriteEvents` - Eventbrite API integration with timeout
- ✅ `fetchSerperEvents` - Serper.dev Google Search integration
- ✅ `fetchTavilyEvents` - Tavily advanced search with Zambian domains
- ✅ Enhanced `handleNetworkingEvents` with parallel API calls
- ✅ Aggregation and deduplication logic
- ✅ Fallback to Gemini grounding when external APIs fail
- ✅ Structured logging and error handling

**Phase 4 Total:** ~430 LOC for API clients and aggregation

---

## Phase 5: Polish & Optimization

**Duration:** 6-8 hours  
**Goal:** Add remaining utilities, health check, comprehensive documentation  
**Outcome:** Production-ready edge function

### 5.1 `handleHealthCheck`

```typescript
async function handleHealthCheck(): Promise<Response> {
  const checks = {
    gemini: !!Deno.env.get('GEMINI_API_KEY'),
    eventbrite: !!Deno.env.get('EVENTBRITE_API_KEY'),
    serper: !!Deno.env.get('SERPER_API_KEY'),
    tavily: !!Deno.env.get('TAVILY_API_KEY'),
  };

  const allConfigured = Object.values(checks).some((v) => v);

  const response = {
    status: allConfigured ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: checks,
  };

  logger.info('health-check', 'Health check performed', checks);

  return json(response, allConfigured ? 200 : 503);
}
```

### 5.2 Final Main Router

```typescript
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Health check endpoint
    if (req.url.endsWith('/health')) {
      return await handleHealthCheck();
    }

    const body = await req.json();
    const action = body?.action as string | undefined;

    logger.info('ai-service', `Action invoked: ${action}`);

    if (!action) {
      throw new ValidationError('Missing body.action');
    }

    switch (action) {
      // Profile & Chat
      case 'profile-chat':
        return await handleProfileChat(body as ProfileChatBody);
      case 'hybrid-chat':
        return await handleHybridChat(body);
      
      // Embeddings
      case 'embed':
        return await handleEmbedding(body);
      case 'similarity-search':
        return await handleSimilaritySearch(body);
      
      // Career Prep
      case 'draft-letter':
        return await handleDraftLetter(body);
      case 'discover-companies':
        return await handleDiscoverCompanies(body);
      case 'interview-questions':
        return await handleInterviewQuestions(body);
      case 'research-company':
        return await handleResearchCompany(body);
      case 'extract-content':
        return await handleExtractContent(body);
      
      // Interview Evaluation
      case 'star-feedback':
        return await handleStarFeedback(body as StarFeedbackBody);
      case 'interview-verdict':
        return await handleInterviewVerdict(body as InterviewVerdictBody);
      
      // Profile Parsing
      case 'parse-profile-from-cv':
        return await handleParseProfileFromCv(body as ParseProfileBody);
      
      // Networking
      case 'networking-events':
        return await handleNetworkingEvents(body as NetworkingEventsBody);

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    const statusCode = error?.statusCode ?? 500;
    const errorCode = error?.code ?? 'UNKNOWN_ERROR';
    const message = error?.message || 'Internal Server Error';

    logger.error('ai-service', `Unhandled error: ${message}`, {
      code: errorCode,
      status: statusCode,
      stack: error?.stack?.slice(0, 200),
    });

    return json(
      {
        error: message,
        code: errorCode,
        timestamp: new Date().toISOString(),
      },
      statusCode
    );
  }
});
```

### 5.3 Environment Variables

**Add to Supabase Secrets:**

```bash
GEMINI_API_KEY=sk-...                    # Google Gemini API key
EVENTBRITE_API_KEY=...                   # Eventbrite API token
SERPER_API_KEY=...                       # Serper.dev API key
TAVILY_API_KEY=...                       # Tavily API key
```

### 5.4 Code Organization

**Final directory structure:**

```
supabase/functions/ai-service/
├── index.ts                              [~500 LOC] Main handler & router
├── deno.json                             [Config]
├── utils/
│   ├── constants.ts                      [~100 LOC] Models, endpoints, Zambian context
│   ├── types.ts                          [~200 LOC] All TypeScript interfaces
│   ├── logger.ts                         [~60 LOC] Structured logging
│   ├── errors.ts                         [~50 LOC] Error hierarchy
│   ├── context.ts                        [~120 LOC] Context assembly
│   ├── formatters.ts                     [~150 LOC] JSON extraction, markdown cleaning
│   └── batch.ts                          [~40 LOC] Batch processing
├── handlers/
│   ├── profileChat.ts                    [~150 LOC] Enhanced profile chat
│   ├── hybridChat.ts                     [~80 LOC] Text + embeddings
│   ├── embeddings.ts                     [~60 LOC] Embedding generation
│   ├── similaritySearch.ts               [~80 LOC] Similarity scoring
│   ├── starFeedback.ts                   [~70 LOC] STAR answer evaluation
│   ├── interviewVerdict.ts               [~100 LOC] Mock interview panel
│   ├── parseProfileFromCv.ts             [~80 LOC] CV parsing
│   ├── networkingEvents.ts               [~200 LOC] Multi-source events
│   ├── draftLetter.ts                    [~80 LOC] Letter generation
│   ├── discoverCompanies.ts              [~90 LOC] Company discovery
│   ├── interviewQuestions.ts             [~90 LOC] Question generation
│   ├── extractContent.ts                 [~70 LOC] Document extraction
│   ├── researchCompany.ts                [~70 LOC] Company research
│   └── health.ts                         [~20 LOC] Health check
└── apis/
    ├── eventbrite.ts                     [~80 LOC] Eventbrite client
    ├── serper.ts                         [~70 LOC] Serper client
    └── tavily.ts                         [~80 LOC] Tavily client
```

**Total:** ~2,400 LOC across organized modules

### 5.5 Phase 5 Deliverables

- ✅ `handleHealthCheck` endpoint
- ✅ Batch processing utilities
- ✅ Final main router with all 14 endpoints
- ✅ Comprehensive error handling
- ✅ Structured logging throughout
- ✅ JSDoc comments on all handlers
- ✅ Code organization and modularity
- ✅ Environment variables documentation

**Phase 5 Total:** ~120 LOC + comprehensive organization

---

## Deployment & Rollout

### Pre-Deployment Checklist

- [ ] All 7 utility files created and tested
- [ ] Phase 1: Foundation tests passing
- [ ] Phase 2: Profile chat with markers working in sandbox
- [ ] Phase 3: Three new endpoints (STAR, Verdict, CV Parse) functional
- [ ] Phase 4: External APIs responding with fallbacks working
- [ ] Phase 5: Health check and organization complete
- [ ] TypeScript: Zero compilation errors
- [ ] Secrets: All API keys configured in Supabase
- [ ] Mobile client: Updated to parse markers
- [ ] Documentation: Complete with examples

### Deployment Steps

1. **Backup current function:**
   ```bash
   cp edge-function-ai-service.ts edge-function-ai-service.backup.ts
   ```

2. **Organize new code:**
   - Create `supabase/functions/ai-service/utils/` directory
   - Create `supabase/functions/ai-service/handlers/` directory
   - Create `supabase/functions/ai-service/apis/` directory
   - Move utility files to `utils/`
   - Move handler functions to `handlers/`
   - Move API client functions to `apis/`

3. **Update main `index.ts`:**
   - Import all utilities and handlers
   - Update router with 14 cases
   - Add `/health` check logic

4. **Configure secrets in Supabase:**
   ```bash
   supabase secrets set GEMINI_API_KEY "sk-..."
   supabase secrets set EVENTBRITE_API_KEY "..."
   supabase secrets set SERPER_API_KEY "..."
   supabase secrets set TAVILY_API_KEY "..."
   ```

5. **Deploy to staging:**
   - Test with subset of users
   - Monitor logs for 24-48 hours
   - Verify all endpoints functional
   - Check API latencies

6. **Gradual rollout:**
   - 25% of users for 24 hours
   - 50% of users for 24 hours
   - 100% of users

7. **Rollback procedure (if needed):**
   - Restore `edge-function-ai-service.backup.ts`
   - Redeploy
   - Notify users

### Post-Deployment Monitoring

- Monitor error rates per action
- Track API latencies (Eventbrite, Serper, Tavily)
- Check Gemini API quota usage
- Review logs for timeout occurrences
- Monitor Supabase function metrics
- Track user feedback on new features

---

## Testing & Validation

### Unit Tests

**Utilities (Phase 1):**
```typescript
// utils/formatters.test.ts
test('extractJSON parses markdown code blocks', () => {
  const md = '```json\n{"name": "John"}\n```';
  expect(extractJSON(md)).toEqual({ name: 'John' });
});

test('cleanMarkdown removes formatting', () => {
  const text = '**Bold** and *italic* and `code`';
  expect(cleanMarkdown(text)).toBe('Bold and italic and code');
});

test('extractProfileFields extracts name and skills', () => {
  const text = 'Name: John\nSkills: React, Node.js';
  const fields = extractProfileFields(text);
  expect(fields.displayName).toBe('John');
  expect(fields.skills).toContain('React');
});
```

**Profile Chat (Phase 2):**
```typescript
test('Profile chat response excludes markers from reply', async () => {
  const response = await handleProfileChat({
    message: 'Hi',
    messages: [],
    existingProfile: {},
  });
  const data = JSON.parse(response.body);
  expect(data.reply).not.toContain('PARTIAL_PROFILE');
});

test('Profile chat parses PARTIAL_PROFILE marker', async () => {
  const response = await handleProfileChat({...});
  const data = JSON.parse(response.body);
  expect(data.partialProfile).toBeDefined();
  expect(data.partialProfile.displayName).toBeTruthy();
});
```

**STAR Feedback (Phase 3):**
```typescript
test('STAR feedback returns score 1-10', async () => {
  const response = await handleStarFeedback({
    question: 'Tell me about a time...',
    situation: '...',
    task: '...',
    action: '...',
    result: '...',
  });
  const data = JSON.parse(response.body);
  expect(data.score).toBeGreaterThanOrEqual(1);
  expect(data.score).toBeLessThanOrEqual(10);
});
```

**API Integration (Phase 4):**
```typescript
test('Eventbrite API returns events array', async () => {
  const events = await fetchEventbriteEvents('Lusaka', 'career', 'api-key');
  expect(Array.isArray(events)).toBe(true);
  if (events.length > 0) {
    expect(events[0]).toHaveProperty('eventName');
    expect(events[0]).toHaveProperty('source', 'eventbrite');
  }
});

test('Networking events aggregates from multiple sources', async () => {
  const response = await handleNetworkingEvents({
    location: 'Lusaka',
    interests: 'tech',
  });
  expect(Array.isArray(response.events)).toBe(true);
  expect(response.sources).toBeDefined();
});
```

### Integration Tests

- **Profile Chat Flow:** 20+ exchanges, verify PARTIAL_PROFILE extracted
- **Interview Flow:** STAR answer → feedback → full verdict
- **CV Parsing Flow:** Upload CV → parse → extract fields → use in profile chat
- **Networking Flow:** Request events → aggregate from 3 sources → fallback to Gemini
- **Error Handling:** Disable API keys → verify graceful degradation
- **Timeout Scenarios:** Simulate slow API → verify 50-60s limit

### Manual Testing Checklist

- [ ] Profile Chat: Have 20+ exchange conversation, verify live profile updates
- [ ] Profile Chat: Upload CV, verify CV-aware opening
- [ ] STAR Feedback: Submit complete STAR answer, verify score + feedback
- [ ] Interview Verdict: Submit 5 Q&A pairs, verify verdict accuracy
- [ ] CV Parsing: Upload real CV, verify all fields extracted
- [ ] Networking Events: Request in "Lusaka", verify results from multiple sources
- [ ] Health Check: Call `/health`, verify service status
- [ ] Error Handling: Disable Eventbrite key, verify fallback to Serper
- [ ] Timeout: Simulate slow API, verify completes within 50s

---

## Summary by Phase

| # | Phase | Duration | Lines | Key Deliverables |
|---|-------|----------|-------|------------------|
| 1 | Foundation | 6-8h | ~720 | 7 utilities + refactored main |
| 2 | Profile Chat | 8-10h | ~150 | Enhanced handler with markers |
| 3 | Advanced Features | 8-10h | ~250 | STAR, Verdict, CV Parse |
| 4 | External APIs | 8-12h | ~430 | Eventbrite, Serper, Tavily |
| 5 | Polish | 6-8h | ~120 | Health check, docs, organization |
| **TOTAL** | | **40-60h** | **~2,400** | **14 endpoints, 4 data sources** |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Gemini quota exceeded | Medium | High | Request queueing, batch processing, rate limiting |
| External API failures | Low-Med | Med | Fallback chain: Eventbrite→Serper→Tavily→Gemini |
| Timeout on slow networks | Low | Low | 50-60s timeout; mobile client handles gracefully |
| CV parsing accuracy | Low | Low | Fallback to text extraction if JSON fails |
| Profile marker parsing fails | Low | Med | Fallback to regex field extraction |
| High latency on APIs | Medium | Low | Parallel requests, separate timeouts |

---

## Next Steps

1. **Review this plan** with team
2. **Estimate effort** per phase
3. **Assign developers**
4. **Start Phase 1** this week
5. **Complete one phase per week**
6. **Deploy to staging** after Phase 5
7. **Gradual rollout** to production

---

**Plan Status:** ✅ Ready for Implementation  
**Created:** May 23, 2026  
**Version:** 1.0  
**Estimated Total Effort:** 40-60 hours (implementation) + 4-8 hours (testing) + 2-4 hours (deployment)
