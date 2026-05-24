import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { decodeBase64 } from 'jsr:@std/encoding/base64'
import pdfParse from 'npm:pdf-parse'
import mammoth from 'npm:mammoth'

// ===== CONSTANTS & CONFIG =====
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
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  eventbrite: 'https://www.eventbriteapi.com/v3/events/search/',
  serper: 'https://google.serper.dev/search',
  tavily: 'https://api.tavily.com/search',
}

const TIMEOUTS = {
  gemini: 60000,
  eventbrite: 10000,
  serper: 10000,
  tavily: 15000,
}

// ===== ERROR CLASSES =====
class AIServiceError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AIServiceError'
  }
}

class ValidationError extends AIServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details)
    this.name = 'ValidationError'
  }
}

class APIError extends AIServiceError {
  constructor(message: string, statusCode: number = 503, details?: Record<string, unknown>) {
    super('API_ERROR', statusCode, message, details)
    this.name = 'APIError'
  }
}

class TimeoutError extends AIServiceError {
  constructor(service: string) {
    super('TIMEOUT_ERROR', 504, `${service} request timed out`)
    this.name = 'TimeoutError'
  }
}

// ===== LOGGER =====
class Logger {
  private timers = new Map<string, number>()

  debug(action: string, message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'debug', action, message, metadata, timestamp: new Date().toISOString() }))
  }

  info(action: string, message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'info', action, message, metadata, timestamp: new Date().toISOString() }))
  }

  warn(action: string, message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'warn', action, message, metadata, timestamp: new Date().toISOString() }))
  }

  error(action: string, message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'error', action, message, metadata, timestamp: new Date().toISOString() }))
  }

  startTimer(label: string) {
    this.timers.set(label, Date.now())
  }

  endTimer(label: string, action: string, metadata?: Record<string, unknown>) {
    const startTime = this.timers.get(label)
    if (startTime) {
      const duration = Date.now() - startTime
      this.info(action, `Completed in ${duration}ms`, { ...metadata, duration })
      this.timers.delete(label)
    }
  }
}

const logger = new Logger()

// ===== UTILITY FUNCTIONS =====
function extractJSON<T>(text: string, defaultValue?: T): T | null {
  try {
    return JSON.parse(text)
  } catch {
    const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }
    const objectMatch = text.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0])
    }
    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0])
    }
    return defaultValue ?? null
  }
}

function extractPartialProfile(text: string): Record<string, unknown> | null {
  const marker = 'PARTIAL_PROFILE:'
  const idx = text.indexOf(marker)
  if (idx === -1) return null

  const jsonStart = idx + marker.length
  const jsonEnd = text.indexOf('\n', jsonStart)
  const jsonStr = text.substring(jsonStart, jsonEnd === -1 ? undefined : jsonEnd).trim()

  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

function extractProfileComplete(text: string): {
  reply: string
  profile: Record<string, unknown> | null
} {
  const marker = 'PROFILE_COMPLETE:'
  const idx = text.indexOf(marker)

  if (idx === -1) {
    return { reply: text, profile: null }
  }

  const reply = text.substring(0, idx).trim()
  const jsonStart = idx + marker.length
  const jsonEnd = text.indexOf('\n', jsonStart)
  const jsonStr = text.substring(jsonStart, jsonEnd === -1 ? undefined : jsonEnd).trim()

  try {
    const profile = JSON.parse(jsonStr)
    return { reply, profile }
  } catch {
    return { reply, profile: null }
  }
}

function extractProfileFields(text: string): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {}

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
  }

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern)
    if (match) {
      const value = match[1].trim()
      if (key === 'preferredIndustries') {
        fields[key] = value.split(',').map((s) => s.trim())
      } else {
        fields[key] = value
      }
    }
  }

  return fields
}

function cleanMarkdown(text: string): string {
  return (
    text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n\n+/g, '\n\n')
      .trim()
  )
}

function buildStudentProfileString(profile: any): string {
  const parts: string[] = []
  if (profile.displayName) parts.push(`Name: ${profile.displayName}`)
  if (profile.currentDegree) parts.push(`Degree: ${profile.currentDegree}`)
  if (profile.institution) parts.push(`Institution: ${profile.institution}`)
  if (profile.yearOfStudy) parts.push(`Year of Study: ${profile.yearOfStudy}`)
  if (profile.city) parts.push(`City: ${profile.city}`)
  if (profile.preferredIndustries?.length)
    parts.push(`Industries: ${profile.preferredIndustries.join(', ')}`)
  if (profile.careerGoals) parts.push(`Goals: ${profile.careerGoals}`)
  if (profile.profileFields?.length) {
    const jobs = profile.profileFields.filter((f: any) => f.category === 'job')
    const skills = profile.profileFields.filter((f: any) => f.category === 'skill')
    if (jobs.length) parts.push(`Experience: ${jobs.map((j: any) => j.value).join('; ')}`)
    if (skills.length) parts.push(`Skills: ${skills.map((s: any) => s.value).join(', ')}`)
  }
  return parts.join('\n')
}

function buildDocumentContextString(documents: any[]): string {
  if (!documents.length) return ''
  return documents
    .map((doc) => `[${doc.name}]\n${doc.extractedText.slice(0, 2000)}`)
    .join('\n\n---\n\n')
}

