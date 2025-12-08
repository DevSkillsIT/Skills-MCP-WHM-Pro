/**
 * Error Mapper - Tests (RED PHASE)
 * Testes para mapeamento de erros e configuração de retry automático
 */

const {
  mapWhmError,
  createMappedError,
  isRecoverable,
  getRetryBackoff,
  calculateSeverity,
  getErrorTypes,
  getRetryConfig,
  ERROR_TYPES,
  RETRY_CONFIG
} = require('../../src/lib/error-mapper');

describe('Error Mapper', () => {
  describe('mapWhmError() - String Errors', () => {
    it('deve mapear erro "file exists"', () => {
      const result = mapWhmError('file exists');
      expect(result.type).toBe(ERROR_TYPES.EEXIST);
      expect(result.severity).toBe('medium');
    });

    it('deve mapear erro "no such file"', () => {
      const result = mapWhmError('no such file');
      expect(result.type).toBe(ERROR_TYPES.ENOENT);
      expect(result.severity).toBe('low');
    });

    it('deve mapear erro "not found"', () => {
      const result = mapWhmError('not found');
      expect(result.type).toBe(ERROR_TYPES.ENOENT);
    });

    it('deve mapear erro "permission denied"', () => {
      const result = mapWhmError('permission denied');
      expect(result.type).toBe(ERROR_TYPES.EPERM);
      expect(result.severity).toBe('high');
    });

    it('deve mapear erro "resource busy"', () => {
      const result = mapWhmError('resource busy');
      expect(result.type).toBe(ERROR_TYPES.EBUSY);
    });

    it('deve mapear erro "timeout"', () => {
      const result = mapWhmError('timeout');
      expect(result.type).toBe(ERROR_TYPES.ETIMEDOUT);
    });

    it('deve mapear erro "timed out"', () => {
      const result = mapWhmError('timed out');
      expect(result.type).toBe(ERROR_TYPES.ETIMEDOUT);
    });

    it('deve mapear erro "connection refused"', () => {
      const result = mapWhmError('connection refused');
      expect(result.type).toBe(ERROR_TYPES.ECONNREFUSED);
    });

    it('deve mapear erro "rate limit"', () => {
      const result = mapWhmError('rate limit exceeded');
      expect(result.type).toBe(ERROR_TYPES.RATE_LIMITED);
    });

    it('deve mapear erro "too many requests"', () => {
      const result = mapWhmError('too many requests');
      expect(result.type).toBe(ERROR_TYPES.RATE_LIMITED);
    });

    it('deve mapear erro "quota"', () => {
      const result = mapWhmError('quota exceeded');
      expect(result.type).toBe(ERROR_TYPES.QUOTA_EXCEEDED);
    });

    it('deve mapear erro "invalid"', () => {
      const result = mapWhmError('invalid parameter');
      expect(result.type).toBe(ERROR_TYPES.INVALID_INPUT);
    });

    it('deve mapear erro "unauthorized"', () => {
      const result = mapWhmError('unauthorized');
      expect(result.type).toBe(ERROR_TYPES.UNAUTHORIZED);
      expect(result.severity).toBe('high');
    });

    it('deve mapear erro "forbidden"', () => {
      const result = mapWhmError('forbidden');
      expect(result.type).toBe(ERROR_TYPES.FORBIDDEN);
      expect(result.severity).toBe('high');
    });

    it('deve mapear erro "internal server error"', () => {
      const result = mapWhmError('internal server error');
      expect(result.type).toBe(ERROR_TYPES.INTERNAL_ERROR);
      expect(result.severity).toBe('high');
    });

    it('deve mapear erro "service unavailable"', () => {
      const result = mapWhmError('service unavailable');
      expect(result.type).toBe(ERROR_TYPES.SERVICE_UNAVAILABLE);
      expect(result.severity).toBe('high');
    });

    it('deve mapear erro "bad request"', () => {
      const result = mapWhmError('bad request');
      expect(result.type).toBe(ERROR_TYPES.INVALID_INPUT);
    });

    it('deve ser case-insensitive', () => {
      const result1 = mapWhmError('TIMEOUT');
      const result2 = mapWhmError('Timeout');
      const result3 = mapWhmError('timeout');

      expect(result1.type).toBe(ERROR_TYPES.ETIMEDOUT);
      expect(result2.type).toBe(ERROR_TYPES.ETIMEDOUT);
      expect(result3.type).toBe(ERROR_TYPES.ETIMEDOUT);
    });

    it('deve retornar UNKNOWN para padrão desconhecido', () => {
      const result = mapWhmError('completely unknown error');
      expect(result.type).toBe(ERROR_TYPES.UNKNOWN);
    });
  });

  describe('mapWhmError() - Error Objects', () => {
    it('deve mapear Error com propriedade code', () => {
      const error = new Error('test');
      error.code = 'EEXIST';

      const result = mapWhmError(error);
      expect(result.type).toBe(ERROR_TYPES.EEXIST);
    });

    it('deve mapear Error com propriedade message', () => {
      const error = new Error('permission denied');
      const result = mapWhmError(error);
      expect(result.type).toBe(ERROR_TYPES.EPERM);
    });

    it('deve mapear objeto com propriedade code', () => {
      const error = { code: 'ENOENT', message: 'not found' };
      const result = mapWhmError(error);
      expect(result.type).toBe(ERROR_TYPES.ENOENT);
    });

    it('deve mapear objeto com propriedade errno', () => {
      const error = { errno: 'EBUSY', message: 'busy' };
      const result = mapWhmError(error);
      expect(result.type).toBe(ERROR_TYPES.EBUSY);
    });

    it('deve mapear objeto com propriedade msg', () => {
      const error = { msg: 'timeout occurred' };
      const result = mapWhmError(error);
      expect(result.type).toBe(ERROR_TYPES.ETIMEDOUT);
    });

    it('deve serializar objeto desconhecido com JSON.stringify', () => {
      const error = { custom: 'error', code: 999 };
      const result = mapWhmError(error);

      expect(result.originalMessage).toContain('custom');
    });
  });

  describe('mapWhmError() - Edge Cases', () => {
    it('deve lidar com erro nulo', () => {
      const result = mapWhmError(null);
      expect(result.type).toBe(ERROR_TYPES.UNKNOWN);
      expect(result.originalMessage).toContain('nulo'); // Mensagem descritiva
    });

    it('deve lidar com undefined', () => {
      const result = mapWhmError(undefined);
      expect(result.type).toBe(ERROR_TYPES.UNKNOWN);
    });

    it('deve lidar com string vazia', () => {
      const result = mapWhmError('');
      expect(result.type).toBe(ERROR_TYPES.UNKNOWN);
    });

    it('deve lidar com mensagem muito longa', () => {
      const longMessage = 'timeout'.repeat(1000);
      const result = mapWhmError(longMessage);
      expect(result.type).toBe(ERROR_TYPES.ETIMEDOUT);
    });

    it('deve lidar com múltiplas palavras-chave', () => {
      const result = mapWhmError('permission denied: timeout');
      // Pega primeira correspondência
      expect(result.type).toBe(ERROR_TYPES.EPERM);
    });
  });

  describe('createMappedError()', () => {
    it('deve criar erro mapeado com tipo válido', () => {
      const result = createMappedError(ERROR_TYPES.ETIMEDOUT, 'Operation timed out');

      expect(result.type).toBe(ERROR_TYPES.ETIMEDOUT);
      expect(result.message).toBeDefined();
      expect(result.originalMessage).toBe('Operation timed out');
      expect(result.retry).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('deve retornar messageDescription correta', () => {
      const result = createMappedError(ERROR_TYPES.EBUSY, '');
      expect(result.message).toContain('Recurso ocupado');
    });

    it('deve fornecer config de retry correta', () => {
      const result = createMappedError(ERROR_TYPES.RATE_LIMITED, '');

      expect(result.retry.shouldRetry).toBe(true);
      expect(result.retry.maxRetries).toBe(5);
      expect(result.retry.backoffMs).toBe(5000);
    });

    it('deve marcar severidade correta', () => {
      const criticalError = createMappedError(ERROR_TYPES.UNAUTHORIZED, '');
      const minorError = createMappedError(ERROR_TYPES.ENOENT, '');

      expect(criticalError.severity).toBe('high');
      expect(minorError.severity).toBe('low');
    });

    it('deve usar tipo UNKNOWN para tipo inválido', () => {
      const result = createMappedError('INVALID_TYPE', 'test');

      expect(result.type).toBe(ERROR_TYPES.UNKNOWN);
    });

    it('deve incluir timestamp', () => {
      const beforeCreate = Date.now();
      const result = createMappedError(ERROR_TYPES.EEXIST, '');
      const afterCreate = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.timestamp).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe('calculateSeverity()', () => {
    it('deve retornar "low" para ENOENT', () => {
      expect(calculateSeverity(ERROR_TYPES.ENOENT)).toBe('low');
    });

    it('deve retornar "low" para INVALID_INPUT', () => {
      expect(calculateSeverity(ERROR_TYPES.INVALID_INPUT)).toBe('low');
    });

    it('deve retornar "medium" para EEXIST', () => {
      expect(calculateSeverity(ERROR_TYPES.EEXIST)).toBe('medium');
    });

    it('deve retornar "medium" para EBUSY', () => {
      expect(calculateSeverity(ERROR_TYPES.EBUSY)).toBe('medium');
    });

    it('deve retornar "medium" para RATE_LIMITED', () => {
      expect(calculateSeverity(ERROR_TYPES.RATE_LIMITED)).toBe('medium');
    });

    it('deve retornar "high" para EPERM', () => {
      expect(calculateSeverity(ERROR_TYPES.EPERM)).toBe('high');
    });

    it('deve retornar "high" para UNAUTHORIZED', () => {
      expect(calculateSeverity(ERROR_TYPES.UNAUTHORIZED)).toBe('high');
    });

    it('deve retornar "high" para INTERNAL_ERROR', () => {
      expect(calculateSeverity(ERROR_TYPES.INTERNAL_ERROR)).toBe('high');
    });

    it('deve retornar "high" para SERVICE_UNAVAILABLE', () => {
      expect(calculateSeverity(ERROR_TYPES.SERVICE_UNAVAILABLE)).toBe('high');
    });

    it('deve retornar "medium" para UNKNOWN', () => {
      expect(calculateSeverity(ERROR_TYPES.UNKNOWN)).toBe('medium');
    });
  });

  describe('isRecoverable()', () => {
    it('deve indicar erro recuperável se shouldRetry=true', () => {
      const error = createMappedError(ERROR_TYPES.EBUSY, 'busy');
      expect(isRecoverable(error)).toBe(true);
    });

    it('deve indicar erro não-recuperável se shouldRetry=false', () => {
      const error = createMappedError(ERROR_TYPES.ENOENT, 'not found');
      expect(isRecoverable(error)).toBe(false);
    });

    it('deve indicar erro não-recuperável se maxRetries=0', () => {
      const error = createMappedError(ERROR_TYPES.EPERM, 'permission denied');
      expect(isRecoverable(error)).toBe(false);
    });

    it('deve retornar false para erro nulo', () => {
      expect(isRecoverable(null)).toBe(false);
    });

    it('deve retornar false para erro sem retry', () => {
      const error = { type: 'unknown' }; // Sem retry
      expect(isRecoverable(error)).toBe(false);
    });

    it('deve considerar múltiplos erros recuperáveis', () => {
      const errors = [
        ERROR_TYPES.EBUSY,
        ERROR_TYPES.ETIMEDOUT,
        ERROR_TYPES.ECONNREFUSED,
        ERROR_TYPES.RATE_LIMITED
      ];

      errors.forEach(errorType => {
        const error = createMappedError(errorType, '');
        expect(isRecoverable(error)).toBe(true);
      });
    });

    it('deve considerar múltiplos erros não-recuperáveis', () => {
      const errors = [
        ERROR_TYPES.ENOENT,
        ERROR_TYPES.EPERM,
        ERROR_TYPES.UNAUTHORIZED,
        ERROR_TYPES.FORBIDDEN
      ];

      errors.forEach(errorType => {
        const error = createMappedError(errorType, '');
        expect(isRecoverable(error)).toBe(false);
      });
    });
  });

  describe('getRetryBackoff()', () => {
    it('deve retornar 0 para erro nulo', () => {
      expect(getRetryBackoff(null)).toBe(0);
    });

    it('deve retornar backoff base para tentativa 0', () => {
      const error = createMappedError(ERROR_TYPES.EBUSY, '');
      const backoff = getRetryBackoff(error, 0);

      expect(backoff).toBe(1000); // BASE: 1000ms
    });

    it('deve retornar exponential backoff para tentativa 1', () => {
      const error = createMappedError(ERROR_TYPES.EBUSY, '');
      const backoff = getRetryBackoff(error, 1);

      expect(backoff).toBe(2000); // 1000 * 2^1
    });

    it('deve retornar exponential backoff para tentativa 2', () => {
      const error = createMappedError(ERROR_TYPES.EBUSY, '');
      const backoff = getRetryBackoff(error, 2);

      expect(backoff).toBe(4000); // 1000 * 2^2
    });

    it('deve retornar exponential backoff para tentativa 3', () => {
      const error = createMappedError(ERROR_TYPES.EBUSY, '');
      const backoff = getRetryBackoff(error, 3);

      expect(backoff).toBe(8000); // 1000 * 2^3
    });

    it('deve limitar backoff máximo', () => {
      const error = createMappedError(ERROR_TYPES.EBUSY, '');
      const backoff = getRetryBackoff(error, 10); // Muito alta, deve limitar

      // Limita a 2^3 = 8, então 1000 * 8 = 8000
      expect(backoff).toBeLessThanOrEqual(8000);
    });

    it('deve usar backoff customizado por tipo de erro', () => {
      const error = createMappedError(ERROR_TYPES.RATE_LIMITED, '');
      const backoff = getRetryBackoff(error, 0);

      // RATE_LIMITED tem backoffMs = 5000
      expect(backoff).toBe(5000);
    });

    it('deve calcular exponential backoff para RATE_LIMITED', () => {
      const error = createMappedError(ERROR_TYPES.RATE_LIMITED, '');
      const backoff = getRetryBackoff(error, 2);

      // 5000 * 2^2 = 20000
      expect(backoff).toBe(20000);
    });
  });

  describe('getErrorTypes()', () => {
    it('deve retornar array de tipos de erro', () => {
      const types = getErrorTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });

    it('deve incluir todos os tipos conhecidos', () => {
      const types = getErrorTypes();

      expect(types).toContain('EEXIST');
      expect(types).toContain('ENOENT');
      expect(types).toContain('EPERM');
      expect(types).toContain('EBUSY');
      expect(types).toContain('ETIMEDOUT');
      expect(types).toContain('ECONNREFUSED');
      expect(types).toContain('RATE_LIMITED');
      expect(types).toContain('QUOTA_EXCEEDED');
      expect(types).toContain('UNAUTHORIZED');
      expect(types).toContain('FORBIDDEN');
      expect(types).toContain('UNKNOWN');
    });

    it('deve conter pelo menos 12 tipos de erro', () => {
      const types = getErrorTypes();
      expect(types.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe('getRetryConfig()', () => {
    it('deve retornar config para tipo válido', () => {
      const config = getRetryConfig(ERROR_TYPES.EBUSY);

      expect(config).toBeDefined();
      expect(config.shouldRetry).toBe(true);
      expect(config.maxRetries).toBeGreaterThan(0);
      expect(config.description).toBeDefined();
    });

    it('deve retornar null para tipo inválido', () => {
      const config = getRetryConfig('INVALID_TYPE');
      expect(config).toBeNull();
    });

    it('deve indicar que EBUSY é recuperável', () => {
      const config = getRetryConfig(ERROR_TYPES.EBUSY);
      expect(config.shouldRetry).toBe(true);
      expect(config.maxRetries).toBe(3);
    });

    it('deve indicar que EPERM não é recuperável', () => {
      const config = getRetryConfig(ERROR_TYPES.EPERM);
      expect(config.shouldRetry).toBe(false);
      expect(config.maxRetries).toBe(0);
    });

    it('deve retornar config para cada tipo documentado', () => {
      const types = getErrorTypes();

      types.forEach(type => {
        const config = getRetryConfig(type);
        expect(config).toBeDefined();
        expect(config).toHaveProperty('shouldRetry');
        expect(config).toHaveProperty('maxRetries');
        expect(config).toHaveProperty('description');
      });
    });
  });

  describe('Error Mapper - Integration Tests', () => {
    it('deve mapear, validar e processar erro completo', () => {
      // Mapear erro
      const mapped = mapWhmError('timeout occurred');
      expect(mapped.type).toBe(ERROR_TYPES.ETIMEDOUT);

      // Verificar recuperabilidade
      expect(isRecoverable(mapped)).toBe(true);

      // Obter config de retry
      const config = getRetryConfig(mapped.type);
      expect(config.maxRetries).toBe(2);

      // Calcular backoff para próxima tentativa
      const backoff = getRetryBackoff(mapped, 0);
      expect(backoff).toBe(2000);
    });

    it('deve processar múltiplos erros em sequência', () => {
      const errors = [
        'timeout',
        'permission denied',
        'not found',
        'rate limit'
      ];

      const results = errors.map(err => {
        const mapped = mapWhmError(err);
        return {
          type: mapped.type,
          recoverable: isRecoverable(mapped),
          severity: mapped.severity
        };
      });

      expect(results[0].recoverable).toBe(true); // timeout
      expect(results[1].recoverable).toBe(false); // permission denied
      expect(results[2].recoverable).toBe(false); // not found
      expect(results[3].recoverable).toBe(true); // rate limit
    });

    it('deve implementar retry logic corretamente', () => {
      const mapped = mapWhmError('connection refused');

      expect(isRecoverable(mapped)).toBe(true);

      const backoffs = [];
      for (let i = 0; i < 3; i++) {
        backoffs.push(getRetryBackoff(mapped, i));
      }

      // Verificar exponential backoff
      expect(backoffs[0]).toBeLessThan(backoffs[1]);
      expect(backoffs[1]).toBeLessThan(backoffs[2]);
    });

    it('deve validar todas as constantes exportadas', () => {
      expect(ERROR_TYPES).toBeDefined();
      expect(RETRY_CONFIG).toBeDefined();

      // Verificar que RETRY_CONFIG tem entrada para cada tipo
      Object.values(ERROR_TYPES).forEach(type => {
        expect(RETRY_CONFIG[type]).toBeDefined();
      });
    });
  });
});
