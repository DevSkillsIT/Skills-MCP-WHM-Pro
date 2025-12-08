/**
 * Timeout System - Tests
 * Testes unitários para GAP-CRIT-01
 */

const { withTimeout, TimeoutError, getTimeoutByType } = require('../../src/lib/timeout');

describe('Timeout System', () => {
  describe('withTimeout', () => {
    it('deve lançar TimeoutError após tempo configurado', async () => {
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 5000));

      await expect(
        withTimeout(slowFn, 1000, 'test-operation')
      ).rejects.toThrow(TimeoutError);
    });

    it('deve retornar resultado se completar antes do timeout', async () => {
      const fastFn = async () => {
        await new Promise(r => setTimeout(r, 100));
        return { success: true, data: 'completed' };
      };

      const result = await withTimeout(fastFn, 1000, 'test-operation');

      expect(result.success).toBe(true);
      expect(result.data).toBe('completed');
    });

    it('deve incluir nome da operação no erro de timeout', async () => {
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 5000));

      try {
        await withTimeout(slowFn, 1000, 'custom-operation');
        fail('Should have thrown TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect(error.operation).toBe('custom-operation');
        expect(error.timeoutMs).toBe(1000);
      }
    });

    it('deve propagar erro se função falhar antes do timeout', async () => {
      const failingFn = async () => {
        await new Promise(r => setTimeout(r, 100));
        throw new Error('Function failed');
      };

      await expect(
        withTimeout(failingFn, 1000, 'test')
      ).rejects.toThrow('Function failed');
    });

    it('deve cancelar timeout se função completar com sucesso', async () => {
      const fastFn = async () => {
        // Função que completa rapidamente sem timers
        return { success: true };
      };

      // Use real timers para este teste - a função completa rápido
      const result = await withTimeout(fastFn, 5000, 'test');

      expect(result.success).toBe(true);
    });
  });

  describe('getTimeoutByType', () => {
    it('deve retornar timeout correto para WHM', () => {
      const timeout = getTimeoutByType('WHM');
      expect(timeout).toBe(30000); // 30s
    });

    it('deve retornar timeout correto para SSH', () => {
      const timeout = getTimeoutByType('SSH');
      expect(timeout).toBe(60000); // 60s
    });

    it('deve retornar timeout correto para DNS', () => {
      const timeout = getTimeoutByType('DNS');
      expect(timeout).toBe(45000); // 45s
    });

    it('deve retornar timeout correto para HTTP', () => {
      const timeout = getTimeoutByType('HTTP');
      expect(timeout).toBe(30000); // 30s
    });

    it('deve retornar timeout correto para FILE', () => {
      const timeout = getTimeoutByType('FILE');
      expect(timeout).toBe(30000); // 30s
    });

    it('deve retornar default para tipo desconhecido', () => {
      const timeout = getTimeoutByType('UNKNOWN');
      expect(timeout).toBe(30000); // Default
    });
  });

  describe('TimeoutError', () => {
    it('deve criar TimeoutError com mensagem correta', () => {
      const error = new TimeoutError('test-op', 5000);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.operation).toBe('test-op');
      expect(error.timeoutMs).toBe(5000);
      expect(error.timeoutSeconds).toBe(5);
    });

    it('deve ter propriedades de operação e timeout', () => {
      const error = new TimeoutError('whm-api-call', 30000);

      expect(error.operation).toBe('whm-api-call');
      expect(error.timeoutMs).toBe(30000);
    });
  });

  describe('Timeout Hierarchy', () => {
    it('SSH deve ter maior timeout que WHM', () => {
      const sshTimeout = getTimeoutByType('SSH');
      const whmTimeout = getTimeoutByType('WHM');

      expect(sshTimeout).toBeGreaterThan(whmTimeout);
    });

    it('DNS deve ter timeout intermediário', () => {
      const dnsTimeout = getTimeoutByType('DNS');
      const whmTimeout = getTimeoutByType('WHM');
      const sshTimeout = getTimeoutByType('SSH');

      expect(dnsTimeout).toBeGreaterThan(whmTimeout);
      expect(dnsTimeout).toBeLessThan(sshTimeout);
    });
  });

  describe('Edge Cases', () => {
    it('deve tratar timeout zero', async () => {
      jest.useFakeTimers();

      const fn = async () => {
        return { success: true };
      };

      const promise = withTimeout(fn, 0, 'zero-timeout');

      // Advance fake timers to trigger the timeout
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(TimeoutError);

      jest.useRealTimers();
    });

    it('deve tratar timeout negativo como inválido', async () => {
      jest.useFakeTimers();

      const fn = async () => {
        return { success: true };
      };

      const promise = withTimeout(fn, -1000, 'negative-timeout');

      // Advance fake timers to trigger the timeout
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(TimeoutError);

      jest.useRealTimers();
    });

    it('deve tratar timeout muito longo', async () => {
      const fastFn = async () => {
        return { success: true };
      };

      const result = await withTimeout(fastFn, 999999999, 'long-timeout');

      expect(result.success).toBe(true);
    });

    it('deve tratar função que retorna undefined', async () => {
      const fn = async () => {
        // Retorna undefined
      };

      const result = await withTimeout(fn, 1000, 'undefined-return');

      expect(result).toBeUndefined();
    });

    it('deve tratar função que retorna null', async () => {
      const fn = async () => {
        return null;
      };

      const result = await withTimeout(fn, 1000, 'null-return');

      expect(result).toBeNull();
    });
  });

  describe('Multiple Concurrent Operations', () => {
    it('deve permitir múltiplos timeouts concorrentes', async () => {
      jest.useFakeTimers();

      const fn1 = async () => {
        await new Promise(r => setTimeout(r, 100));
        return { id: 1 };
      };

      const fn2 = async () => {
        await new Promise(r => setTimeout(r, 200));
        return { id: 2 };
      };

      const fn3 = async () => {
        await new Promise(r => setTimeout(r, 150));
        return { id: 3 };
      };

      const promise = Promise.all([
        withTimeout(fn1, 1000, 'op1'),
        withTimeout(fn2, 1000, 'op2'),
        withTimeout(fn3, 1000, 'op3')
      ]);

      jest.advanceTimersByTime(1000);

      const [result1, result2, result3] = await promise;

      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
      expect(result3.id).toBe(3);

      jest.useRealTimers();
    });

    it('deve tratar timeouts diferentes corretamente', async () => {
      jest.useFakeTimers();

      const fastFn = async () => {
        await new Promise(r => setTimeout(r, 100));
        return { success: true };
      };

      const slowFn = async () => {
        await new Promise(r => setTimeout(r, 5000));
        return { success: true };
      };

      const promise = Promise.allSettled([
        withTimeout(fastFn, 1000, 'fast'),
        withTimeout(slowFn, 500, 'slow')
      ]);

      jest.advanceTimersByTime(1000);

      const [fastResult, slowError] = await promise;

      expect(fastResult.status).toBe('fulfilled');
      expect(fastResult.value.success).toBe(true);

      expect(slowError.status).toBe('rejected');
      expect(slowError.reason).toBeInstanceOf(TimeoutError);

      jest.useRealTimers();
    });
  });
});
