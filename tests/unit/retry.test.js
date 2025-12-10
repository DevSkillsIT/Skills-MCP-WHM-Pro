/**
 * Retry System - Tests
 * Testes unitários para BUG-CRIT-02
 */

const { withRetry, getRetryAfterMs, calculateBackoffDelay, sleep } = require('../../src/lib/retry');

describe('Retry System', () => {
  describe('Retry-After Header Handling', () => {
    it('deve respeitar Retry-After em segundos', async () => {
      jest.useFakeTimers();

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

      const promise = withRetry(mockFn, { maxRetries: 3 });

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      jest.useRealTimers();
    });

    it('deve respeitar Retry-After em formato HTTP-date', async () => {
      jest.useFakeTimers();

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

      const promise = withRetry(mockFn, { maxRetries: 3 });

      // Fast-forward 3 seconds
      jest.advanceTimersByTime(3000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      jest.useRealTimers();
    });

    it('deve usar backoff exponencial se Retry-After ausente', async () => {
      jest.useFakeTimers();

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

      const promise = withRetry(mockFn, { maxRetries: 3, baseDelay: 100, jitter: 0 });

      // Aguardar microtask queue antes de avançar timers
      await Promise.resolve();

      // Fast-forward through all retries (baseDelay: 100, backoff: 100, 200, 400 = 700ms)
      jest.advanceTimersByTime(1000);

      // Aguardar microtask queue novamente
      await Promise.resolve();

      // Rodar todos os timers remanescentes
      jest.runAllTimers();

      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);

      jest.useRealTimers();
    });

    it('deve priorizar Retry-After mesmo se menor que backoff', async () => {
      jest.useFakeTimers();

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

      const promise = withRetry(mockFn, { maxRetries: 3, baseDelay: 10000 }); // Base delay alto

      // Fast-forward 1 second
      jest.advanceTimersByTime(1000);

      const result = await promise;

      // Deve respeitar 1s do Retry-After, NÃO os 10s do backoff
      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      jest.useRealTimers();
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
      // Create a future date exactly 5 seconds from now
      const now = Date.now();
      const futureDate = new Date(now + 5000);
      const response = {
        headers: { 'retry-after': futureDate.toUTCString() }
      };

      // Mock Date.now() para evitar timing issues
      const originalNow = Date.now;
      Date.now = jest.fn(() => now);

      const result = getRetryAfterMs(response);

      // Restaurar Date.now
      Date.now = originalNow;

      // Permitir variação maior (até 1000ms) para timing jitter
      expect(result).toBeGreaterThanOrEqual(4000);
      expect(result).toBeLessThanOrEqual(6000);
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
      // Usar real timers para este teste pois é complexo
      let attempt = 0;

      const mockFn = jest.fn().mockImplementation(async () => {
        if (attempt < 2) {
          attempt++;
          const error = new Error('Temporary failure');
          error.response = { status: 500, headers: {} };
          throw error;
        }
        return { success: true };
      });

      const result = await withRetry(mockFn, {
        maxRetries: 5,
        baseDelay: 100,
        jitter: 0.1,
        maxDelay: 500
      });

      expect(result.success).toBe(true);
      expect(mockFn).toHaveBeenCalledTimes(3);
    }, 10000);

    it('deve parar após maxRetries', async () => {
      // Função que sempre falha
      const errorWithStatus = new Error('Always fails');
      errorWithStatus.response = { status: 500, headers: {} };

      const mockFn = jest.fn().mockRejectedValue(errorWithStatus);

      await expect(
        withRetry(mockFn, { maxRetries: 3, baseDelay: 50, maxDelay: 200 })
      ).rejects.toThrow('Always fails');

      // maxRetries=3 significa tentar 3 vezes (tentativa inicial + 2 retries)
      expect(mockFn).toHaveBeenCalledTimes(3);
    }, 10000);

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
      jest.useFakeTimers();

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

      const promise = withRetry(mockFn, { maxRetries: 3, baseDelay: 100 });

      jest.advanceTimersByTime(1000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      jest.useRealTimers();
    });

    it('deve fazer retry para erro 500', async () => {
      jest.useFakeTimers();

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

      const promise = withRetry(mockFn, { maxRetries: 3, baseDelay: 100 });

      jest.advanceTimersByTime(1000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      jest.useRealTimers();
    });

    it('deve fazer retry para erro de rede', async () => {
      jest.useFakeTimers();

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

      const promise = withRetry(mockFn, { maxRetries: 3, baseDelay: 100 });

      jest.advanceTimersByTime(1000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      jest.useRealTimers();
    });
  });
});
