/**
 * Parse PARTIAL_PROFILE marker from AI response
 * Format: PARTIAL_PROFILE: { "displayName": "...", ... }
 */
export function extractPartialProfile(text: string): Record<string, unknown> | null {
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

/**
 * Parse PROFILE_COMPLETE marker from AI response
 * Format: PROFILE_COMPLETE: { "displayName": "...", ... }
 * Returns: { reply: string without markers, profile: parsed JSON or null }
 */
export function extractProfileComplete(text: string): {
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

/**
 * Remove markdown formatting and extra whitespace
 */
export function cleanMarkdown(text: string): string {
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
