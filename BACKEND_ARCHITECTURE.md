# Career Compass — Backend Architecture & How It Works

> **Document Version:** 1.0  
> **Last Updated:** 23 May 2026  
> **Purpose:** Complete technical documentation of how the Career Compass backend functions — from AI-powered features to data storage, external API integrations, and mobile-to-server communication.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Dual-API Pattern (Express + Supabase Edge Function)](#2-the-dual-api-pattern)
3. [Gemini AI Integration Layer](#3-gemini-ai-integration-layer)
4. [Feature: Discover Companies](#4-feature-discover-companies)
5. [Feature: Research Company](#5-feature-research-company)
6. [Feature: Draft Letter](#6-feature-draft-letter)
7. [Feature: Interview Questions Generator](#7-feature-interview-questions-generator)
8. [Feature: STAR Feedback (Interview Verdict)](#8-feature-star-feedback--interview-verdict)
9. [Feature: Networking Events Finder](#9-feature-networking-events-finder)
10. [Feature: Parse Profile from CV](#10-feature-parse-profile-from-cv)
11. [Feature: Profile Chat (Conversational Profile Builder)](#11-feature-profile-chat)
12. [Feature: Document Content Extraction](#12-feature-document-content-extraction)
13. [Mobile App → Backend Communication](#13-mobile-app--backend-communication)
14. [External API Integrations](#14-external-api-integrations)
15. [Data Storage & Persistence](#15-data-storage--persistence)
16. [Error Handling & Resilience](#16-error-handling--resilience)
17. [Notifications System](#17-notifications-system)
18. [Batch Processing Utilities](#18-batch-processing-utilities)
19. [Database Schema](#19-database-schema)
20. [Environment Variables Reference](#20-environment-variables-reference)

---

## 1. Architecture Overview

The Career Compass backend is a **dual-architecture** system:

| Component | Technology | Role |
|---|---|---|
| **Express API Server** | Node.js + Express + TypeScript | Runs on Replit; handles AI routes via Gemini SDK, file storage, health checks |
| **Supabase Edge Function** | Deno (TypeScript) | Runs on Supabase; deployed independently; handles all AI routes that the mobile app calls |
| **Google Gemini AI** | `@google/genai` SDK / REST API | The core AI engine — powers all intelligent features |
| **Supabase** | PostgreSQL + Row Level Security | Data persistence for profiles, applications, contacts, events, documents |
| **Expo/React Native** | Client-side mobile app | Calls the Supabase Edge Function for all AI operations |

**Key Design Principle:** The mobile app talks exclusively to the **Supabase Edge Function**. The Express server exists as a development/prototyping server on Replit. Both implement identical AI logic, but the Supabase Edge Function is the production deployment.

---

## 2. The Dual-API Pattern

### 2.1 Express API Server (`artifacts/api-server/src/`)

The Express server is a traditional Node.js HTTP server:

```
app.ts          ← Express app setup (cors, JSON parsing, logging)
routes/
├── index.ts    ← Route aggregator
├── health.ts   ← Health check endpoint
├── ai.ts       ← ALL AI-powered routes (874 lines)
└── storage.ts  ← Document content extraction
lib/
├── logger.ts   ← Pino logger
├── objectStorage.ts  ← GCS / Replit Object Storage integration
└── objectAcl.ts      ← Access control for stored objects
```

- **AI routes** use the `@workspace/integrations-gemini-ai` package (GoogleGenAI SDK)
- **Storage routes** use Google Cloud Storage via Replit's sidecar
- Listens on a port managed by Replit

### 2.2 Supabase Edge Function (`supabase/functions/ai-service/index.ts`)

A **Deno-based** edge function that mirrors all the Express AI routes but:

- Calls Gemini via **raw REST API** (no SDK — uses `fetch()` directly)
- Reads API keys from `Deno.env.get()` environment variables
- Handles CORS manually
- Runs on Supabase's global edge network
- The mobile app's primary backend (746 lines)

**Path Normalization:** The edge function normalizes incoming URLs so it accepts both:
```
/functions/v1/ai-service/api/ai/discover-companies   ← Supabase function URL
/career-ai/api/ai/discover-companies                 ← App requests
```

### 2.3 Route Table (Both Servers)

| Route | HTTP Method | Description |
|---|---|---|
| `/api/ai/discover-companies` | POST | Find WIL/internship companies |
| `/api/ai/draft-letter` | POST | Generate application letter |
| `/api/ai/research-company` | POST | Research a specific company |
| `/api/ai/star-feedback` | POST | Evaluate STAR interview answer |
| `/api/ai/interview-questions` | POST | Generate 15 interview questions |
| `/api/ai/parse-profile-from-cv` | POST | Extract profile from CV text |
| `/api/ai/profile-chat` | POST | Conversational profile builder |
| `/api/ai/networking-events` | POST | Find networking events |
| `/api/ai/interview-verdict` | POST | Full mock interview evaluation |
| `/api/storage/extract-content` | POST | Extract text from uploaded documents |

---

## 3. Gemini AI Integration Layer

### 3.1 Client Package (`lib/integrations-gemini-ai/`)

```
lib/integrations-gemini-ai/
├── src/
│   ├── index.ts           ← Public exports
│   ├── client.ts          ← Main Gemini client (GoogleGenAI SDK proxy)
│   ├── image/
│   │   ├── index.ts       ← Image generation export
│   │   └── client.ts      ← Image generation client (separate instance)
│   └── batch/
│       ├── index.ts       ← Batch processing exports
│       └── utils.ts       ← Batch processing with rate limiting & retries
```

### 3.2 Client Initialization (`client.ts`)

The Gemini client uses a **lazy singleton proxy pattern**:

```typescript
// Creates a Proxy around GoogleGenAI that lazily initializes on first use
export const ai = new Proxy({} as GoogleGenAI, {
  get(_, prop) {
    return (getAi() as any)[prop];
  },
});
```

The `getAi()` function supports **two authentication modes**:

1. **Replit AI Proxy** (preferred) — uses `AI_INTEGRATIONS_GEMINI_BASE_URL` + `AI_INTEGRATIONS_GEMINI_API_KEY`
2. **Direct Google API Key** — uses `GEMINI_API_KEY` directly

### 3.3 Supabase Edge Function Gemini Client

The edge function uses **raw REST** to Gemini's API:

```typescript
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";
const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
```

It constructs contents as either:
- **String prompt** → wrapped into `[{ role: "user", parts: [{ text: prompt }] }]`
- **Multi-part** → for document extraction (text + inlineData with base64 file content)
- **Google Search grounding** → adds `{ tools: [{ google_search: {} }] }` when no external search results exist

### 3.4 Image Generation (`image/client.ts`)

A **separate** `GoogleGenAI` instance is used for image generation. It requires `AI_INTEGRATIONS_GEMINI_BASE_URL` and `AI_INTEGRATIONS_GEMINI_API_KEY` (Replit proxy only).

The `generateImage()` function:
- Uses model `gemini-2.5-flash-image`
- Sets `responseModalities: [Modality.TEXT, Modality.IMAGE]`
- Returns `{ b64_json, mimeType }` from the first inline image part in the response

### 3.5 Model Used

**All AI features use:** `gemini-2.5-flash`

This model provides a good balance of speed, quality, and cost for the chat-based and text-generation workloads.

---

## 4. Feature: Discover Companies

**Routes:** `/api/ai/discover-companies`  
**Purpose:** Finds 8 real organisations offering Work-Integrated Learning (WIL), graduate programmes, or internships based on the student's profile.

### Input (`DiscoverCompaniesBody`)
```typescript
{
  locationText: string;        // City/area name
  latitude?: number;           // GPS coordinates (optional)
  longitude?: number;
  degree: string;              // e.g. "BSc Computer Science"
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  city?: string;
  preferredIndustries?: string;
  goals?: string;
  documentsContext?: string;   // Extracted text from uploaded documents
}
```

### How It Works

1. **Builds a student profile string** from the provided fields (institution, year, skills, city, industries, goals)
2. **Includes document context** if the student uploaded CV/certificates
3. **Determines location** — checks if the location is Zambian by regex matching common city names
4. **Generates a detailed prompt** to Gemini with:
   - Student profile summary
   - GPS coordinates if available
   - Zambian-specific guidance for local locations (mentions professional bodies like EIZ, ZICA, ICTAZ, ZIPS, LAZ)
   - International guidance for non-Zambian locations
5. **Parses JSON array** from Gemini's response using regex (`/\[[\s\S]*\]/`)
6. **Returns** an array of 8 company objects:

```typescript
{
  name: string;           // Organisation name
  description: string;    // 2-3 sentence description + WIL details
  fitScore: string;       // "Excellent Fit" | "Strong Fit" | "Good Fit"
  website: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  facebook: string | null;
  twitter: string | null;
}
```

### Key Design Decisions

- **Wide net casting** — includes companies, NGOs, government agencies, hospitals, universities
- **Zambian context awareness** — professional body mentions, local company knowledge
- **Contact enrichment** — AI is instructed to include as many contact fields as possible

---

## 5. Feature: Research Company

**Routes:** `/api/ai/research-company`  
**Purpose:** Provides a comprehensive research summary about a specific company in the Zambian context.

### Input (`ResearchCompanyBody`)
```typescript
{
  companyName: string;
}
```

### How It Works

1. Sends a prompt asking Gemini to write a concise research summary about the company
2. The response covers **5 sections** in plain text:
   - **Overview** — what the company does, size, presence in Zambia
   - **Industry & Sector** — industry, Zambian regulatory/sector bodies
   - **Culture & Values** — workplace culture, what they look for
   - **WIL / Graduate Programmes** — known placements, graduate programmes, bursaries, internships
   - **Interview Tips** — 2-3 specific tips for interviewing at this company in Zambia
3. Returns `{ summary: "..." }`

### Key Design Decisions

- Uses **plain paragraphs** (no markdown, no bullet points) for clean mobile display
- Focused specifically on **Zambian context** — regulatory bodies, local presence
- Practical advice for students applying for WIL placements

---

## 6. Feature: Draft Letter

**Routes:** `/api/ai/draft-letter`  
**Purpose:** Generates a complete, professionally formatted Zambian-style application letter.

### Input (`DraftLetterBody`)
```typescript
{
  companyName: string;
  role: string;
  degree: string;
  goals: string;
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  portfolioUrl?: string;
  userDraft?: string;         // Student's own draft to polish
  letterType: string;         // "attachment" | "internship" | "graduate" | "wil"
  studentName?: string;
  studentPhone?: string;
  studentEmail?: string;
  studentCity?: string;
  cvContent?: string;         // Extracted CV text for personalization
}
```

### How It Works

1. **Determines opportunity label** based on letterType (e.g., "industrial attachment", "internship", "graduate programme")
2. **Generates subject line** (e.g., "RE: APPLICATION FOR INDUSTRIAL ATTACHMENT")
3. **Calculates today's date** in Zambian locale format (`en-ZM`)
4. **Creates student header block** — name, institution, city, phone, email, date
5. **Builds a detailed prompt** specifying:
   - **Full Zambian letter format** with 13 structural steps:
     1. Student details (one per line)
     2. Date
     3. Blank line
     4. "The Human Resource Manager" → Company Name → City
     5. Blank line
     6. "Dear Sir/Madam,"
     7. Blank line
     8. Subject line
     9. Blank line
     10. Body (3-4 paragraphs)
     11. Blank line
     12. "Yours sincerely," or "Yours faithfully,"
     13. Student name in CAPS
   - **Zambian professional standards**:
     - British English spelling ("organisation", "programme", "favour")
     - Formal but warm tone
     - TEVETA qualifications support
     - No bullet points or markdown in body
6. **CV content injection** — uses specific details from uploaded CV to personalize the letter
7. **Draft polishing** — if student provides their own draft, the AI polishes it while keeping the student's voice
8. Returns `{ letter: "..." }` — the complete formatted letter text

### Key Design Decisions

- **No JSON or markdown** in response — returns pure text letter
- **Portfolio mention** — if a portfolio URL is provided, it's naturally woven into the letter
- **Zambian-specific** — uses "industrial attachment" terminology, TEVETA qualifications, local date format

---

## 7. Feature: Interview Questions Generator

**Routes:** `/api/ai/interview-questions`  
**Purpose:** Generates 15 realistic interview questions for a WIL placement interview.

### Input (`InterviewQuestionsBody`)
```typescript
{
  companyName: string;
  role: string;
  degree: string;
  goals: string;
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  researchSummary?: string;   // From the Research Company feature
  cvContent?: string;
}
```

### How It Works

1. **Builds student profile context** from inputs
2. **Includes company research** if available — contextualizes questions
3. **Includes CV content** — tailors questions to the student's actual experience
4. **Sends a detailed prompt** asking for 15 questions split into three categories:
   - **Personal (5)** — background, motivation, strengths, weaknesses, goals, WIL-specific
   - **Company (5)** — knowledge of the company and Zambian industry context
   - **Experience (5)** — academic projects, teamwork, problem-solving, technical skills
5. **Parses JSON** using regex (`/\{[\s\S]*\}/`)
6. Returns:
```typescript
{
  personal: string[];     // 5 questions
  company: string[];      // 5 questions
  experience: string[];   // 5 questions
}
```

### Key Design Decisions

- **CV-tailored** — experience questions probe actual content on the student's CV
- **Skills-probing** — if skills are provided, questions specifically target those skills in the experience category
- **Company-aware** — uses research summary to create informed company questions

---

## 8. Feature: STAR Feedback & Interview Verdict

### 8.1 STAR Feedback (`/api/ai/star-feedback`)

**Purpose:** Evaluates a single STAR-format interview answer.

**Input:**
```typescript
{
  question: string;     // Interview question
  situation: string;
  task: string;
  action: string;
  result: string;
}
```

**How It Works:**
1. Sends prompt with the candidate's STAR answer broken into its four components
2. AI provides structured feedback covering:
   - Overall impression
   - What worked well
   - What to improve
   - Suggested stronger version of the Result
   - Score out of 10 with justification
3. Returns `{ feedback: "..." }` — encouraging but direct feedback

### 8.2 Interview Verdict (`/api/ai/interview-verdict`)

**Purpose:** Full mock interview evaluation, simulating a real HR/recruitment panel.

**Input (`InterviewVerdictBody`):**
```typescript
{
  companyName: string;
  role: string;
  degree: string;
  goals: string;
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  city?: string;
  questions: string[];      // The questions asked
  answers: string[];        // The student's answers
  researchSummary?: string; // Company research context
  cvContent?: string;
}
```

**How It Works:**

1. **Builds QA transcript** — pairs each question with the student's answer
2. **Includes company context** if research was done
3. **Includes CV content** — evaluates whether answers align with claimed experience
4. **Prompt instructs the AI** to be "STRICT and HONEST — do not soften criticism"
5. **Assesses 5 dimensions:**
   - Relevance and depth of answers
   - Communication clarity and structure
   - Field knowledge and Zambian industry awareness
   - Career clarity, enthusiasm, motivation
   - Overall fit for WIL/internship/graduate programme
6. **Parses JSON** and returns:
```typescript
{
  verdict: "accepted" | "shortlisted" | "rejected";
  overallScore: number;         // 1-10
  overallFeedback: string;      // Honest 2-3 sentences
  strengths: string[];         // Specific strengths
  areasToImprove: string[];    // Actionable improvements
  answerFeedback: Array<{
    question: string;
    answer: string;
    feedback: string;          // Honest 1-2 sentences
    score: number;             // 1-10
  }>;
  recommendation: string;      // Personal, specific recommendation
}
```

**Scoring Thresholds:**
- **accepted** = overall score 8-10 (genuinely impressive)
- **shortlisted** = 6-7 (good effort, needs improvement)
- **rejected** = 1-5 (needs significant work)

### Key Design Decisions

- **Realistic grading** — most first attempts result in "shortlisted" or "rejected"
- **CV-grounding** — ensures answers match actual experience, not fabricated claims
- **Per-question feedback** — specific scores for each answer
- **Actionable** — areas for improvement are specific, not generic

---

## 9. Feature: Networking Events Finder

**Routes:** `/api/ai/networking-events`  
**Purpose:** Finds real, upcoming networking and professional development opportunities for Zambian students.

**Architecture:** This is the most complex feature with **4 parallel data sources** working together.

### Input (`FindNetworkingEventsBody`)
```typescript
{
  city?: string;
  degree?: string;
  preferredIndustries?: string;
  goals?: string;
}
```

### Data Source Architecture

```
                    ┌─────────────────┐
                    │  Student Request │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Profile Context │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
       │  Eventbrite  │ │  Serper  │ │   Tavily    │
       │    (API)    │ │ (Google) │ │  (AI Search)│
       └──────┬──────┘ └────┬────┘ └──────┬──────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │  External Data  │
                    │  (or empty if   │
                    │   all fail)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Gemini 2.5     │
                    │  + Google       │
                    │  Search (if no  │
                    │  external data) │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  JSON array of  │
                    │  8-15 events    │
                    └─────────────────┘
```

### 9.1 Eventbrite API (`fetchEventbriteEvents`)

```typescript
async function fetchEventbriteEvents(city: string, query: string): Promise<string>
```

- **Endpoint:** `https://www.eventbriteapi.com/v3/events/search/`
- **Query params:** `q`, `location.address`, `start_date.range_start`, `expand=venue`, `page_size=15`
- **Auth:** Bearer token from `EVENTBRITE_API_KEY`
- **Timeout:** 10 seconds
- **Returns:** Structured event data (name, date, location, URL, description)
- **Location logic:** If city is specified and not "Zambia", uses `"{city}, Zambia"`; otherwise defaults to "Lusaka, Zambia"

### 9.2 Serper.dev API (`fetchSerperEvents`)

```typescript
async function fetchSerperEvents(query: string): Promise<string>
```

- **Endpoint:** `https://google.serper.dev/search`
- **Query params:** `q`, `gl: "zm"` (geolocation Zambia), `hl: "en"`, `num: 10`
- **Auth:** X-API-KEY header from `SERPER_API_KEY`
- **Timeout:** 10 seconds
- **Returns:** Google Search organic results (title, link, snippet, date)

### 9.3 Tavily API (`fetchTavilyEvents`)

```typescript
async function fetchTavilyEvents(query: string): Promise<string>
```

- **Endpoint:** `https://api.tavily.com/search`
- **Search depth:** Advanced
- **Max results:** 10
- **Targeted domains:** `eventbrite.com`, `meetup.com`, `lusakatimes.com`, `dailymail.co.zm`, `times.co.zm`, `znbc.co.zm`, `zica.co.zm`, `eiz.org.zm`, `unza.zm`, `cbu.ac.zm`, `topfloor.co.zm`, `africarena.com`, `careersafrica.com`, `linkedin.com`
- **Auth:** API key in request body
- **Timeout:** 15 seconds
- **Returns:** Web search results with title, URL, content snippet, published date

### 9.4 Gemini Grounding (Fallback)

If all three external APIs fail or return empty, the Gemini call includes:
```typescript
config: { tools: [{ googleSearch: {} }] }
```

This enables **Google Search grounding** — Gemini searches the web in real-time to find events.

### 9.5 Prompt Construction

The Gemini prompt includes:
1. Today's date (for filtering upcoming events)
2. Student profile context
3. Location context
4. External data from all APIs (if available)
5. **20 event types** to consider:
   - career-expo, conference, workshop, meetup, trade-fair, seminar, hackathon, alumni, webinar, panel, open-day, pitch, mentorship, association, community, awards, training, sport, cultural, other
6. Instructions to search across Zambian-specific platforms

### 9.6 Output

Returns a JSON array of 8-15 events, each with:
```typescript
{
  id: string;              // Unique lowercase slug
  title: string;           // Official event name
  eventType: string;       // One of the 20 types
  organizer: string;       // Hosting organization
  dateLabel: string;       // Human-readable date
  dateIso: string;         // ISO 8601 or ""
  location: string;        // Venue + city
  description: string;     // 1-2 sentences
  url: string;             // Direct working URL
  source: string;          // Platform found on
  tags: string[];          // 3-5 keywords
  isOnline: boolean;       // Virtual or in-person
}
```

---

## 10. Feature: Parse Profile from CV

**Routes:** `/api/ai/parse-profile-from-cv`  
**Purpose:** Extracts structured profile information from a student's CV text using AI.

### Input (`ParseProfileFromCvBody`)
```typescript
{
  cvContent: string;   // Full text content of the CV
}
```

### How It Works

1. Sends a prompt asking Gemini to extract structured data from the CV
2. AI extracts up to 9 specific fields plus a flexible `profileFields` array:
```typescript
{
  displayName: string;            // Full name
  currentDegree: string;          // e.g. "BSc Computer Science"
  institution: string;            // University/college name
  yearOfStudy: string;            // e.g. "3rd Year", "Final Year"
  skills: string;                 // Comma-separated skills
  city: string;                   // Home city/location
  preferredIndustries: string;    // Mentioned or implied industries
  careerGoals: string;            // Career objective summary
  portfolioUrl: string;           // GitHub, LinkedIn, portfolio URL
  profileFields: Array<{          // ALL additional details
    label: string;
    value: string;
  }>;
}
```

3. **Flexible profile fields** capture everything else:
   - Jobs/internships → one entry per position (e.g., "Internship at Zambia National Commercial Bank")
   - Projects → "Academic Project: Water Pump Design"
   - Languages, awards, certifications, memberships, etc.
4. **Graceful fallback** — returns empty strings and empty array on any parse failure

### Key Design Decisions

- **Never crashes** — catches JSON parse errors and returns empty data
- **Comprehensive** — `profileFields` captures every detail from the CV
- **Zambian context** — knows about TEVETA, EIZ, ZICA, ICTAZ, LAZ memberships

---

## 11. Feature: Profile Chat

**Routes:** `/api/ai/profile-chat`  
**Purpose:** A conversational AI assistant (Career Compass AI) that builds a student's profile through natural conversation.

This is the most **sophisticated feature** — it maintains a stateful conversation and progressively collects profile data.

### Input (`ProfileChatBody`)
```typescript
{
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  existingProfile?: ExtractedProfile;  // Already-known profile data
  cvContent?: string;                  // Uploaded CV content
}
```

### How It Works

#### Step 1: Context Assembly
The system builds a context block from:
- `existingProfile` — all known fields (name, degree, institution, skills, etc.)
- `cvContent` — full CV text (truncated to 3000 chars)
- These are formatted as instructions to the AI: "You already know this — don't ask again"

#### Step 2: Opening Strategy
Three different opening strategies based on what's known:
- **CV uploaded:** "Greet warmly, mention what you saw in the CV, ask ONE focused question about what's missing"
- **Partial profile:** "Greet by name, acknowledge what you know, ask about most important missing info"
- **Nothing known:** "Introduce yourself and ask for their full name"

#### Step 3: System Prompt
Career Compass AI is given a detailed persona:

```typescript
const systemPrompt = `You are Career Compass AI, a warm, curious, and encouraging career assistant.
Your job is to have a natural conversation and learn as much as possible...`;
```

Topics to explore naturally (not as a checklist):
- Full name, degree, qualification, institution, year of study
- Previous qualifications (including TEVETA)
- Work experience, internships, volunteer work
- Technical and soft skills
- Languages (Nyanja, Bemba, Tonga, Lozi, etc.)
- Extracurriculars, projects, awards
- Industry preferences, career goals
- Location, online presence

**Strict rules:**
- ONE question at a time
- Never number questions
- Warm, specific, encouraging
- Follow up on short answers
- Use Zambian context naturally
- Interpret natural language ("second year computer science at UNZA" → proper fields)

#### Step 4: Conversation Loop

The mobile app sends the full conversation history with each request. The AI:
1. Reads the conversation so far
2. Generates its next response
3. Includes a `PARTIAL_PROFILE:` JSON line after EVERY response (live snapshot)
4. Includes a `PROFILE_COMPLETE:` JSON line when enough info is gathered (18-26 exchanges)

#### Step 5: Response Parsing
```typescript
// Extract PARTIAL_PROFILE (present in every response)
const partialMarker = "PARTIAL_PROFILE:";
const partialIdx = text.indexOf(partialMarker);
if (partialIdx !== -1) {
  const partialJsonStr = text.slice(partialIdx + partialMarker.length).split("\n")[0];
  partialProfile = JSON.parse(partialJsonStr);
  text = text.slice(0, partialIdx).trim();  // Strip from visible text
}

// Check for PROFILE_COMPLETE
const marker = "PROFILE_COMPLETE:";
const markerIndex = text.indexOf(marker);
if (markerIndex !== -1) {
  const reply = text.slice(0, markerIndex).trim();
  const jsonStr = text.slice(markerIndex + marker.length).split("\n")[0];
  profileData = JSON.parse(jsonStr);
  return { reply, isComplete: true, profileData, partialProfile };
}
```

#### Step 6: Response Format
```typescript
{
  reply: string;                    // AI's conversational message
  isComplete: boolean;              // Whether profile is fully built
  profileData?: ExtractedProfile;   // Full profile (when complete)
  partialProfile?: ExtractedProfile;// Live partial snapshot
}
```

### Key Design Decisions

- **18-26 exchanges** — AI is explicitly told not to wrap up early
- **Deep follow-ups** — "If they mention a skill, ask about a project where they used it"
- **Zambian-specific** — knows all major universities, professional bodies, languages
- **Progressive saving** — PARTIAL_PROFILE allows the app to save progress mid-conversation
- **CV-aware** — if CV is uploaded, AI doesn't ask questions the CV already answers

---

## 12. Feature: Document Content Extraction

**Routes:** `/api/storage/extract-content` (Express) and `/api/storage/extract-content` (Edge Function)  
**Purpose:** Extracts career-relevant text information from uploaded documents (PDFs, images, text files).

### Input
```typescript
{
  fileContent: string;      // Base64-encoded file content
  contentType: string;      // MIME type (e.g., "application/pdf")
  category: string;         // Document category (e.g., "CV / Resume", "Certificate")
}
```

### Supported File Types
```typescript
const SUPPORTED_TYPES = new Set([
  "application/pdf", "text/plain", "text/html", "text/csv",
  "text/xml", "text/rtf", "text/markdown",
  "image/jpeg", "image/jpg", "image/png", "image/gif",
  "image/webp", "image/bmp", "image/heic", "image/heif",
]);
```

### Size Limit
- **Maximum:** ~7.5 MB (estimated from base64 length)
- Files larger than this return a friendly error message

### How It Works

1. **Validates** content type and size
2. **Sends to Gemini** as a multi-part request:
   - Part 1: `inlineData` with the base64 file content and MIME type
   - Part 2: Text prompt asking for structured extraction
3. **Extracted data includes:**
   - Full name and contact details
   - Educational qualifications (degrees, institutions, years, grades, courses)
   - Work experience, internships, WIL placements
   - Technical and soft skills
   - Certifications & professional memberships (EIZ, ZICA, ICTAZ, LAZ)
   - Awards, achievements, extracurriculars
   - Career objective / personal statement
   - Portfolio links, GitHub, LinkedIn
4. Returns `{ extractedText: "..." }` — structured plain text with section headings

### Error Handling
- Unsupported types → helpful message: "cannot be automatically read in-app"
- Extraction failure → "Could not automatically read this document"
- Files are **not stored on server** — extraction happens in memory, results go to client, original files stay on device

---

## 13. Mobile App → Backend Communication

### 13.1 AI Service Client (`artifacts/mobile/lib/aiService.ts`)

The mobile app communicates with the backend through a dedicated `aiService` module.

**Key architecture:**

```
Mobile App
    │
    ▼
aiService.ts  ──►  invokeAI(action, payload)
    │
    ├── acquireSlot()    ← Serializes requests (1 at a time)
    ├── fetch()          ← Calls Supabase Edge Function
    ├── retry logic      ← Exponential backoff on 503
    └── releaseSlot()
```

### 13.2 Request Serialization

```typescript
let _active = 0;
const _queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (_active < 1) {
    _active++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => _queue.push(resolve));
}
```

**Purpose:** Prevents multiple simultaneous AI requests. This is the **primary defence against Gemini 503 rate-limit errors**. Only one AI request can be active at a time; others wait in a FIFO queue.

### 13.3 Retry with Exponential Backoff

```typescript
const RETRY_DELAYS = [5000, 15000];  // 5 seconds, then 15 seconds
```

- **Only retries on 503 errors** (service unavailable, high demand)
- **Never retries on 429 errors** (rate limit exceeded) — that would make rate limiting worse
- **Timeout:** 50 seconds per request (aborts after that)

### 13.4 Edge Function URL

```typescript
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-service`;
```

Each request includes:
- `Authorization: Bearer {session?.access_token ?? SUPABASE_ANON_KEY}`
- `apikey: {SUPABASE_ANON_KEY}`
- Body: `{ action, ...payload }` — the `action` field routes to the correct handler

### 13.5 Public API Surface

```typescript
export const aiService = {
  profileChat:           (payload) ⇒ { reply, isComplete, profileData?, partialProfile? }
  discoverCompanies:     (payload) ⇒ Company[]
  draftLetter:           (payload) ⇒ { letter }
  researchCompany:       (payload) ⇒ { summary }
  starFeedback:          (payload) ⇒ { feedback }
  interviewQuestions:    (payload) ⇒ { personal, company, experience }
  parseProfileFromCv:   (payload) ⇒ ExtractedProfile
  networkingEvents:      (payload) ⇒ Event[]
  interviewVerdict:      (payload) ⇒ InterviewVerdict
  extractContent:        (payload) ⇒ { extractedText }
};
```

### 13.6 Document Context Utilities (`utils/docContext.ts`)

Two helper functions assemble document context for AI prompts:

1. **`getCvContent(docs)`** — Finds the first document (by priority order: CV/Resume → Academic Transcript → Certificate → Cover Letter → Reference Letter → Portfolio → Other) with extracted text
2. **`buildDocumentsContext(docs)`** — Combines up to 3 documents' extracted text into a single context string
3. **`buildUserContext(profile, docs)`** — Assembles a complete user profile string from structured profile data + document content

### 13.7 AI Response Cleaner (`utils/cleanAiResponse.ts`)

A utility to clean markdown formatting from Gemini responses:
- Removes `**bold**`, `*italic*`, `` `code` ``
- Removes `# headings`, bullet points, numbered lists
- Removes `[links](url)` → keeps link text
- Removes code blocks (triple backticks)
- Normalizes whitespace

---

## 14. External API Integrations

### 14.1 Serper.dev (Google Search API)

| Detail | Value |
|---|---|
| **Endpoint** | `https://google.serper.dev/search` |
| **Auth** | `X-API-KEY` header |
| **Env Variable** | `SERPER_API_KEY` |
| **Timeout** | 10 seconds |
| **Usage** | Finding networking events via Google Search |
| **Parameters** | `q` (query), `gl: "zm"` (Zambia geolocation), `hl: "en"`, `num: 10` |

### 14.2 Eventbrite API

| Detail | Value |
|---|---|
| **Endpoint** | `https://www.eventbriteapi.com/v3/events/search/` |
| **Auth** | Bearer token |
| **Env Variable** | `EVENTBRITE_API_KEY` |
| **Timeout** | 10 seconds |
| **Usage** | Finding structured event data (conferences, workshops, meetups) |
| **Parameters** | `q`, `location.address`, `start_date.range_start`, `expand=venue`, `page_size=15` |

### 14.3 Tavily API

| Detail | Value |
|---|---|
| **Endpoint** | `https://api.tavily.com/search` |
| **Auth** | API key in request body |
| **Env Variable** | `TAVILY_API_KEY` |
| **Timeout** | 15 seconds |
| **Usage** | AI-powered deep search across Zambian-specific domains |
| **Parameters** | `api_key`, `query`, `search_depth: "advanced"`, `max_results: 10`, `include_domains: [Zambian-specific domains]` |

### 14.4 Google Gemini AI

| Detail | Value |
|---|---|
| **SDK/Source** | `@google/genai` (Express) or REST API (Edge Function) |
| **Model** | `gemini-2.5-flash` (text), `gemini-2.5-flash-image` (image) |
| **Auth** | `GEMINI_API_KEY` or Replit proxy (`AI_INTEGRATIONS_GEMINI_BASE_URL` + `AI_INTEGRATIONS_GEMINI_API_KEY`) |
| **Timeout** | 60 seconds (Edge Function) |
| **Usage** | ALL AI features — company discovery, letter drafting, CV parsing, chat, etc. |

---

## 15. Data Storage & Persistence

### 15.1 Supabase Database

The app uses **Supabase PostgreSQL** with 5 tables:

```
supabase
├── profiles       ← User profile data (JSONB)
├── applications   ← Saved job/placement applications (JSONB)
├── contacts       ← Stored contacts (JSONB)
├── saved_events   ← Bookmarked networking events (JSONB)
└── documents      ← Document metadata (JSONB — files stored on device)
```

**Schema pattern:** All tables follow the same design:
```sql
create table if not exists profiles (
  uid         text primary key,         -- Device-generated user ID
  data        jsonb not null,           -- Flexible schema-free data
  updated_at  timestamptz not null default now()
);
```

Tables with multiple records per user (applications, contacts, saved_events, documents):
```sql
create table if not exists applications (
  uid         text not null,
  record_id   text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (uid, record_id)
);
```

**Key design decisions:**
- **JSONB columns** — schema-less, flexible. The app schema is defined client-side
- **Device-generated UID** — no Supabase Auth; each device generates its own anonymous UID
- **RLS policies allow all** — since auth is anonymous, RLS is open for all operations
- **Indexes on uid** — all non-primary tables have indexes for fast user-specific queries

### 15.2 Supabase Client (`artifacts/mobile/lib/supabase.ts`)

```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- Uses **Expo's AsyncStorage** for session persistence
- Anon key allows unauthenticated access (RLS handles authorization)
- `react-native-url-polyfill` for URL compatibility

### 15.3 File Storage

**Documents are NOT stored on the server.** The design principle is:
- Files stay on the user's device (local file system)
- Only extracted text metadata is sent to the server via AI extraction
- Document metadata (name, category, extracted text) is saved to Supabase `documents` table

For the Express server, **Google Cloud Storage via Replit Sidecar** is available:
- `objectStorage.ts` — manages public/private object storage with signed URLs
- `objectAcl.ts` — access control policies (owner, visibility, ACL rules)
- Used for user-uploaded files on the Replit-hosted version

---

## 16. Error Handling & Resilience

### 16.1 AI Request Queue (Mobile)

The mobile app serializes all AI requests with a **mutex-like queue**:
- Only 1 request active at a time
- Others wait in a FIFO queue
- Primary defence against Gemini's 503 rate-limit errors

### 16.2 Exponential Backoff (Mobile)

```
Attempt 1: Immediate
Attempt 2: Wait 5 seconds (if 503 error)
Attempt 3: Wait 15 seconds (if 503 error)
After that: Fail permanently
```

### 16.3 Error Classification (Mobile)

```
Is it retryable (503, busy, UNAVAILABLE, overload)?  → Retry
Is it a rate limit (429, quota, RESOURCE_EXHAUSTED)?  → NEVER retry
Is it a network error or timeout?                     → Show friendly message
All other errors?                                     → Show friendly message
```

### 16.4 Friendly Error Messages (Mobile)

```typescript
if (status === 429) → 'AI is busy right now — please wait a moment and try again.'
if (status === 503) → 'AI service is under high demand — retrying…'
Server returns raw error → Clean it, show first line only
Network timeout → 'Request timed out — the AI took too long to respond.'
Network error → 'Network error — check your connection and try again.'
```

### 16.5 JSON Parsing Defences (Server)

Every AI route that expects JSON back from Gemini uses a **two-level defence**:

```typescript
// 1. Try to extract JSON using regex
const jsonMatch = text.match(/\[[\s\S]*\]/);
if (!jsonMatch) {
  // Level 1 fail: No JSON found
  return res.status(500).json({ error: "AI returned an unexpected format" });
}

try {
  // 2. Try to parse the JSON
  const data = JSON.parse(jsonMatch[0]);
  res.json(data);
} catch (parseErr) {
  // Level 2 fail: Invalid JSON
  return res.status(500).json({ error: "AI returned invalid JSON" });
}
```

### 16.6 Parallel Execution with Fail-Silent (Networking Events)

All external API calls run in parallel. Failures are silently ignored:

```typescript
const [serperResult, eventbriteResult, tavilyResult] = await Promise.allSettled([
  fetchSerperEvents(searchQuery),
  fetchEventbriteEvents(city ?? "", "..."),
  fetchTavilyEvents(`...`),
]);
```

If all three fail, Gemini falls back to **Google Search grounding** as a last resort.

### 16.7 Document Extraction Graceful Failure

```typescript
// Unsupported file type → helpful message, not error
res.json({ extractedText: "[This file type cannot be automatically read...]" });

// Extraction error → friendly fallback
res.json({ extractedText: "[Could not automatically read this document...]" });
```

---

## 17. Notifications System

**File:** `artifacts/mobile/utils/notifications.ts`

The app supports local/push notifications via Expo Notifications.

### Capabilities

| Function | Description |
|---|---|
| `requestNotificationPermissions()` | Requests user permission; returns boolean |
| `scheduleLocalNotification(opts)` | Shows an immediate notification |
| `scheduleTimedNotification(opts)` | Schedules a notification for a future date |

### Constraints

```typescript
if (Platform.OS === 'web') return null;
if (isExpoGo) return null;  // Expo Go doesn't support push notifications
```

Notifications are available on **physical Android/iOS devices** only (not web, not Expo Go).

### Notification Handler

```typescript
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
```

---

## 18. Batch Processing Utilities

**File:** `lib/integrations-gemini-ai/src/batch/utils.ts`

Generic utilities for processing multiple items through an LLM with rate limiting and retries.

### `batchProcess(items, processor, options)`

```typescript
const results = await batchProcess(
  artworks,
  async (artwork) => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Categorize: ${artwork.name}`,
    });
    return JSON.parse(response.text);
  },
  { concurrency: 2, retries: 5 }
);
```

**Options:**
| Option | Default | Description |
|---|---|---|
| `concurrency` | 2 | Max parallel requests |
| `retries` | 7 | Max retries per item |
| `minTimeout` | 2000ms | Initial retry delay |
| `maxTimeout` | 128000ms | Max retry delay |
| `onProgress` | undefined | Progress callback |

**Rate limit handling:** Non-rate-limit errors trigger `AbortError` (stop retrying). Rate limit errors (`429`, quota, rate limit) are retried with exponential backoff.

### `batchProcessWithSSE(items, processor, sendEvent, options)`

Same as `batchProcess` but supports **Server-Sent Events** for real-time progress updates:
```
started    → { type: "started", total }
processing → { type: "processing", index, item }
progress   → { type: "progress", index, result } or { type: "progress", index, error }
complete   → { type: "complete", processed, errors }
```

---

## 19. Database Schema

```sql
-- Full SQL schema from supabase-schema.sql

-- Profiles (one per user)
create table profiles (
  uid         text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Applications (saved job/placement applications)
create table applications (
  uid         text not null,
  record_id   text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (uid, record_id)
);

-- Contacts
create table contacts (
  uid         text not null,
  record_id   text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (uid, record_id)
);

-- Saved Events
create table saved_events (
  uid         text not null,
  record_id   text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (uid, record_id)
);

-- Documents (metadata only — files on device)
create table documents (
  uid         text not null,
  record_id   text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (uid, record_id)
);

-- Indexes
create index if not exists idx_applications_uid on applications (uid);
create index if not exists idx_contacts_uid     on contacts     (uid);
create index if not exists idx_saved_events_uid on saved_events (uid);
create index if not exists idx_documents_uid    on documents    (uid);

-- RLS: All policies allow all (anonymous auth model)
alter table profiles    enable row level security;
alter table applications enable row level security;
alter table contacts    enable row level security;
alter table saved_events enable row level security;
alter table documents   enable row level security;

create policy "allow all on profiles"     on profiles     for all using (true) with check (true);
create policy "allow all on applications" on applications for all using (true) with check (true);
create policy "allow all on contacts"     on contacts     for all using (true) with check (true);
create policy "allow all on saved_events" on saved_events for all using (true) with check (true);
create policy "allow all on documents"    on documents    for all using (true) with check (true);
```

---

## 20. Environment Variables Reference

| Variable | Required | Used By | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | Express + Edge Function | Google Gemini API key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | No | Express (Replit) | Replit AI proxy base URL |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | No | Express (Replit) | Replit AI proxy API key |
| `SERPER_API_KEY` | No | Express + Edge Function | Google Search API for event finding |
| `EVENTBRITE_API_KEY` | No | Express + Edge Function | Eventbrite API for event listings |
| `TAVILY_API_KEY` | No | Express + Edge Function | Tavily AI search for event discovery |
| `PUBLIC_OBJECT_SEARCH_PATHS` | No | Express (Replit) | Public object storage paths |
| `PRIVATE_OBJECT_DIR` | No | Express (Replit) | Private object storage directory |

---

## Appendix: Data Flow Diagrams

### Profile Chat Flow

```
┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│ Mobile   │    │ aiService.ts │    │ Supabase     │    │ Gemini   │
│ App UI   │    │              │    │ Edge Function │    │ 2.5 Flash │
└────┬─────┘    └──────┬───────┘    └──────┬────────┘    └────┬─────┘
     │                 │                   │                  │
     │ profileChat(    │                   │                  │
     │  messages,      │                   │                  │
     │  existingProfile)│                  │                  │
     ├────────────────►│                   │                  │
     │                 │ acquireSlot()     │                  │
     │                 │ [queued if busy]  │                  │
     │                 ├───────►           │                  │
     │                 │                   │                  │
     │                 │ POST /functions/  │                  │
     │                 │   v1/ai-service   │                  │
     │                 ├──────────────────►│                  │
     │                 │                   │ Build prompt     │
     │                 │                   │ with:            │
     │                 │                   │ • existing profile│
     │                 │                   │ • CV content     │
     │                 │                   │ • conversation   │
     │                 │                   ├──────►           │
     │                 │                   │                  │
     │                 │                   │Generate response │
     │                 │                   │+ PARTIAL_PROFILE │
     │                 │                   │◄─────────────────│
     │                 │                   │                  │
     │                 │ { reply,          │                  │
     │                 │   isComplete,     │                  │
     │                 │   partialProfile }│                  │
     │                 │◄──────────────────│                  │
     │                 │                   │                  │
     │  Return data    │ releaseSlot()     │                  │
     │◄────────────────│                   │                  │
     │                 │                   │                  │
```

### Networking Events Flow

```
┌─────────┐    ┌──────────────┐    ┌─────────────┐
│ Mobile   │    │ aiService.ts │    │ Supabase Edge│
│ App UI   │    │              │    │  Function    │
└────┬─────┘    └──────┬───────┘    └──────┬────────┘
     │                 │                   │
     │ networkingEvents│                   │
     │ (payload)       │                   │
     ├────────────────►│                   │
     │                 ├──────────────────►│
     │                 │                   │
     │                 │   ┌───────────────┼──────────────┐
     │                 │   │  Parallel     │              │
     │                 │   │  calls:      │              │
     │                 │   │               │              │
     │                 │   │  Eventbrite   │  Serper.dev  │
     │                 │   │  ┌───────┐    │  ┌───────┐   │
     │                 │   │  │  API   │   │  │  API   │   │
     │                 │   │  └───┬───┘   │  └───┬───┘   │
     │                 │   │      │        │      │        │
     │                 │   │  Tavily AI    │  Gemini       │
     │                 │   │  ┌───────┐    │  (fallback)   │
     │                 │   │  │  API   │   │  ┌───────┐   │
     │                 │   │  └───┬───┘   │  └───┬───┘   │
     │                 │   └──────┼────────┘      │        │
     │                 │          │               │        │
     │                 │   Build prompt with      │        │
     │                 │   all available data     │        │
     │                 │          │               │        │
     │                 │          └───────┬───────┘        │
     │                 │                  │                │
     │                 │          Generate events          │
     │                 │                  │                │
     │                 │◄─────────────────│                │
     │◄────────────────│                  │                │
     │                 │                  │                │
```

---

*End of Backend Architecture Documentation*