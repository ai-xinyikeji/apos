import {
  APOSError,
  ValidationError,
  NotFoundError,
  LLMError,
  GitError,
  DatabaseError,
  ConfigurationError,
  buildErrorResponse,
  logError,
  retryWithBackoff,
  validateEnv,
  safeJsonParse,
  validateJsonStructure,
} from '../errors';

describe('Error Classes', () => {
  describe('APOSError', () => {
    it('should create error with correct properties', () => {
      const error = new APOSError('Test error', 'TEST_CODE', 400, { detail: 'test' });
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.name).toBe('APOSError');
    });

    it('should default to 500 status code', () => {
      const error = new APOSError('Test error', 'TEST_CODE');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with 400 status', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource name', () => {
      const error = new NotFoundError('User');
      
      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should include id in message', () => {
      const error = new NotFoundError('User', 123);
      expect(error.message).toBe('User with id 123 not found');
    });
  });

  describe('LLMError', () => {
    it('should create LLM error', () => {
      const error = new LLMError('API call failed');
      
      expect(error.message).toBe('API call failed');
      expect(error.code).toBe('LLM_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('GitError', () => {
    it('should create Git error', () => {
      const error = new GitError('Push failed');
      
      expect(error.message).toBe('Push failed');
      expect(error.code).toBe('GIT_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Connection failed');
      
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Missing API key');
      
      expect(error.message).toBe('Missing API key');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });
});

describe('buildErrorResponse', () => {
  it('should build response from APOSError', () => {
    const error = new ValidationError('Invalid input', { field: 'name' });
    const response = buildErrorResponse(error);
    
    expect(response.error).toBe('Invalid input');
    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.statusCode).toBe(400);
    expect(response.details).toEqual({ field: 'name' });
    expect(response.timestamp).toBeDefined();
  });

  it('should build response from standard Error', () => {
    const error = new Error('Something went wrong');
    const response = buildErrorResponse(error);
    
    expect(response.error).toBe('Something went wrong');
    expect(response.code).toBe('INTERNAL_ERROR');
    expect(response.statusCode).toBe(500);
  });

  it('should handle unknown error types', () => {
    const response = buildErrorResponse('string error');
    
    expect(response.error).toBe('An unknown error occurred');
    expect(response.code).toBe('UNKNOWN_ERROR');
    expect(response.statusCode).toBe(500);
  });
});

describe('logError', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should log APOSError with context', () => {
    const error = new ValidationError('Test error');
    logError(error, 'TestContext');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[TestContext] ValidationError: Test error',
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      })
    );
  });

  it('should log standard Error', () => {
    const error = new Error('Test error');
    logError(error);
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      ' Error: Test error',
      expect.objectContaining({
        stack: expect.any(String),
      })
    );
  });

  it('should log unknown errors', () => {
    logError('string error', 'Context');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Context] Unknown error:',
      'string error'
    );
  });
});

describe('retryWithBackoff', () => {
  it('should succeed on first try', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { maxRetries: 3, initialDelay: 1 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, initialDelay: 1 })
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should respect shouldRetry function', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('do not retry'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, shouldRetry: () => false })
    ).rejects.toThrow('do not retry');

    expect(fn).toHaveBeenCalledTimes(1); // no retries
  });
});

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should pass when all variables exist', () => {
    process.env.TEST_VAR = 'value';
    
    expect(() => validateEnv(['TEST_VAR'])).not.toThrow();
  });

  it('should throw when variable is missing', () => {
    delete process.env.TEST_VAR;
    
    expect(() => validateEnv(['TEST_VAR'])).toThrow(ConfigurationError);
    expect(() => validateEnv(['TEST_VAR'])).toThrow('Missing required environment variables: TEST_VAR');
  });

  it('should list all missing variables', () => {
    delete process.env.VAR1;
    delete process.env.VAR2;
    
    expect(() => validateEnv(['VAR1', 'VAR2'])).toThrow('Missing required environment variables: VAR1, VAR2');
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"key":"value"}', {});
    expect(result).toEqual({ key: 'value' });
  });

  it('should return fallback on invalid JSON', () => {
    const fallback = { default: true };
    const result = safeJsonParse('invalid json', fallback);
    expect(result).toBe(fallback);
  });

  it('should return fallback on empty string', () => {
    const fallback = { default: true };
    const result = safeJsonParse('', fallback);
    expect(result).toBe(fallback);
  });
});

describe('validateJsonStructure', () => {
  it('should return true for valid structure', () => {
    const data = { name: 'test', age: 25 };
    const result = validateJsonStructure(data, ['name', 'age']);
    expect(result).toBe(true);
  });

  it('should return false for missing keys', () => {
    const data = { name: 'test' };
    const result = validateJsonStructure(data, ['name', 'age']);
    expect(result).toBe(false);
  });

  it('should return false for non-object', () => {
    const result = validateJsonStructure('string', ['key']);
    expect(result).toBe(false);
  });

  it('should return false for null', () => {
    const result = validateJsonStructure(null, ['key']);
    expect(result).toBe(false);
  });

  it('should return true for extra keys', () => {
    const data = { name: 'test', age: 25, extra: 'value' };
    const result = validateJsonStructure(data, ['name', 'age']);
    expect(result).toBe(true);
  });
});
