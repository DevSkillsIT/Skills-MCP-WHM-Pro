/**
 * Retry System - Tests
 * Testes unitários para BUG-CRIT-02
 */

const { withRetry, getRetryAfterMs, calculateBackoffDelay, sleep } = require('../../src/lib/retry');

describe('Retry System', () => {
  describe('Retry-After Header Handling', () => {
    it('deve respeitar Retry-After em segundos', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Rate limited');
          error.response = {
            status: 429,
            headers: { 'retry-after': '5' } // 5 segundos
          };
          throw error;
        }
        return { success: true };
      });

      const startTime = Date.now();
      const result = await withRetry(mockFn, { maxRetries: 3 });
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
      // Deve aguardar ~5 segundos (não 1s do backoff)
      expect(elapsed).toBeGreaterThanOrEqual(5000);
      expect(elapsed).toBeLessThan(6000);
    });

    it('deve respeitar Retry-After em formato HTTP-date', async () => {
      let callCount = 0;
      const futureDate = new Date(Date.now() + 3000).toUTCString();

      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Rate limited');
          error.response = {
            status: 429,
            headers: { 'retry-after': futureDate }
          };
          throw error;
        }
        return { success: true };
      });

      const startTime = Date.now();
      await withRetry(mockFn, { maxRetries: 3 });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(3000);
      expect(elapsed).toBeLessThan(4000);
    });

    it('deve usar backoff exponencial se Retry-After ausente', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          const error = new Error('Temporary failure');
          error.response = { status: 500, headers: {} };
          throw error;
        }
        return { success: true };
      });

      const startTime = Date.now();
      await withRetry(mockFn, { maxRetries: 3, baseDelay: 100 });
      const elapsed = Date.now() - startTime;

      // Backoff: ~100ms + ~200ms = ~300ms total
      expect(elapsed).toBeGreaterThanOrEqual(300);
      expect(elapsed).toBeLessThan(500);
    });

    it('deve priorizar Retry-After mesmo se menor que backoff', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Rate limited');
          error.response = {
            status: 429,
            headers: { 'retry-after': '1' } // 1 segundo (menor que backoff de 10s)
          };
          throw error;
        }
        return { success: true };
      });

      const startTime = Date.now();
      await withRetry(mockFn, { maxRetries: 3, baseDelay: 10000 }); // Base delay alto
      const elapsed = Date.now() - startTime;

      // Deve respeitar 1s do Retry-After, NÃO os 10s do backoff
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(2000);
    });

    it('deve lançar erro após max retries com Retry-After', async () => {
      const mockFn = jest.fn().mockImplementation(() => {
        const error = new Error('Always rate limited');
        error.response = {
          status: 429,
          headers: { 'retry-after': '1' }
        };
        throw error;
      });

      await expect(
        withRetry(mockFn, { maxRetries: 3 })
      ).rejects.toThrow('Always rate limited');

      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('getRetryAfterMs', () => {
    it('deve parsear Retry-After em segundos', () => {
      const response = { headers: { 'retry-after': '10' } };
      expect(getRetryAfterMs(response)).toBe(10000);
    });

    it('deve parsear Retry-After em HTTP-date', () => {
      const futureDate = new Date(Date.now() + 5000);
      const response = {
        headers: { 'retry-after': futureDate.toUTCString() }
      };
      const result = getRetryAfterMs(response);
      expect(result).toBeGreaterThanOrEqual(4900);
      expect(result).toBeLessThanOrEqual(5100);
    });

    it('deve retornar null se header ausente', () => {
      const response = { headers: {} };
      expect(getRetryAfterMs(response)).toBeNull();
    });

    it('deve retornar null se response não tem headers', () => {
      const response = {};
      expect(getRetryAfterMs(response)).toBeNull();
    });

    it('deve retornar null para data no passado', () => {
      const pastDate = new Date(Date.now() - 5000);
      const response = {
        headers: { 'retry-after': pastDate.toUTCString() }
      };
      expect(getRetryAfterMs(response)).toBeNull();
    });
  });

  describe('Exponential Backoff', () => {
    it('deve aplicar backoff exponencial com jitter', async () => {
      const delays = [];
      let attempt = 0;

      const mockFn = jest.fn().mockImplementation(async () => {
        if (attempt < 4) {
          attempt++;
          throw new Error('Temporary failure');
        }
        return { success: true };
      });

      // Espionar setTimeout para capturar delays
      const originalSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((cb, delay) => {
        if (delay > 0) delays.push(delay);
        return originalSetTimeout(cb, 0); // Executar imediatamente para teste rápido
      });

      await withRetry(mockFn, { maxRetries: 5, jitter: 0 });

      // Verificar delays: ~1s, ~2s, ~4s, ~8s
      expect(delays[0]).toBeCloseTo(1000, -2);
      expect(delays[1]).toBeCloseTo(2000, -2);
      expect(delays[2]).toBeCloseTo(4000, -2);
      expect(delays[3]).toBeCloseTo(8000, -2);

      jest.restoreAllMocks();
    });

    it('deve parar após maxRetries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(
        withRetry(mockFn, { maxRetries: 5 })
      ).rejects.toThrow('Always fails');

      expect(mockFn).toHaveBeenCalledTimes(5);
    });

    it('deve aplicar jitter corretamente', () => {
      const delay1 = calculateBackoffDelay(0, 1000, 32000, 0.2);
      const delay2 = calculateBackoffDelay(0, 1000, 32000, 0.2);

      // Com jitter de 20%, delays devem variar entre 800ms e 1200ms
      expect(delay1).toBeGreaterThanOrEqual(800);
      expect(delay1).toBeLessThanOrEqual(1200);
      expect(delay2).toBeGreaterThanOrEqual(800);
      expect(delay2).toBeLessThanOrEqual(1200);

      // Delays devem ser diferentes (probabilidade muito alta)
      expect(delay1).not.toBe(delay2);
    });
  });

  describe('Error Handling', () => {
    it('deve lançar erro imediatamente para erros não retriáveis', async () => {
      const mockFn = jest.fn().mockImplementation(() => {
        const error = new Error('Bad request');
        error.response = { status: 400 }; // 400 não é retriável
        throw error;
      });

      await expect(
        withRetry(mockFn, { maxRetries: 5 })
      ).rejects.toThrow('Bad request');

      expect(mockFn).toHaveBeenCalledTimes(1); // Apenas 1 tentativa
    });

    it('deve fazer retry para erro 429', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Too many requests');
          error.response = { status: 429, headers: {} };
          throw error;
        }
        return { success: true };
      });

      const result = await withRetry(mockFn, { maxRetries: 3, baseDelay: 100 });

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    it('deve fazer retry para erro 500', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Internal server error');
          error.response = { status: 500, headers: {} };
          throw error;
        }
        return { success: true };
      });

      const result = await withRetry(mockFn, { maxRetries: 3, baseDelay: 100 });

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    it('deve fazer retry para erro de rede', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Network error');
          // Sem error.response = erro de rede
          throw error;
        }
        return { success: true };
      });

      const result = await withRetry(mockFn, { maxRetries: 3, baseDelay: 100 });

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });
  });
});