function getZambianContextParagraph(): string {
  return `You are providing advice in the Zambian context. Consider:
- Major Zambian universities: UNZA, CBU, Mulungushi University
- Professional bodies: EIZ, ZICA, ICTAZ, LAZ
- Industries: Mining, Agriculture, Energy, Finance, Telecom, Healthcare
- Job types: Industrial Attachment, Internship, Graduate Programme
- Languages: English, Nyanja, Bemba, Tonga, Lozi
- Relevant qualifications: TEVETA certifications, professional certifications

Mention Zambian-specific context when relevant and use local terminology.`
}

function normalizeLocation(location: string): string {
  if (!location) return 'Lusaka, Zambia'
  const zambianCities = [
    'lusaka', 'kitwe', 'ndola', 'livingstone', 'kabwe', 'chingola',
    'copperbelt', 'northern province', 'zambia'
  ]
  const isZambian = zambianCities.some((city) => location.toLowerCase().includes(city))
  if (isZambian) {
    return location.includes('Zambia') ? location : `${location}, Zambia`
  }
  return location
}

// ===== FILE PARSING UTILITIES =====
function isBase64(str: string): boolean {
  if (!str) return false
  try {
    // Use Web API atob() - works in Deno
    atob(str)
    // Try to decode with our base64 decoder - should succeed for valid base64
    decodeBase64(str)
    return true
  } catch {
    return false
  }
}

async function extractTextFromFile(
  base64Content: string,
  contentType: string
): Promise<string> {
  try {
    // Decode base64 to bytes
    const fileBytes = decodeBase64(base64Content)

    logger.info('file-parsing', 'Starting extraction', { contentType, size: fileBytes.length })

    // PDF files
    if (contentType === 'application/pdf') {
      try {
        const pdfData = await pdfParse(fileBytes)
        const text = pdfData.text || ''
        logger.info('file-parsing', 'PDF extracted', { pages: pdfData.numpages, size: text.length })
        return text
      } catch (err: any) {
        logger.warn('file-parsing', `PDF parsing failed: ${err.message}`)
        return ''
      }
    }

    // Word documents
    if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        contentType.includes('wordprocessingml')) {
      try {
        const result = await mammoth.extractRawText({ arrayBuffer: fileBytes.buffer })
        logger.info('file-parsing', 'DOCX extracted', { size: result.value?.length || 0 })
        return result.value || ''
      } catch (err: any) {
        logger.warn('file-parsing', `DOCX parsing failed: ${err.message}`)
        return ''
      }
    }

    // Plain text files
    if (contentType.startsWith('text/')) {
      try {
        const text = new TextDecoder().decode(fileBytes)
        logger.info('file-parsing', 'Text extracted', { size: text.length })
        return text
      } catch (err: any) {
        logger.warn('file-parsing', `Text decoding failed: ${err.message}`)
        return ''
      }
    }

    // Images - would need vision API, fallback to empty
    if (contentType.startsWith('image/')) {
      logger.info('file-parsing', 'Image detected - will use Gemini vision API')
      return `[Image file: ${contentType}]`
    }

    logger.warn('file-parsing', `Unsupported file type: ${contentType}`)
    return ''
  } catch (err: any) {
    logger.error('file-parsing', `Extraction failed: ${err.message}`)
    return ''
  }
}

// ===== CONFIGURATION =====
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const EVENTBRITE_API_KEY = Deno.env.get('EVENTBRITE_API_KEY') ?? ''
const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY') ?? ''
const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY') ?? ''

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ===== TEXT GENERATION WITH FALLBACK =====
async function callGeminiWithFallback(
  systemPrompt: string,
  userMessage: string,
  context?: { profile?: any; documents?: any[] }
): Promise<{ reply: string; model: string; isComplete: boolean }> {
  logger.startTimer('gemini-call')

  if (!GEMINI_API_KEY) {
    throw new ValidationError('Missing GEMINI_API_KEY secret')
  }
  if (!userMessage?.trim()) {
    throw new ValidationError('Empty user message')
  }

  let enrichedPrompt = systemPrompt
  if (context?.profile) {
    enrichedPrompt += '\n\n' + buildStudentProfileString(context.profile)
  }
  if (context?.documents) {
    enrichedPrompt += '\n\nDocument Context:\n' + buildDocumentContextString(context.documents)
  }
  enrichedPrompt += '\n\n' + getZambianContextParagraph()

  const models = [MODELS.generation.primary, MODELS.generation.fallback]
  let lastError: AIServiceError | null = null

  for (const model of models) {
    try {
      logger.info('gemini-text', `Attempting with ${model}`)

      const url = `${API_ENDPOINTS.gemini}/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.gemini)

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
        })

        clearTimeout(timeoutId)

        const text = await res.text().catch(() => '')

        if (!res.ok) {
          lastError = new APIError(
            `${model} returned ${res.status}`,
            res.status,
            { response: text.slice(0, 200) }
          )
          logger.warn('gemini-text', `${model} failed: ${res.status}`, { error: lastError.message })
          continue
        }

        const data = extractJSON<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>(text)
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

        if (!reply?.trim()) {
          lastError = new APIError(`${model} returned empty response`)
          logger.warn('gemini-text', `${model} empty response`)
          continue
        }

        logger.endTimer('gemini-call', 'gemini-text', { model, success: true })
        return {
          reply: reply.trim(),
          model,
          isComplete: true,
        }
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          lastError = new TimeoutError(model)
        } else {
          lastError = new APIError(err.message)
        }
        logger.error('gemini-text', `${model} error`, { error: err.message })
      }
    } catch (err: any) {
      lastError = new APIError(err.message)
    }
  }

  throw lastError || new APIError('All text generation models failed')
}

// ===== EMBEDDINGS WITH FALLBACK =====
async function getEmbeddingWithFallback(text: string): Promise<{ embedding: number[]; model: string; dimensions: number }> {
  if (!GEMINI_API_KEY) throw new ValidationError('Missing GEMINI_API_KEY secret')
  if (!text?.trim()) throw new ValidationError('Empty text for embedding')

  const models = [MODELS.embedding.primary, MODELS.embedding.fallback]
  let lastError = ''

  for (const model of models) {
    try {
      logger.info('embedding', `Attempting with ${model}`)

      const url = `${API_ENDPOINTS.gemini}/${model}:embedContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
        }),
      })

      const responseText = await res.text().catch(() => '')

      if (!res.ok) {
        lastError = `${model} ${res.status}: ${responseText.slice(0, 300)}`
        logger.warn('embedding', `Failed with ${model}`, { status: res.status })
        continue
      }

      const data = extractJSON<{ embedding?: { values?: number[] } }>(responseText)
      const embedding = data?.embedding?.values ?? []

      if (!Array.isArray(embedding) || embedding.length === 0) {
        lastError = `${model} returned invalid embedding`
        logger.warn('embedding', lastError)
        continue
      }

      logger.info('embedding', `Success with ${model} (${embedding.length} dimensions)`)
      return {
        embedding,
        model,
        dimensions: embedding.length,
      }
    } catch (err: any) {
      lastError = err.message
      logger.error('embedding', `Error with ${model}`, { error: err.message })
    }
  }

  throw new APIError(`All embedding models failed. Last error: ${lastError}`)
}

