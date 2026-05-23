import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
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

// Models - Primary and Fallback
const GENERATION_MODELS = {
  primary: 'gemini-2.5-flash',
  fallback: 'gemini-1.5-flash',
}

const EMBEDDING_MODELS = {
  primary: 'gemini-embedding-001',
  fallback: 'gemini-embedding-2',
}

// Build URLs for models
function getGenerationUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
}

function getEmbeddingUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
}

interface TextResponse {
  reply: string
  model: string
  isComplete: boolean
}

interface EmbeddingResponse {
  embedding: number[]
  model: string
  dimensions: number
}

interface HybridResponse {
  reply?: string
  embedding?: number[]
  text_model?: string
  embedding_model?: string
  status: 'full' | 'text_only' | 'embedding_only' | 'failed'
  errors?: Record<string, string>
}

// ===== TEXT GENERATION WITH FALLBACK =====
async function callGeminiWithFallback(
  systemPrompt: string,
  userMessage: string
): Promise<TextResponse> {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY secret')
  if (!userMessage?.trim()) throw new Error('Empty user message')

  const models = [GENERATION_MODELS.primary, GENERATION_MODELS.fallback]
  let lastError = ''

  for (const model of models) {
    try {
      console.log(`Attempting text generation with: ${model}`)

      const url = getGenerationUrl(model)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      })

      const text = await res.text().catch(() => '')

      if (!res.ok) {
        lastError = `${model} ${res.status}: ${text.slice(0, 300)}`
        console.warn(`Text generation failed with ${model}`, {
          status: res.status,
          error: lastError,
        })
        continue
      }

      const data = JSON.parse(text)
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      if (!reply?.trim()) {
        lastError = `${model} returned empty response`
        console.warn(lastError)
        continue
      }

      console.log(`✅ Text generation successful with ${model}`)
      return {
        reply: reply.trim(),
        model,
        isComplete: true,
      }
    } catch (err: any) {
      lastError = err.message
      console.error(`Text generation error with ${model}:`, lastError)
    }
  }

  throw new Error(`All text generation models failed. Last error: ${lastError}`)
}

// ===== EMBEDDINGS WITH FALLBACK =====
async function getEmbeddingWithFallback(text: string): Promise<EmbeddingResponse> {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY secret')
  if (!text?.trim()) throw new Error('Empty text for embedding')

  const models = [EMBEDDING_MODELS.primary, EMBEDDING_MODELS.fallback]
  let lastError = ''

  for (const model of models) {
    try {
      console.log(`Attempting embedding with: ${model}`)

      const url = getEmbeddingUrl(model)
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
        console.warn(`Embedding failed with ${model}`, {
          status: res.status,
          error: lastError,
        })
        continue
      }

      const data = JSON.parse(responseText)
      const embedding = data?.embedding?.values ?? []

      if (!Array.isArray(embedding) || embedding.length === 0) {
        lastError = `${model} returned invalid embedding`
        console.warn(lastError)
        continue
      }

      console.log(`✅ Embedding successful with ${model} (${embedding.length} dimensions)`)
      return {
        embedding,
        model,
        dimensions: embedding.length,
      }
    } catch (err: any) {
      lastError = err.message
      console.error(`Embedding error with ${model}:`, lastError)
    }
  }

  throw new Error(`All embedding models failed. Last error: ${lastError}`)
}

