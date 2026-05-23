export class AIServiceError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class ValidationError extends AIServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class APIError extends AIServiceError {
  constructor(message: string, statusCode: number = 503, details?: Record<string, unknown>) {
    super('API_ERROR', statusCode, message, details);
    this.name = 'APIError';
  }
}

export class RateLimitError extends AIServiceError {
  constructor(message: string = 'Rate limit exceeded') {
    super('RATE_LIMIT_ERROR', 429, message);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends AIServiceError {
  constructor(service: string) {
    super('TIMEOUT_ERROR', 504, `${service} request timed out`);
    this.name = 'TimeoutError';
  }
}

export function isRetryable(error: AIServiceError): boolean {
  return [503, 429, 504].includes(error.statusCode);
}