// ===== HANDLERS: PROFILE CHAT =====
async function handleProfileChat(body: any): Promise<Response> {
  try {
    // ===== STRICT INPUT VALIDATION =====
    const messages = Array.isArray(body.messages) ? body.messages : []
    const userMessage = (body.message ?? (messages[messages.length - 1]?.content ?? '')).toString().trim()
    
    if (!userMessage) {
      return json({ error: 'No user message provided' }, 400)
    }

    if (userMessage.length > 5000) {
      return json({ error: 'Message too long (max 5000 characters)' }, 400)
    }

    // Safely parse existing profile
    let existingProfile: Record<string, any> = {}
    try {
      if (body.existingProfile && typeof body.existingProfile === 'object') {
        existingProfile = {
          displayName: body.existingProfile.displayName?.toString() || '',
          email: body.existingProfile.email?.toString() || '',
          currentDegree: body.existingProfile.currentDegree?.toString() || '',
          institution: body.existingProfile.institution?.toString() || '',
          yearOfStudy: body.existingProfile.yearOfStudy?.toString() || '',
          city: body.existingProfile.city?.toString() || '',
          careerGoals: body.existingProfile.careerGoals?.toString() || '',
          preferredIndustries: Array.isArray(body.existingProfile.preferredIndustries)
            ? body.existingProfile.preferredIndustries.map((i: any) => i?.toString()).filter(Boolean)
            : [],
        }
      }
    } catch (err: any) {
      logger.warn('profile-chat', `Error parsing profile: ${err.message}`)
      existingProfile = {}
    }

    // Safely truncate CV content to prevent token limit issues
    let cvContent = ''
    try {
      if (body.cvContent && typeof body.cvContent === 'string') {
        cvContent = body.cvContent.trim().slice(0, 1500) // Reduced from 2000
      }
    } catch (err: any) {
      logger.warn('profile-chat', `Error processing CV content: ${err.message}`)
      cvContent = ''
    }

    const exchangeCount = Math.floor(messages.length / 2) + 1
    const hasCv = !!cvContent
    const hasPartialProfile = Object.keys(existingProfile).some((k) => existingProfile[k])
    const hasName = !!existingProfile.displayName

    // ===== BUILD SYSTEM PROMPT =====
    let openingStrategy = ''
    try {
      if (hasCv && exchangeCount === 1) {
        openingStrategy = `CV UPLOADED: Read this CV carefully, then greet warmly and mention something specific you learned from it. Ask ONE follow-up question about something missing or to dig deeper.`
      } else if (hasPartialProfile && exchangeCount === 1) {
        const safeName = (existingProfile.displayName ?? 'there').toString().slice(0, 50)
        const safeDegree = (existingProfile.currentDegree ?? '').toString().slice(0, 50)
        const safeInstitution = (existingProfile.institution ?? '').toString().slice(0, 50)
        openingStrategy = `PARTIAL PROFILE EXISTS: You already know their name "${safeName}"${safeDegree ? `, degree "${safeDegree}"` : ''}${safeInstitution ? `, institution "${safeInstitution}"` : ''}. Skip these topics. Greet warmly and ask ONE focused question about important missing info.`
      } else if (exchangeCount === 1) {
        openingStrategy = `NEW CONVERSATION: Introduce yourself warmly and ask for their full name as the first question.`
      } else {
        openingStrategy = `CONTINUE CONVERSATION: Exchange #${exchangeCount}. Keep deepening the conversation. Ask ONE follow-up question that builds directly on their last answer.`
      }
    } catch (err: any) {
      logger.warn('profile-chat', `Error building strategy: ${err.message}`)
      openingStrategy = 'CONTINUE CONVERSATION: Keep asking follow-up questions.'
    }

    const systemPrompt = `You are Career Compass AI, a warm, deeply curious career advisor building comprehensive student profiles.

YOUR CORE MISSION:
Build the most complete picture of this person's background, skills, experience, and aspirations through natural conversation.

OPENING STRATEGY FOR THIS EXCHANGE:
${openingStrategy}

CRITICAL CONVERSATION RULES (FOLLOW THESE STRICTLY):
1. ONE QUESTION PER TURN - Never ask multiple questions.
2. NEVER NUMBER QUESTIONS - Don't write "1) Question? 2) Question?" - that's robotic. Write naturally.
3. BUILD ON THEIR ANSWERS - Always reference what they just said.
4. DEEP FOLLOW-UPS - If they give short answers, dig deeper.
5. WARM AND ENCOURAGING - Sound human. Use their name naturally. Show genuine interest.
6. EXTRACT SPECIFIC DETAILS - When they mention a skill, ask for proof of it.
7. NEVER WRAP UP EARLY - Keep going indefinitely. The profile is never "complete" until the user explicitly says so.
8. USE ZAMBIAN CONTEXT - Know about UNZA, CBU, EIZ, ZICA, ICTAZ, TEVETA.
9. ASK ABOUT EVERYTHING - Dig into: name, degree, institution, year, city, skills, projects, work experience, languages, extracurriculars, awards, goals, passions.
10. LISTEN AND REMEMBER - Reference specific things they've told you earlier.

RESPONSE FORMAT:
Write your warm, conversational message normally. At the END, add:
PARTIAL_PROFILE: { "displayName": "name if mentioned", "currentDegree": "degree if mentioned", "institution": "...", "city": "...", "careerGoals": "..." }

If conversation is very deep (18+ exchanges), add:
PROFILE_COMPLETE: { "displayName": "...", "email": "...", "currentDegree": "...", "institution": "...", "city": "...", "careerGoals": "...", "preferredIndustries": [...], "phone": "..." }

Default to PARTIAL_PROFILE. Keep conversations going.${
      hasCv
        ? `\n\nCV SUMMARY (for context only):\n${cvContent}\n\nDo NOT ask questions the CV already answers. Instead, ask for deeper context or clarification.`
        : ''
    }${
      hasPartialProfile
        ? `\n\nEXISTING PROFILE DATA:\n${buildStudentProfileString(existingProfile)}\n\nDo NOT re-ask fields they've already provided. Build on what you know.`
        : ''
    }`

    // ===== CALL GEMINI API =====
    let result: { reply: string; model: string; isComplete: boolean }
    try {
      result = await callGeminiWithFallback(systemPrompt, userMessage, {
        profile: existingProfile,
        documents: cvContent ? [{ name: 'CV', extractedText: cvContent }] : undefined,
      })
    } catch (apiError: any) {
      logger.error('profile-chat', `Gemini API error: ${apiError.message}`)
      // Return more helpful error messages for API issues
      if (apiError.message?.includes('quota') || apiError.message?.includes('high demand')) {
        return json(
          { error: 'AI service temporarily busy. Please try again in a moment.' },
          503
        )
      }
      throw apiError
    }

    // ===== EXTRACT PROFILE DATA =====
    let cleanedReply = result.reply
    let completeProfile = null
    try {
      const extracted = extractProfileComplete(result.reply)
      cleanedReply = extracted.reply
      completeProfile = extracted.profile
    } catch (err: any) {
      logger.warn('profile-chat', `Error extracting complete profile: ${err.message}`)
    }

    let partialProfile: Record<string, any> = {}
    try {
      partialProfile =
        extractPartialProfile(result.reply) ||
        extractProfileFields(cleanedReply) ||
        {}
    } catch (err: any) {
      logger.warn('profile-chat', `Error extracting partial profile: ${err.message}`)
    }

    const response = {
      reply: cleanMarkdown(cleanedReply),
      isComplete: !!completeProfile,
      model: result.model,
      profileData: completeProfile || existingProfile || {},
      partialProfile: partialProfile || {},
    }

    logger.info('profile-chat', 'Response generated successfully', {
      exchange: exchangeCount,
      isComplete: response.isComplete,
      hasCv,
      hasProfile: hasPartialProfile,
    })

    return json(response, 200)
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to generate response'
    const statusCode = error?.statusCode || 500

    logger.error('profile-chat', errorMessage, {
      code: error?.code,
      details: error?.details,
    })

    return json(
      {
        error: errorMessage,
        code: error?.code,
      },
      statusCode
    )
  }
}

// ===== HANDLERS: HYBRID CHAT =====
async function handleHybridChat(body: any): Promise<Response> {
  const messages = body.messages ?? []
  const userMessage =
    body.message ??
    [...messages].reverse().find((m: any) => m.role === 'user')?.content ??
    messages[messages.length - 1]?.content ??
    ''

  if (!userMessage?.trim()) {
    return json(
      {
        error: 'No user message provided',
        status: 'failed',
      },
      400
    )
  }

  const response: any = {
    status: 'failed',
    errors: {},
  }

  const systemPrompt = `You are Career Compass AI, a professional career advisor.
Provide helpful, actionable, personalized advice on job search, interviews, career development, and networking.
Be encouraging and professional.`

  try {
    const textResult = await callGeminiWithFallback(systemPrompt, userMessage)
    response.reply = textResult.reply
    response.text_model = textResult.model
  } catch (err: any) {
    logger.error('hybrid-chat', `Text generation failed: ${err.message}`)
    response.errors!.text_generation = err.message
  }

  try {
    const embeddingResult = await getEmbeddingWithFallback(userMessage)
    response.embedding = embeddingResult.embedding
    response.embedding_model = embeddingResult.model
  } catch (err: any) {
    logger.error('hybrid-chat', `Embedding failed: ${err.message}`)
    response.errors!.embedding = err.message
  }

  if (response.reply && response.embedding) {
    response.status = 'full'
  } else if (response.reply) {
    response.status = 'text_only'
  } else if (response.embedding) {
    response.status = 'embedding_only'
  } else {
    response.status = 'failed'
  }

  if (response.status === 'failed') {
    return json(response, 500)
  }

  return json(response, 200)
}

// ===== HANDLERS: EMBEDDINGS =====
async function handleEmbedding(body: any): Promise<Response> {
  const text = body.text ?? ''

  if (!text?.trim()) {
    return json({ error: 'No text provided for embedding' }, 400)
  }

  try {
    const result = await getEmbeddingWithFallback(text)
    return json({
      embedding: result.embedding,
      model: result.model,
      dimensions: result.dimensions,
    })
  } catch (error: any) {
    logger.error('embedding', `Error: ${error.message}`)
    return json({ error: error?.message || 'Embedding failed' }, 500)
  }
}

// ===== HANDLERS: SIMILARITY SEARCH =====
async function handleSimilaritySearch(body: any): Promise<Response> {
  const query = body.query ?? ''
  const candidates = body.candidates ?? []

  if (!query?.trim()) {
    return json({ error: 'No query provided' }, 400)
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return json({ error: 'No candidates provided' }, 400)
  }

  try {
    const queryEmbedding = await getEmbeddingWithFallback(query)

    const candidateResults = await Promise.all(
      candidates.map(async (candidate: string) => {
        try {
          const embedding = await getEmbeddingWithFallback(candidate)
          return {
            text: candidate,
            embedding: embedding.embedding,
            error: null,
          }
        } catch (err: any) {
          return {
            text: candidate,
            embedding: null,
            error: err.message,
          }
        }
      })
    )

    function cosineSimilarity(a: number[], b: number[]): number {
      const dotProduct = a.reduce((sum, x, i) => sum + x * b[i], 0)
      const magnitudeA = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0))
      const magnitudeB = Math.sqrt(b.reduce((sum, x) => sum + x * x, 0))
      return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0
    }

    const scores = candidateResults
      .map((result) => ({
        text: result.text,
        similarity: result.embedding ? cosineSimilarity(queryEmbedding.embedding, result.embedding) : -1,
        error: result.error,
      }))
      .filter((item) => item.similarity >= 0)
      .sort((a, b) => b.similarity - a.similarity)

    return json({
      query,
      query_model: queryEmbedding.model,
      results: scores.slice(0, 10),
      total_candidates: candidates.length,
      successfully_scored: scores.length,
    })
  } catch (error: any) {
    logger.error('similarity-search', `Error: ${error.message}`)
    return json({ error: error?.message || 'Similarity search failed' }, 500)
  }
}

// ===== HANDLERS: STAR FEEDBACK =====
async function handleStarFeedback(body: any): Promise<Response> {
  try {
    const { question, situation, task, action, result, companyContext, cvContent } = body

    if (!question?.trim() || !situation?.trim() || !task?.trim() || !action?.trim() || !result?.trim()) {
      throw new ValidationError('Missing STAR components')
    }

    const systemPrompt = `You are an experienced HR interview coach. Evaluate STAR-format interview answers.

EVALUATION DIMENSIONS:
1. Clarity - Is the story easy to follow?
2. Relevance - Does it directly answer the question?
3. Specificity - Concrete details, numbers, outcomes?
4. Action Ownership - Did they take action?
5. Result Impact - What was the measurable outcome?
6. Learning - Does it show growth?

FEEDBACK STRUCTURE:
- Opening impression (1-2 sentences)
- Strengths (2-3 specific positives)
- Areas for improvement (2-3 suggestions)
- Reframed answer (show how to improve)
- Score out of 10

Be encouraging but honest.

${companyContext ? `\n\nCompany Context:\n${companyContext}` : ''}
${cvContent ? `\n\nCandidate CV:\n${cvContent.slice(0, 1500)}` : ''}`

    const userMessage = `Interview Question: "${question}"

SITUATION: ${situation}
TASK: ${task}
ACTION: ${action}
RESULT: ${result}

Please evaluate this STAR answer with specific, actionable feedback.`

    const result_obj = await callGeminiWithFallback(systemPrompt, userMessage)

    const scoreMatch = result_obj.reply.match(/Score[:\s]*(\d+)\s*\/\s*10/i)
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 7

    const response = {
      feedback: cleanMarkdown(result_obj.reply),
      score: Math.min(10, Math.max(0, score)),
      model: result_obj.model,
    }

    logger.info('star-feedback', 'Feedback generated', { score: response.score })
    return json(response, 200)
  } catch (error: any) {
    logger.error('star-feedback', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to evaluate STAR answer' }, 500)
  }
}

// ===== HANDLERS: INTERVIEW VERDICT =====
async function handleInterviewVerdict(body: any): Promise<Response> {
  try {
    const { companyName, interviewAnswers, companyResearch, cvContent } = body

    if (!companyName?.trim()) {
      throw new ValidationError('Company name is required')
    }

    if (!Array.isArray(interviewAnswers) || interviewAnswers.length === 0) {
      throw new ValidationError('No interview answers provided')
    }

    const qaTranscript = interviewAnswers
      .map((qa: any, i: number) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
      .join('\n\n')

    const systemPrompt = `You are a strict HR recruitment panel evaluating a mock interview at ${companyName}.

EVALUATION CRITERIA:
1. Relevance - Answers address questions
2. Depth - Specific examples
3. Communication - Clear, organized, confident
4. Technical Fit - Skills match
5. Cultural Fit - Company understanding
6. Potential - Can grow into role
7. Authenticity - Genuine vs rehearsed

VERDICT OPTIONS:
- ACCEPTED (8-10): Impressive, strong hire
- SHORTLISTED (6-7): Good effort, needs improvement
- REJECTED (1-5): Significant gaps

For EACH answer: score (1-10), strengths, weaknesses.

Then overall verdict, score, top 3 improvements, recommendation.

${companyResearch ? `\n\nCompany Profile:\n${companyResearch}` : ''}
${cvContent ? `\n\nCandidate CV:\n${cvContent.slice(0, 2000)}` : ''}

Be HONEST. Output as JSON.`

    const userMessage = `Candidate Interview Answers:\n\n${qaTranscript}\n\nProvide complete interview verdict in JSON format.`

    const result = await callGeminiWithFallback(systemPrompt, userMessage)

    const verdictJSON = extractJSON<any>(result.reply, {})

    const verdict = verdictJSON?.verdict?.toLowerCase()
    const overallScore = verdictJSON?.overall_score ?? 6

    const response = {
      verdict: ['accepted', 'shortlisted', 'rejected'].includes(verdict) ? verdict : 'shortlisted',
      score: overallScore,
      answers: verdictJSON?.answers ?? [],
      overallFeedback: result.reply,
      areasToImprove: verdictJSON?.top_improvements ?? [],
      recommendation: verdictJSON?.recommendation ?? '',
      model: result.model,
    }

    logger.info('interview-verdict', 'Verdict generated', { verdict: response.verdict })
    return json(response, 200)
  } catch (error: any) {
    logger.error('interview-verdict', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to evaluate interview' }, 500)
  }
}

// ===== HANDLERS: PARSE PROFILE FROM CV =====
async function handleParseProfileFromCv(body: any): Promise<Response> {
  try {
    const { cvContent } = body

    if (!cvContent?.trim()) {
      throw new ValidationError('CV content is required')
    }

    const systemPrompt = `You are an expert CV parser. Extract structured profile information. Return ONLY valid JSON:

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
    { "category": "skill", "value": "Technical skill" }
  ]
}