// ===== HYBRID MODE: Both embeddings + text =====
async function handleHybridChat(body: Record<string, unknown>): Promise<Response> {
  const messages = (body.messages as Array<{ role: string; content: string }>) ?? []
  const userMessage =
    (body.message as string | undefined) ??
    [...messages].reverse().find((m) => m.role === 'user')?.content ??
    messages[messages.length - 1]?.content ??
    ''

  if (!userMessage?.trim()) {
    return json({
      error: 'No user message provided',
      status: 'failed',
    } as HybridResponse, 400)
  }

  const response: HybridResponse = {
    status: 'failed',
    errors: {},
  }

  const systemPrompt = `You are Career Compass AI, a professional career advisor helping users with:
- Job search strategies and opportunities
- Interview preparation and tips
- Resume optimization and review
- Career guidance and development
- Networking strategies and tips
- LinkedIn profile optimization
- Salary negotiation advice
- Industry insights and trends

Provide helpful, actionable, and personalized advice tailored to their specific situation.
Be encouraging and professional.`

  try {
    const textResult = await callGeminiWithFallback(systemPrompt, userMessage)
    response.reply = textResult.reply
    response.text_model = textResult.model
  } catch (err: any) {
    console.error('Text generation failed:', err.message)
    response.errors!.text_generation = err.message
  }

  try {
    const embeddingResult = await getEmbeddingWithFallback(userMessage)
    response.embedding = embeddingResult.embedding
    response.embedding_model = embeddingResult.model
  } catch (err: any) {
    console.error('Embedding failed:', err.message)
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

// ===== EXTRACT PROFILE FIELDS FROM AI RESPONSE =====
function extractProfileFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  
  // Match patterns like "Skills: JavaScript, React, Node.js"
  const skillsMatch = text.match(/(?:skills?|technical skills?):\s*([^\n.]+)/i)
  if (skillsMatch) fields['skills'] = skillsMatch[1].trim()
  
  // Match "Degree: Bachelor of Science" or "Studying: BSc"
  const degreeMatch = text.match(/(?:degree|studying|pursuing):\s*([^\n.]+)/i)
  if (degreeMatch) fields['currentDegree'] = degreeMatch[1].trim()
  
  // Match "University: Stanford" or "Institution: MIT"
  const instMatch = text.match(/(?:university|institution|college):\s*([^\n.]+)/i)
  if (instMatch) fields['institution'] = instMatch[1].trim()
  
  // Match "Year: 3rd" or "Year of Study: Junior"
  const yearMatch = text.match(/(?:year|year of study):\s*([^\n.]+)/i)
  if (yearMatch) fields['yearOfStudy'] = yearMatch[1].trim()
  
  // Match "City: San Francisco" or "Location: NYC"
  const cityMatch = text.match(/(?:city|location|based in):\s*([^\n.]+)/i)
  if (cityMatch) fields['city'] = cityMatch[1].trim()
  
  // Match "Industries: Tech, AI" or "Interested in: Finance"
  const industryMatch = text.match(/(?:interested in|industries?|sectors?):\s*([^\n.]+)/i)
  if (industryMatch) fields['preferredIndustries'] = industryMatch[1].trim()
  
  // Match "Goals: Become a PM" or "Career goals: Leadership"
  const goalsMatch = text.match(/(?:goals?|career goals|aspiring to):\s*([^\n.]+)/i)
  if (goalsMatch) fields['careerGoals'] = goalsMatch[1].trim()
  
  // Match "Portfolio: example.com" or "Website: mysite.com"
  const portfolioMatch = text.match(/(?:portfolio|website|github):\s*(https?:\/\/[^\s\n]+)/i)
  if (portfolioMatch) fields['portfolioUrl'] = portfolioMatch[1].trim()
  
  return fields
}

// ===== TEXT-ONLY MODE (backwards compatible, with profile extraction) =====
async function handleProfileChat(body: Record<string, unknown>): Promise<Response> {
  const messages = (body.messages as Array<{ role: string; content: string }>) ?? []
  const userMessage =
    (body.message as string | undefined) ??
    [...messages].reverse().find((m) => m.role === 'user')?.content ??
    messages[messages.length - 1]?.content ??
    ''

  if (!userMessage?.trim()) {
    return json({ error: 'No user message provided' }, 400)
  }

  const existingProfile = (body.existingProfile as Record<string, unknown>) ?? {}

  const system = `You are Career Compass AI, a professional career advisor having a deep discovery conversation during onboarding.

YOUR PRIMARY GOAL: Ask thoughtful follow-up questions to understand the user deeply. Don't just respond to their questions—ask probing questions about:
- Their core skills and technical expertise
- Work experience and past achievements
- Career goals for the next 2-5 years
- Industries or roles they're interested in
- Educational background
- Preferred work environment (startup, corporate, remote, etc.)
- What they're passionate about

CONVERSATION FLOW:
1. Start with their name and what brought them here
2. Explore one topic deeply per turn (skills, experience, goals, interests)
3. Ask follow-up questions that build on their answers
4. Make them feel heard by referencing previous answers
5. Continue the conversation indefinitely until they choose to move forward

IMPORTANT:
- Don't close the conversation early or act like the profile is complete
- Always end with an open-ended question to keep them talking
- Be warm, encouraging, and genuinely interested
- Extract and mention specific details they share
- Remember everything they tell you and reference it naturally

Example style:
"That's great! I see you have 3 years of React experience. How have you grown from that first React project? What was the biggest challenge you've overcome?"

Provide helpful, actionable, and personalized advice.
Be encouraging and professional.
Keep the conversation flowing naturally.`

  try {
    const result = await callGeminiWithFallback(system, userMessage)
    
    // Extract any profile fields mentioned in the response
    const extractedFields = extractProfileFields(result.reply)
    const partialProfile = Object.keys(extractedFields).length > 0 ? extractedFields : undefined

    return json({
      reply: result.reply,
      isComplete: false,  // Never mark as complete - keep conversation open
      model: result.model,
      partialProfile,
      profileData: existingProfile,
    })
  } catch (error: any) {
    console.error('Profile chat error:', error)
    return json({ error: error?.message || 'Failed to generate response' }, 500)
  }
}

// ===== EMBEDDING-ONLY MODE =====
async function handleEmbedding(body: Record<string, unknown>): Promise<Response> {
  const text = (body.text as string | undefined) ?? ''

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
    console.error('Embedding error:', error)
    return json({ error: error?.message || 'Embedding failed' }, 500)
  }
}

