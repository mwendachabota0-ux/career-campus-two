// ===== REQUEST BODY TYPES =====

export interface ProfileChatBody {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  message?: string;
  existingProfile?: Record<string, unknown>;
  cvContent?: string;
}

export interface StarFeedbackBody {
  question: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  companyContext?: string;
  cvContent?: string;
}

export interface InterviewVerdictBody {
  companyName: string;
  interviewAnswers: Array<{ question: string; answer: string }>;
  companyResearch?: string;
  cvContent?: string;
}

export interface ParseProfileBody {
  cvContent: string;
}

export interface NetworkingEventsBody {
  location?: string;
  city?: string;
  interests?: string;
  goals?: string;
  studentLevel?: string;
}

// ===== RESPONSE TYPES =====

export interface ProfileChatResponse {
  reply: string;
  isComplete: boolean;
  model: string;
  profileData?: Record<string, unknown>;
  partialProfile?: Record<string, string | string[]>;
  errors?: Record<string, string>;
}

export interface StarFeedbackResponse {
  feedback: string;
  score: number;
  model: string;
  dimension?: string;
}

export interface InterviewVerdictResponse {
  verdict: 'accepted' | 'shortlisted' | 'rejected';
  score: number;
  answers: Array<{
    question: string;
    answer: string;
    score: number;
    feedback: string;
  }>;
  overallFeedback: string;
  areasToImprove: string[];
  recommendation: string;
  model: string;
}

export interface ParsedProfileResponse {
  displayName: string;
  email?: string;
  phone?: string;
  currentDegree?: string;
  institution?: string;
  yearOfStudy?: string;
  city?: string;
  preferredIndustries?: string[];
  careerGoals?: string;
  portfolioUrl?: string;
  profileFields: Array<{
    category: string;
    value: string;
  }>;
  model: string;
}

export interface NetworkingEvent {
  id: string;
  eventName: string;
  eventType: string;
  date?: string;
  location: string;
  isOnline: boolean;
  description: string;
  relevance: number;
  source: string;
  url?: string;
}

export interface NetworkingEventsResponse {
  events: NetworkingEvent[];
  totalFound: number;
  sources: string[];
  model?: string;
  errors?: Record<string, string>;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  timestamp: string;
  details?: Record<string, string>;
}

// ===== INTERNAL TYPES =====

export interface StudentProfile {
  displayName?: string;
  email?: string;
  phone?: string;
  currentDegree?: string;
  institution?: string;
  yearOfStudy?: string;
  city?: string;
  preferredIndustries?: string[];
  careerGoals?: string;
  portfolioUrl?: string;
  profileFields?: Array<{ category: string; value: string }>;
}

export interface DocumentContext {
  name: string;
  category: string;
  extractedText: string;
}

export interface TextResponse {
  reply: string;
  model: string;
  isComplete: boolean;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
}

export interface HybridResponse {
  reply?: string;
  embedding?: number[];
  text_model?: string;
  embedding_model?: string;
  status: 'full' | 'text_only' | 'embedding_only' | 'failed';
  errors?: Record<string, string>;
}
