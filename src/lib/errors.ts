/**
 * Custom Error Classes for APOS
 */

export class APOSError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'APOSError';
  }
}

export class ValidationError extends APOSError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends APOSError {
  constructor(resource: string, id?: string | number) {
    const message = id 
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class LLMError extends APOSError {
  constructor(message: string, details?: any) {
    super(message, 'LLM_ERROR', 500, details);
    this.name = 'LLMError';
  }
}

export class GitError extends APOSError {
  constructor(message: string, details?: any) {
    super(message, 'GIT_ERROR', 500, details);
    this.name = 'GitError';
  }
}

export class DatabaseError extends APOSError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class ConfigurationError extends APOSError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error Response Builder
 */
export interface ErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: any;
  timestamp: string;
}

export function buildErrorResponse(error: unknown): ErrorResponse {
  const timestamp = new Date().toISOString();

  if (error instanceof APOSError) {
    return {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
      timestamp,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      timestamp,
    };
  }

  return {
    error: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
    timestamp,
  };
}

/**
 * Safe Error Logger
 * Logs errors without exposing sensitive information
 */
export function logError(error: unknown, context?: string) {
  const prefix = context ? `[${context}]` : '';
  
  if (error instanceof APOSError) {
    console.error(`${prefix} ${error.name}: ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    });
  } else if (error instanceof Error) {
    console.error(`${prefix} ${error.name}: ${error.message}`, {
      stack: error.stack,
    });
  } else {
    console.error(`${prefix} Unknown error:`, error);
  }
}

/**
 * Retry utility for transient failures
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Validate required environment variables
 */
export function validateEnv(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(', ')}`,
      { missing }
    );
  }
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logError(error, 'JSON Parse');
    return fallback;
  }
}

/**
 * Validate JSON structure against expected shape
 */
export function validateJsonStructure(
  data: unknown,
  expectedKeys: string[]
): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;
  return expectedKeys.every(key => key in obj);
}
