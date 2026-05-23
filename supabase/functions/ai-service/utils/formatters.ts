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
