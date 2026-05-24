// ===== GEMINI MODELS =====
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

// ===== API ENDPOINTS =====
export const API_ENDPOINTS = {
  gemini: 'https://generativelanguage.googleapis.com/v1/models',
  eventbrite: 'https://www.eventbriteapi.com/v3/events/search/',
  serper: 'https://google.serper.dev/search',
  tavily: 'https://api.tavily.com/search',
};

// ===== TIMEOUTS (milliseconds) =====
export const TIMEOUTS = {
  gemini: 60_000,
  eventbrite: 10_000,
  serper: 10_000,
  tavily: 15_000,
  default: 30_000,
};

// ===== ZAMBIAN CONTEXT =====
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
    'Nursing Council of Zambia',
    'TEVETA (Technical Education, Vocational and Entrepreneurship Training Authority)',
  ],
  languages: ['English', 'Nyanja', 'Bemba', 'Tonga', 'Lozi', 'Kaonde'],
  jobTypes: ['Industrial Attachment', 'Internship', 'Graduate Programme', 'Volunteer', 'Contract'],
  industries: [
    'Mining & Minerals',
    'Agriculture',
    'Energy & Utilities',
    'Finance & Banking',
    'Telecommunications',
    'Healthcare',
    'Education',
    'Government',
    'NGOs',
    'Technology',
  ],
};

// ===== RESPONSE STATUSES =====
export const RESPONSE_STATUS = {
  FULL: 'full',
  TEXT_ONLY: 'text_only',
  EMBEDDING_ONLY: 'embedding_only',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

// ===== RATE LIMITING =====
export const RATE_LIMITS = {
  maxRequestsPerMinute: 60,
  maxTokensPerMinute: 90_000,
};
