import { StudentProfile } from './types.ts';
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

export function buildDocumentContextString(documents: { name: string; extractedText: string }[]): string {
  if (!documents.length) return '';

  return documents
    .map((doc) => `[${doc.name}]\n${doc.extractedText.slice(0, 2000)}`)
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
  return `You are providing advice in the Zambian context. Consider:
- Major Zambian universities: UNZA, CBU, Mulungushi University
- Professional bodies: EIZ, ZICA, ICTAZ, LAZ
- Industries: Mining, Agriculture, Energy, Finance, Telecom, Healthcare
- Job types: Industrial Attachment, Internship, Graduate Programme
- Languages: English, Nyanja, Bemba, Tonga, Lozi
- Relevant qualifications: TEVETA certifications, professional certifications

Mention Zambian-specific context when relevant and use local terminology.`;
}
