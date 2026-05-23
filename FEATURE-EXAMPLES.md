# 🎯 Quick Start - New Features

## Letter Generation Example

**Action**: User taps "Generate Letter" for a company

**What happens**:
1. App sends to Edge Function:
```json
{
  "action": "draft-letter",
  "companyName": "Google",
  "role": "Software Engineer",
  "degree": "BS Computer Science",
  "skills": "Python, JavaScript, React",
  "goals": "Become a tech lead"
}
```

2. AI generates:
```
Dear Hiring Manager,

I am writing to express my strong interest in the Software Engineer position 
at Google. With a BS in Computer Science and expertise in Python, JavaScript, 
and React, I am confident in my ability to contribute...
```

3. User can copy/share/save the letter

---

## Company Discovery Example

**What happens**:
1. User enters location: "San Francisco"
2. App sends:
```json
{
  "action": "discover-companies",
  "location": "San Francisco",
  "industry": "Technology",
  "skills": "Python, Machine Learning"
}
```

3. Gets back company suggestions:
```json
{
  "companies": [
    {
      "name": "OpenAI",
      "industry": "AI/ML",
      "whyGoodFit": "Matches your ML background perfectly",
      "typesOfRoles": "ML Engineer, Research Engineer"
    },
    ...
  ]
}
```

---

## Interview Questions Example

**What happens**:
1. User generates questions for "Product Manager at Microsoft"
2. App sends:
```json
{
  "action": "interview-questions",
  "role": "Product Manager",
  "company": "Microsoft",
  "skills": "Leadership, Analytics"
}
```

3. Gets back:
```json
{
  "personal": [
    {
      "question": "Tell me about a time you had to make a difficult decision",
      "tip": "Use STAR method: Situation, Task, Action, Result"
    }
  ],
  "company": [
    {
      "question": "How would you approach improving Microsoft's cloud offering?",
      "tip": "Research Azure and recent product launches"
    }
  ],
  "experience": [...]
}
```

---

## Real-Time Profile Update Example

**While chatting with AI**:

User: "I'm a Python developer in London studying Computer Science"

AI: "Great! Python is in high demand right now. What specific areas interest you - web development, data science, or machine learning?"

**Meanwhile**, the profile panel shows:
- ✅ Skills: "Python"
- ✅ City: "London"
- ✅ Current Degree: "Computer Science"
- ⏳ (Updates as you chat)

User can click "Save" to persist all these updates at once.

---

## Document Extraction Example

**Upload CV**:
1. User selects CV file
2. App sends file content:
```json
{
  "action": "extract-content",
  "fileContent": "John Doe\n...[CV content]...",
  "category": "CV / Resume"
}
```

3. Gets back extracted text:
```json
{
  "extractedText": "Key Skills: Python, JavaScript, React, Node.js. Experience: 5 years at Tech Company as Full Stack Engineer..."
}
```

---

## All Supported Actions Quick Reference

### Profile Chat (Most Used)
```json
{
  "action": "profile-chat",
  "message": "Help me with my resume",
  "existingProfile": { /* optional */ }
}
```
Returns: `{ reply, partialProfile, profileData }`

### Draft Letter (New!)
```json
{
  "action": "draft-letter",
  "companyName": "...",
  "role": "...",
  "degree": "..."
}
```
Returns: `{ letter }`

### Discover Companies (New!)
```json
{
  "action": "discover-companies",
  "location": "...",
  "industry": "...",
  "skills": "..."
}
```
Returns: `{ companies }`

### Interview Questions (New!)
```json
{
  "action": "interview-questions",
  "role": "...",
  "company": "..."
}
```
Returns: `{ personal[], company[], experience[] }`

### Extract Content (New!)
```json
{
  "action": "extract-content",
  "fileContent": "...",
  "category": "CV / Resume"
}
```
Returns: `{ extractedText }`

### Research Company (New!)
```json
{
  "action": "research-company",
  "company": "..."
}
```
Returns: `{ summary }`

### Get Embedding
```json
{
  "action": "embed",
  "text": "..."
}
```
Returns: `{ embedding[], model, dimensions }`

### Similarity Search
```json
{
  "action": "similarity-search",
  "query": "...",
  "candidates": ["...", "..."]
}
```
Returns: `{ results[] }`

### Networking Events
```json
{
  "action": "networking-events",
  "location": "...",
  "interests": "..."
}
```
Returns: `{ events }`

### Hybrid Chat
```json
{
  "action": "hybrid-chat",
  "message": "..."
}
```
Returns: `{ reply, embedding[], status }`

---

## Response Status Codes

All successful responses return **200** with JSON data.

### Common Error Responses

**400 Bad Request**
```json
{"error": "Missing required field"}
```

**429 Too Many Requests**
```json
{"error": "AI is busy right now — please wait a moment"}
```

**503 Service Unavailable**
```json
{"error": "AI service is under high demand — retrying…"}
```

**500 Internal Server Error**
```json
{"error": "All models failed - error details..."}
```

---

## Testing Tips

1. **Test in browser DevTools**:
   - Press F12 → Network tab
   - Make request in app
   - See actual request/response

2. **Check Edge Function Logs**:
   - Supabase Dashboard → Edge Functions → ai-service → Logs
   - See what the function is doing

3. **Common Issues**:
   - API key missing → Check Secrets in Supabase
   - Timeout → Give it more time (first request can be slow)
   - "Unknown action" → Edge Function not deployed
   - Repeating requests → Check app retry logic

---

## Performance Notes

- **First request**: 3-10 seconds (cold start)
- **Subsequent requests**: 1-3 seconds
- **Embeddings**: 2-5 seconds per request
- **Letter generation**: 5-15 seconds

All requests have a 50-second timeout max.

---

## That's It!

Everything is configured and ready. Just:
1. Deploy the Edge Function
2. Rebuild the mobile app
3. Test the features
4. Enjoy! 🎉