RULES:
- Extract EXACTLY what's in the CV
- If field not in CV, set to null or empty array
- Return ONLY valid JSON, no explanation

CV:\n${cvContent.slice(0, 5000)}`

    const result = await callGeminiWithFallback(
      'You are a document parser. Extract structured data from CVs.',
      cvContent.slice(0, 2000)
    )

    const parsed = extractJSON<any>(result.reply)

    if (!parsed) {
      throw new APIError('Could not parse CV. Ensure it is clear text.')
    }

    const response = {
      displayName: parsed.displayName || '',
      email: parsed.email || undefined,
      phone: parsed.phone || undefined,
      currentDegree: parsed.currentDegree || undefined,
      institution: parsed.institution || undefined,
      yearOfStudy: parsed.yearOfStudy || undefined,
      city: parsed.city || undefined,
      preferredIndustries: parsed.preferredIndustries || undefined,
      careerGoals: parsed.careerGoals || undefined,
      portfolioUrl: parsed.portfolioUrl || undefined,
      profileFields: parsed.profileFields || [],
      model: result.model,
    }

    logger.info('parse-profile-from-cv', 'Profile parsed', { name: response.displayName })
    return json(response, 200)
  } catch (error: any) {
    logger.error('parse-profile-from-cv', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to parse CV' }, 500)
  }
}

// ===== HANDLERS: DRAFT LETTER =====
async function handleDraftLetter(body: any): Promise<Response> {
  const companyName = body.companyName ?? ''
  const role = body.role ?? ''
  const degree = body.degree ?? ''
  const letterType = body.letterType ?? 'Cover Letter'
  const studentName = body.studentName ?? ''
  const institution = body.institution ?? ''
  const skills = body.skills ?? ''
  const goals = body.goals ?? ''
  const portfolioUrl = body.portfolioUrl ?? ''
  const cvContent = body.cvContent ?? ''

  if (!companyName?.trim()) {
    return json({ error: 'Company name required' }, 400)
  }

  const prompt = `Generate a professional ${letterType.toLowerCase()} for:
