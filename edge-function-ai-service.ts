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
  fallback: 'gemini-1.5-flash', // Will try if 2.5 fails
}

const EMBEDDING_MODELS = {
  primary: 'gemini-embedding-001',
  fallback: 'gemini-embedding-2', // Will try if embedding-001 fails
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
            maxOutputTokens: 1024,
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
        continue // Try next model
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
      // Continue to next model
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
      // Continue to next model
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

  // Try text generation
  try {
    const textResult = await callGeminiWithFallback(systemPrompt, userMessage)
    response.reply = textResult.reply
    response.text_model = textResult.model
  } catch (err: any) {
    console.error('Text generation failed:', err.message)
    response.errors!.text_generation = err.message
  }

  // Try embedding (even if text fails)
  try {
    const embeddingResult = await getEmbeddingWithFallback(userMessage)
    response.embedding = embeddingResult.embedding
    response.embedding_model = embeddingResult.model
  } catch (err: any) {
    console.error('Embedding failed:', err.message)
    response.errors!.embedding = err.message
  }

  // Determine final status
  if (response.reply && response.embedding) {
    response.status = 'full'
  } else if (response.reply) {
    response.status = 'text_only'
  } else if (response.embedding) {
    response.status = 'embedding_only'
  } else {
    response.status = 'failed'
  }

  // If both failed, return error
  if (response.status === 'failed') {
    return json(response, 500)
  }

  // At least one succeeded
  return json(response, 200)
}

// ===== TEXT-ONLY MODE (for backwards compatibility) =====
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

  const system = `You are Career Compass AI, a professional career advisor helping users with:
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
    const result = await callGeminiWithFallback(system, userMessage)
    return json({
      reply: result.reply,
      isComplete: true,
      model: result.model,
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

// ===== SIMILARITY SEARCH (uses embeddings to find similar content) =====
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
    // Get embedding for query
    const queryEmbedding = await getEmbeddingWithFallback(query)

    // Get embeddings for all candidates
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

    // Calculate cosine similarity
    function cosineSimilarity(a: number[], b: number[]): number {
      const dotProduct = a.reduce((sum, x, i) => sum + x * b[i], 0)
      const magnitudeA = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0))
      const magnitudeB = Math.sqrt(b.reduce((sum, x) => sum + x * x, 0))
      return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0
    }

    // Score and sort candidates
    const scores = candidateResults
      .map((result) => ({
        text: result.text,
        similarity: result.embedding
          ? cosineSimilarity(queryEmbedding.embedding, result.embedding)
          : -1,
        error: result.error,
      }))
      .filter((item) => item.similarity >= 0) // Only include successful embeddings
      .sort((a, b) => b.similarity - a.similarity)

    return json({
      query,
      query_model: queryEmbedding.model,
      results: scores.slice(0, 10), // Top 10
      total_candidates: candidates.length,
      successfully_scored: scores.length,
    })
  } catch (error: any) {
    console.error('Similarity search error:', error)
    return json({ error: error?.message || 'Similarity search failed' }, 500)
  }
}

// ===== NETWORKING EVENTS =====
async function handleNetworkingEvents(body: Record<string, unknown>): Promise<Response> {
  try {
    const userContext = JSON.stringify(body).slice(0, 2000)
    if (!userContext?.trim()) return json({ error: 'No data' }, 400)

    const result = await callGeminiWithFallback(
      'You are Career Compass AI. Suggest 5-10 networking events, conferences, and webinars relevant to the user. Be specific with event names, types, and dates.',
      userContext
    )

    return json({ events: result.reply, model: result.model, structured_events: [] })
  } catch (error: any) {
    console.error('Networking events error:', error)
    return json({ error: error?.message || 'Networking events failed' }, 500)
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
      // Backwards compatible text-only endpoint
      case 'profile-chat':
        return await handleProfileChat(body)

      // New hybrid endpoint - both embeddings + text
      case 'hybrid-chat':
        return await handleHybridChat(body)

      // Embeddings only
      case 'embed':
        return await handleEmbedding(body)

      // Semantic similarity search
      case 'similarity-search':
        return await handleSimilaritySearch(body)

      // Networking events
      case 'networking-events':
        return await handleNetworkingEvents(body)

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