// ===== SIMILARITY SEARCH =====
async function handleSimilaritySearch(body: Record<string, unknown>): Promise<Response> {
  const query = (body.query as string | undefined) ?? ''
  const candidates = (body.candidates as string[] | undefined) ?? []

  if (!query?.trim()) {
    return json({ error: 'No query provided' }, 400)
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return json({ error: 'No candidates provided' }, 400)
  }

  try {
    const queryEmbedding = await getEmbeddingWithFallback(query)

    const candidateResults = await Promise.all(
      candidates.map(async (candidate) => {
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
        similarity: result.embedding
          ? cosineSimilarity(queryEmbedding.embedding, result.embedding)
          : -1,
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
    console.error('Similarity search error:', error)
    return json({ error: error?.message || 'Similarity search failed' }, 500)
  }
}

// ===== DRAFT LETTER (NEW) =====
async function handleDraftLetter(body: Record<string, unknown>): Promise<Response> {
  const companyName = (body.companyName as string | undefined) ?? ''
  const role = (body.role as string | undefined) ?? ''
  const degree = (body.degree as string | undefined) ?? ''
  const letterType = (body.letterType as string | undefined) ?? 'Cover Letter'
  const studentName = (body.studentName as string | undefined) ?? ''
  const studentCity = (body.studentCity as string | undefined) ?? ''
  const institution = (body.institution as string | undefined) ?? ''
  const skills = (body.skills as string | undefined) ?? ''
  const goals = (body.goals as string | undefined) ?? ''
  const portfolioUrl = (body.portfolioUrl as string | undefined) ?? ''
  const cvContent = (body.cvContent as string | undefined) ?? ''

  if (!companyName?.trim()) {
    return json({ error: 'Company name required' }, 400)
  }

  const prompt = `Generate a professional ${letterType.toLowerCase()} for:
- Company: ${companyName}
- Role/Department: ${role}
- Student Name: ${studentName || '(Not provided)'}
- Degree: ${degree}
- Institution: ${institution || '(Not provided)'}
- Location: ${studentCity || '(Not provided)'}
- Skills: ${skills || '(Not provided)'}
- Career Goals: ${goals || '(Not provided)'}
- Portfolio: ${portfolioUrl || '(Not provided)'}
${cvContent ? `\nCV Content:\n${cvContent.slice(0, 2000)}` : ''}

Write a compelling, professional letter that:
1. Opens with a strong introduction
2. Highlights relevant skills and experience
3. Shows understanding of the company/role
4. Explains why they're a good fit
5. Includes a clear call to action

Keep it concise (300-400 words for cover letter, 200-300 for reference letter).`

  try {
    const result = await callGeminiWithFallback(
      'You are a professional letter writing assistant. Generate polished, compelling letters that stand out.',
      prompt
    )
    return json({
      letter: result.reply,
      model: result.model,
    })
  } catch (error: any) {
    console.error('Draft letter error:', error)
    return json({ error: error?.message || 'Failed to generate letter' }, 500)
  }
}

// ===== DISCOVER COMPANIES (NEW) =====
async function handleDiscoverCompanies(body: Record<string, unknown>): Promise<Response> {
  const location = (body.location as string | undefined) ?? ''
  const industry = (body.industry as string | undefined) ?? ''
  const skills = (body.skills as string | undefined) ?? ''
  const degree = (body.degree as string | undefined) ?? ''

  if (!location?.trim()) {
    return json({ error: 'Location required' }, 400)
  }

  const prompt = `Find and list 10-15 companies in ${location} that would be good opportunities for:
- Industry preference: ${industry || 'any'}
- Skills: ${skills || 'general'}
- Education: ${degree || 'any degree'}

For each company, provide:
1. Company name
2. Industry
3. Why it's a good fit
4. Type of roles they typically hire for
5. Estimated company size
6. Website/LinkedIn if known

Format as JSON array with: {name, industry, whyGoodFit, typesOfRoles, size, website}`

  try {
    const result = await callGeminiWithFallback(
      'You are a career advisor specializing in company research. Provide accurate, helpful information about companies and opportunities.',
      prompt
    )

    // Try to parse as JSON, fall back to text
    let companies: any = []
    try {
      const jsonMatch = result.reply.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        companies = JSON.parse(jsonMatch[0])
      }
    } catch {
      // If JSON parsing fails, return as text
      companies = result.reply
    }

    return json({
      companies: companies || result.reply,
      model: result.model,
    })
  } catch (error: any) {
    console.error('Discover companies error:', error)
    return json({ error: error?.message || 'Failed to discover companies' }, 500)
  }
}

// ===== INTERVIEW QUESTIONS (NEW) =====
async function handleInterviewQuestions(body: Record<string, unknown>): Promise<Response> {
  const role = (body.role as string | undefined) ?? ''
  const company = (body.company as string | undefined) ?? ''
  const skills = (body.skills as string | undefined) ?? ''
  const experience = (body.experience as string | undefined) ?? ''

  const prompt = `Generate interview preparation questions for:
- Role: ${role}
- Company: ${company || 'General'}
- Key Skills: ${skills || 'Not specified'}
- Experience Level: ${experience || 'Entry-level'}

Generate 15-20 questions across 3 categories:
1. Personal/Behavioral Questions (5-7)
2. Company-Specific Questions (5-7)
3. Role-Experience Questions (5-6)

For each question, also provide a brief tip on how to answer it effectively.

Format as JSON: {
  personal: [{question: "...", tip: "..."}],
  company: [{question: "...", tip: "..."}],
  experience: [{question: "...", tip: "..."}]
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
      // Return as text if JSON parsing fails
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
    console.error('Interview questions error:', error)
    return json({ error: error?.message || 'Failed to generate questions' }, 500)
  }
}

// ===== EXTRACT CONTENT (NEW) =====
async function handleExtractContent(body: Record<string, unknown>): Promise<Response> {
  const fileContent = (body.fileContent as string | undefined) ?? ''
  const category = (body.category as string | undefined) ?? 'Other'

  if (!fileContent?.trim()) {
    return json({ error: 'No file content provided' }, 400)
  }

  const prompt = `Extract and summarize the key information from this ${category}:

${fileContent.slice(0, 5000)}

Provide:
1. Main content summary
2. Key skills/qualifications mentioned
3. Key achievements or highlights
4. Dates/periods covered
5. Relevant contact information if any

Be concise and structured.`

  try {
    const result = await callGeminiWithFallback(
      'You are a document analysis expert. Extract and summarize key information from professional documents.',
      prompt
    )

    return json({
      extractedText: result.reply,
      model: result.model,
    })
  } catch (error: any) {
    console.error('Extract content error:', error)
    return json({ error: error?.message || 'Failed to extract content' }, 500)
  }
}

// ===== RESEARCH COMPANY (NEW) =====
async function handleResearchCompany(body: Record<string, unknown>): Promise<Response> {
  const company = (body.company as string | undefined) ?? ''

  if (!company?.trim()) {
    return json({ error: 'Company name required' }, 400)
  }

  const prompt = `Provide a research summary for ${company}:

Include:
1. Company overview (what they do, size, founded)
2. Recent news/achievements
3. Company culture/values
4. Career opportunities
5. Interview tips for this company
6. Salary ranges (if known)
7. Growth opportunities

Keep it concise (300-500 words). Focus on what a job seeker should know.`

  try {
    const result = await callGeminiWithFallback(
      'You are a career research specialist. Provide accurate, helpful company information for job seekers.',
      prompt
    )

    return json({
      summary: result.reply,
      model: result.model,
    })
  } catch (error: any) {
    console.error('Research company error:', error)
    return json({ error: error?.message || 'Failed to research company' }, 500)
  }
}

// ===== NETWORKING EVENTS (existing but improved) =====
async function handleNetworkingEvents(body: Record<string, unknown>): Promise<Response> {
  const location = (body.location as string | undefined) ?? ''
  const interests = (body.interests as string | undefined) ?? ''

  const prompt = `Suggest 8-12 networking events, webinars, or conferences relevant for someone in ${location} interested in ${interests || 'tech careers'}:

For each event, provide:
1. Event name
2. Type (conference, webinar, meetup, etc.)
3. Approximate dates
4. Location (online/in-person)
5. Why it's valuable
6. How to find more info

Format as clear, actionable recommendations.`

  try {
    const result = await callGeminiWithFallback(
      'You are a career networking advisor. Suggest relevant, valuable networking opportunities.',
      prompt
    )

    return json({
      events: result.reply,
      model: result.model,
    })
  } catch (error: any) {
    console.error('Networking events error:', error)
    return json({ error: error?.message || 'Failed to suggest events' }, 500)
  }
}

// ===== MAIN HANDLER =====
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json()
    const action = body?.action as string | undefined

    console.log('ai-service invoked', {
      action,
      timestamp: new Date().toISOString(),
    })

    if (!action) {
      return json({ error: 'Missing body.action' }, 400)
    }

    switch (action) {
      // Existing actions
      case 'profile-chat':
        return await handleProfileChat(body)
      case 'hybrid-chat':
        return await handleHybridChat(body)
      case 'embed':
        return await handleEmbedding(body)
      case 'similarity-search':
        return await handleSimilaritySearch(body)
      case 'networking-events':
        return await handleNetworkingEvents(body)

      // New actions
      case 'draft-letter':
        return await handleDraftLetter(body)
      case 'discover-companies':
        return await handleDiscoverCompanies(body)
      case 'interview-questions':
        return await handleInterviewQuestions(body)
      case 'extract-content':
        return await handleExtractContent(body)
      case 'research-company':
        return await handleResearchCompany(body)

      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (error: any) {
    console.error('ai-service error', {
      message: error?.message,
      stack: error?.stack?.slice(0, 500),
      timestamp: new Date().toISOString(),
    })
    return json(
      { error: error?.message || 'Internal Server Error' },
      500
    )
  }
})