- Company: ${companyName}
- Role/Department: ${role}
- Student Name: ${studentName || 'Not provided'}
- Degree: ${degree}
- Institution: ${institution || 'Not provided'}
- Skills: ${skills || 'Not provided'}
- Goals: ${goals || 'Not provided'}
- Portfolio: ${portfolioUrl || 'Not provided'}
${cvContent ? `\n\nCV:\n${cvContent.slice(0, 2000)}` : ''}

Write compelling, professional letter that:
1. Opens with strong introduction
2. Highlights relevant skills
3. Shows company understanding
4. Explains why they're good fit
5. Includes clear call to action

Keep it 300-400 words.`

  try {
    const result = await callGeminiWithFallback(
      'You are a professional letter writing assistant. Generate polished, compelling letters.',
      prompt
    )
    return json({
      letter: result.reply,
      model: result.model,
    })
  } catch (error: any) {
    logger.error('draft-letter', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to generate letter' }, 500)
  }
}

async function handleDiscoverCompanies(body: any): Promise<Response> {
  const location = body.location ?? ''
  const industry = body.industry ?? ''
  const skills = body.skills ?? ''
  const degree = body.degree ?? ''

  if (!location?.trim()) {
    return json({ error: 'Location is required to search for companies' }, 400)
  }

  const prompt = `Find 10-15 companies in ${location} that would be good opportunities for:
- Industry: ${industry || 'any'}
- Skills: ${skills || 'general'}
- Education: ${degree || 'any degree'}

For each company provide:
1. Company name
2. Industry
3. Why it's a good fit
4. Types of roles they hire for
5. Company size
6. Website if known

Focus on Zambian companies when possible. Format as JSON array with: {name, industry, whyGoodFit, typesOfRoles, size, website}`

  try {
    const result = await callGeminiWithFallback(
      'You are a career advisor specializing in company research. Provide accurate company information.',
      prompt
    )

    let companies: any = []
    try {
      const jsonMatch = result.reply.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        companies = JSON.parse(jsonMatch[0])
      }
    } catch {
      companies = result.reply
    }

    return json({
      companies: companies || result.reply,
      model: result.model,
    })
  } catch (error: any) {
    logger.error('discover-companies', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to discover companies' }, 500)
  }
}

async function handleInterviewQuestions(body: any): Promise<Response> {
  const role = body.role ?? ''
  const company = body.company ?? ''
  const skills = body.skills ?? ''
  const experience = body.experience ?? ''

  const prompt = `Generate interview preparation questions for:
- Role: ${role}
- Company: ${company || 'General'}
- Skills: ${skills || 'Not specified'}
- Experience: ${experience || 'Entry-level'}

