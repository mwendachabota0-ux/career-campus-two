# Edge Function Complete - Reference

## Quick Copy-Paste Guide

If you need to deploy the Edge Function quickly:

### Location
- **File Name**: `edge-function-complete.ts` (in project root)
- **Deploy To**: Supabase Dashboard → Edge Functions → ai-service
- **Action**: Replace all existing code with this file

### Deployment Steps
1. Supabase Dashboard → Your Project
2. Edge Functions (left sidebar)
3. Click "ai-service"
4. Click "Edit Code"
5. Select ALL (Ctrl+A)
6. Delete everything
7. Paste `edge-function-complete.ts` contents
8. Click "Deploy"
9. Wait for ✓ checkmark

### Supported Actions

```json
{
  "action": "profile-chat",
  "message": "Your message",
  "existingProfile": { /* optional */ }
}
→ Returns: reply, partialProfile, profileData, model

{
  "action": "draft-letter",
  "companyName": "...",
  "role": "...",
  "degree": "..."
}
→ Returns: letter, model

{
  "action": "discover-companies",
  "location": "...",
  "industry": "..."
}
→ Returns: companies, model

{
  "action": "interview-questions",
  "role": "...",
  "company": "..."
}
→ Returns: personal[], company[], experience[], model

{
  "action": "extract-content",
  "fileContent": "...",
  "category": "CV / Resume"
}
→ Returns: extractedText, model

{
  "action": "research-company",
  "company": "..."
}
→ Returns: summary, model

{
  "action": "networking-events",
  "location": "...",
  "interests": "..."
}
→ Returns: events, model

{
  "action": "hybrid-chat",
  "message": "..."
}
→ Returns: reply, embedding[], status

{
  "action": "embed",
  "text": "..."
}
→ Returns: embedding[], dimensions, model

{
  "action": "similarity-search",
  "query": "...",
  "candidates": ["...", "..."]
}
→ Returns: query, results[], successfully_scored
```

## What's New in This Version

### Profile Field Extraction
The `profile-chat` action now automatically extracts profile information from AI responses:

- Detects "Skills: ..." patterns
- Detects "Degree: ..." patterns  
- Detects "City/Location: ..." patterns
- Detects institution, year of study, industries, goals
- Returns `partialProfile` with extracted fields
- App can use this for real-time profile suggestions

### New Actions
1. **draft-letter** - Generate professional letters
2. **discover-companies** - Find companies by criteria
3. **interview-questions** - Create interview prep
4. **extract-content** - Extract from documents
5. **research-company** - Company research

### Enhanced Error Handling
- Automatic model fallback (2.5-flash → 1.5-flash)
- Embedding fallback (embedding-001 → embedding-2)
- Graceful degradation with partial results
- Detailed error messages

### Improved Configuration
- Supports up to 2048 token outputs (was 1024)
- Better temperature settings for each use case
- Enhanced system prompts for better results

## Environment Variables

Make sure in Supabase you have:
```
GEMINI_API_KEY = your_actual_gemini_api_key
```

Get your key at: https://aistudio.google.com/app/apikeys

## Response Format

All responses are JSON:
```json
{
  "status": "success",
  "data": { /* action-specific data */ },
  "model": "gemini-2.5-flash",
  "errors": { /* optional */ }
}
```

Error responses:
```json
{
  "error": "Human readable error message",
  "status": "failed"
}
```

HTTP Status Codes:
- 200: Success
- 400: Bad request (missing fields)
- 429: Rate limited
- 500: Server error
- 503: Service unavailable

## Testing

### In Browser Console
```javascript
// Test profile-chat
fetch('https://YOUR_SUPABASE_URL/functions/v1/ai-service', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    action: 'profile-chat',
    message: 'Hello!'
  })
}).then(r => r.json()).then(console.log)
```

### In Supabase
1. Go to Edge Functions → ai-service
2. Look at the "Logs" tab
3. Make requests from your app
4. See what's happening in the logs

## Performance

First request: 3-10s (cold start)
Subsequent: 1-3s per request
Max timeout: 50 seconds

Common reasons for slowness:
- Gemini API busy (will auto-retry)
- Network latency
- First request of the day (cold start)

## Troubleshooting

**"Unknown action: draft-letter"**
→ Edge Function not deployed or code incomplete

**Request times out**
→ Gemini is busy, will auto-retry

**"GEMINI_API_KEY not found"**
→ Set in Supabase Secrets/Variables

**Bad response format**
→ Check logs in Supabase dashboard

## The Code

See `edge-function-complete.ts` for:
- `callGeminiWithFallback()` - Text generation with fallback
- `getEmbeddingWithFallback()` - Vector generation with fallback
- `extractProfileFields()` - Parse profile from text
- All action handlers
- Error handling and logging
- CORS headers and JSON responses

The code is ~650 lines, well-commented, and production-ready.

## Questions?

Check these files:
1. **DEPLOYMENT-GUIDE.md** - How to deploy
2. **FEATURE-EXAMPLES.md** - Example requests/responses
3. **IMPLEMENTATION-GUIDE.md** - Technical details
4. **COMPLETION-SUMMARY.md** - Full overview

That's it! 🚀