Generate 15-20 questions across 3 categories:
1. Personal/Behavioral (5-7)
2. Company-Specific (5-7)
3. Role-Experience (5-6)

For each question, provide a brief tip on how to answer effectively.

Format as JSON: {
  "personal": [{"question": "...", "tip": "..."}],
  "company": [{"question": "...", "tip": "..."}],
  "experience": [{"question": "...", "tip": "..."}]
}`

  try {
    const result = await callGeminiWithFallback(
      'You are an expert interview coach. Generate realistic, thoughtful interview questions and coaching tips.',
      prompt
    )

    let questions = { personal: [], company: [], experience: [] }
    try {
      const jsonMatch = result.reply.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0])
      }
    } catch {
      return json({
        questions: result.reply,
        model: result.model,
      })
    }

    return json({
      personal: questions.personal || [],
      company: questions.company || [],
      experience: questions.experience || [],
      model: result.model,
    })
  } catch (error: any) {
    logger.error('interview-questions', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to generate questions' }, 500)
  }
}

async function handleExtractContent(body: any): Promise<Response> {
  const fileContent = body.fileContent ?? ''
  const category = body.category ?? 'Other'
  const contentType = body.contentType ?? 'text/plain'

  if (!fileContent?.trim()) {
    return json({ error: 'No file content provided' }, 400)
  }

  try {
    let textContent = fileContent

    // Check if content is base64-encoded (from mobile app file upload)
    if (isBase64(fileContent)) {
      logger.info('extract-content', 'Detected base64 content, decoding file', { contentType })
      textContent = await extractTextFromFile(fileContent, contentType)

      if (!textContent?.trim()) {
        return json({
          error: 'Could not extract text from file. Please try a different file format.',
          extractedText: '',
        }, 400)
      }
    }

    // Summarize the extracted text
    const prompt = `Extract and summarize key information from this ${category}:

${textContent.slice(0, 5000)}

Provide:
1. Main content summary (2-3 sentences)
2. Key skills/qualifications (if applicable)
3. Key achievements or points (if applicable)
4. Important dates/periods (if applicable)
5. Contact information (if applicable)

Be concise and well-structured. If any section is not applicable, skip it.`

    const result = await callGeminiWithFallback(
      'You are a document analysis expert. Extract and summarize key information from documents.',
      prompt
    )

    return json({
      extractedText: result.reply,
      model: result.model,
      rawText: textContent.slice(0, 2000), // Include first 2000 chars for reference
    })
  } catch (error: any) {
    logger.error('extract-content', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to extract content' }, 500)
  }
}

async function handleResearchCompany(body: any): Promise<Response> {
  const company = body.company ?? ''

  if (!company?.trim()) {
    return json({ error: 'Company name required' }, 400)
  }

  const prompt = `Provide a research summary for ${company}:

Include:
1. Company overview (what they do, size, founded)
2. Recent news/achievements
3. Company culture/values
4. Career opportunities
5. Interview tips
6. Salary ranges (if known)
7. Growth opportunities

Keep it 300-500 words. Focus on what a job seeker should know.`

  try {
    const result = await callGeminiWithFallback(
      'You are a career research specialist. Provide accurate company information.',
      prompt
    )
    return json({
      summary: result.reply,
      model: result.model,
    })
  } catch (error: any) {
    logger.error('research-company', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to research company' }, 500)
  }
}

// ===== EXTERNAL API FETCHERS =====
async function fetchEventbriteEvents(
  city: string,
  query: string,
  apiKey: string
): Promise<any[]> {
  logger.startTimer('eventbrite')

  if (!apiKey) {
    logger.warn('eventbrite', 'No API key configured')
    return []
  }

  try {
    const normalizedCity = normalizeLocation(city)
    const url = new URL(API_ENDPOINTS.eventbrite)
    
    url.searchParams.append('q', query)
    url.searchParams.append('location.address', normalizedCity)
    url.searchParams.append('start_date.range_start', new Date().toISOString())
    url.searchParams.append('expand', 'venue')
    url.searchParams.append('page_size', '15')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.eventbrite)

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      logger.warn('eventbrite', `API returned ${res.status}`)
      return []
    }

    const data = await res.json() as any
    const events = data.events?.map((e: any) => ({
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
    })) || []

    logger.endTimer('eventbrite', 'eventbrite-fetch', { count: events.length })
    return events
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('eventbrite', 'Request timed out')
    } else {
      logger.error('eventbrite', `Error: ${err.message}`)
    }
    return []
  }
}

async function fetchSerperEvents(
  query: string,
  apiKey: string
): Promise<any[]> {
  logger.startTimer('serper')

  if (!apiKey) {
    logger.warn('serper', 'No API key configured')
    return []
  }

  try {
    const searchQuery = `${query} networking events Zambia`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.serper)

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
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      logger.warn('serper', `API returned ${res.status}`)
      return []
    }

    const data = await res.json() as any
    const events = data.organic?.map((result: any, idx: number) => ({
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
    })) || []

    logger.endTimer('serper', 'serper-fetch', { count: events.length })
    return events
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('serper', 'Request timed out')
    } else {
      logger.error('serper', `Error: ${err.message}`)
    }
    return []
  }
}

async function fetchTavilyEvents(
  query: string,
  apiKey: string
): Promise<any[]> {
  logger.startTimer('tavily')

  if (!apiKey) {
    logger.warn('tavily', 'No API key configured')
    return []
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.tavily)

    const zambianDomains = [
      'eventbrite.com', 'meetup.com', 'lusakatimes.com', 'dailymail.co.zm',
      'times.co.zm', 'znbc.co.zm', 'zica.co.zm', 'eiz.org.zm', 'unza.zm',
      'cbu.ac.zm', 'africarena.com', 'careersafrica.com', 'linkedin.com',
    ]

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
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      logger.warn('tavily', `API returned ${res.status}`)
      return []
    }

    const data = await res.json() as any
    const events = data.results?.map((result: any, idx: number) => ({
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
    })) || []

    logger.endTimer('tavily', 'tavily-fetch', { count: events.length })
    return events
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn('tavily', 'Request timed out')
    } else {
      logger.error('tavily', `Error: ${err.message}`)
    }
    return []
  }
}

// ===== HANDLERS: NETWORKING EVENTS =====
async function handleNetworkingEvents(body: any): Promise<Response> {
  try {
    const { location, interests } = body
    const city = normalizeLocation(location || 'Lusaka, Zambia')

    logger.info('networking-events', 'Starting multi-source event search', { city, interests })

    // Parallel API calls
    const [eventbriteEvents, serperEvents, tavilyEvents] = await Promise.all([
      fetchEventbriteEvents(city, interests || 'career development', EVENTBRITE_API_KEY),
      fetchSerperEvents(interests || 'networking events', SERPER_API_KEY),
      fetchTavilyEvents(interests || 'professional development', TAVILY_API_KEY),
    ])

    // Aggregate
    const allEvents = [...eventbriteEvents, ...serperEvents, ...tavilyEvents]
    
    // Deduplicate by name similarity
    const uniqueEvents = Array.from(
      new Map(
        allEvents.map((e: any) => [
          e.eventName.toLowerCase().replace(/\s+/g, ''),
          e,
        ])
      ).values()
    )

    // Sort by relevance
    uniqueEvents.sort((a: any, b: any) => (b.relevance || 0) - (a.relevance || 0))

    let topEvents = uniqueEvents.slice(0, 15)

    // If few events, use Gemini grounding
    if (topEvents.length < 5) {
      logger.info('networking-events', 'Few events, using Gemini grounding')

      const geminiPrompt = `Suggest 5-10 professional networking events or webinars for ${interests || 'career development'} in Zambia or online.

For each: name, type, dates, location, why it matters.`

      try {
        const geminiResult = await callGeminiWithFallback(
          'You are a career networking advisor. Suggest real, valuable opportunities.',
          geminiPrompt
        )

        const geminiEvent = {
          id: 'gemini-suggestions',
          eventName: 'Gemini AI Suggestions',
          eventType: 'other',
          location: city,
          isOnline: false,
          description: geminiResult.reply.slice(0, 300),
          relevance: 0.6,
          source: 'gemini',
        }

        topEvents.push(geminiEvent)
      } catch (err: any) {
        logger.warn('networking-events', `Gemini fallback failed: ${err.message}`)
      }
    }

    const sources = Array.from(new Set(topEvents.map((e: any) => e.source)))

    const response = {
      events: topEvents,
      totalFound: allEvents.length,
      sources,
    }

    logger.info('networking-events', 'Events compiled', {
      total: response.events.length,
      sources: response.sources,
    })

    return json(response, 200)
  } catch (error: any) {
    logger.error('networking-events', `Error: ${error.message}`)
    return json({ error: error?.message || 'Failed to find events' }, 500)
  }
}

// ===== HEALTH CHECK =====
async function handleHealthCheck(): Promise<Response> {
  const checks = {
    gemini: !!GEMINI_API_KEY,
    eventbrite: !!EVENTBRITE_API_KEY,
    serper: !!SERPER_API_KEY,
    tavily: !!TAVILY_API_KEY,
  }

  const allConfigured = Object.values(checks).some((v) => v)

  const response = {
    status: allConfigured ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: checks,
  }

  logger.info('health-check', 'Health check performed', checks)

  return json(response, allConfigured ? 200 : 503)
}

// ===== MAIN HANDLER =====
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