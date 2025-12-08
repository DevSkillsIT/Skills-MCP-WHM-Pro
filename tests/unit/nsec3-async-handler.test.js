/**
 * NSEC3 Async Handler - Tests (RED PHASE)
 * Testes para gerenciamento de operações assíncronas NSEC3
 */

const {
  calculateNsec3Timeout,
  generateOperationId,
  startAsyncOperation,
  getOperationStatus,
  updateOperationProgress,
  failOperation,
  onOperationProgress,
  getOperationStats,
  cleanupOldOperations,
  clearAllOperations,
  OPERATION_STATES,
  BASE_TIMEOUT_MS,
  DOMAIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS
} = require('../../src/lib/nsec3-async-handler');

describe('NSEC3 Async Handler', () => {
  // Limpar operações antes de cada teste
  beforeEach(() => {
    clearAllOperations();
  });

  afterEach(() => {
    clearAllOperations();
  });

  describe('calculateNsec3Timeout()', () => {
    it('deve usar BASE_TIMEOUT para array vazio', () => {
      const timeout = calculateNsec3Timeout([]);
      expect(timeout).toBe(BASE_TIMEOUT_MS);
    });

    it('deve usar BASE_TIMEOUT para array com domain inválido', () => {
      const timeout = calculateNsec3Timeout([null, '', undefined]);
      expect(timeout).toBe(BASE_TIMEOUT_MS);
    });

    it('deve adicionar DOMAIN_TIMEOUT por domínio válido', () => {
      const domains = ['example.com'];
      const timeout = calculateNsec3Timeout(domains);

      expect(timeout).toBe(BASE_TIMEOUT_MS + DOMAIN_TIMEOUT_MS);
    });

    it('deve suportar múltiplos domínios', () => {
      const domains = ['example.com', 'test.com', 'sample.org'];
      const timeout = calculateNsec3Timeout(domains);

      expect(timeout).toBe(BASE_TIMEOUT_MS + (DOMAIN_TIMEOUT_MS * 3));
    });

    it('deve limitar ao máximo MAX_TIMEOUT_MS', () => {
      // 100 domínios = 60000 + (30000 * 100) = 3060000ms, mas limita a 600000
      const domains = Array(100).fill('domain.com');
      const timeout = calculateNsec3Timeout(domains);

      expect(timeout).toBe(MAX_TIMEOUT_MS);
    });

    it('deve retornar BASE_TIMEOUT para parâmetro não-array', () => {
      expect(calculateNsec3Timeout('string')).toBe(BASE_TIMEOUT_MS);
      expect(calculateNsec3Timeout(123)).toBe(BASE_TIMEOUT_MS);
      expect(calculateNsec3Timeout(null)).toBe(BASE_TIMEOUT_MS);
    });

    it('deve ignorar domínios inválidos na contagem', () => {
      const domains = ['valid.com', null, '', 'another.com', undefined, 'third.org'];
      const timeout = calculateNsec3Timeout(domains);

      // Apenas 3 válidos: 60000 + (30000 * 3) = 150000
      expect(timeout).toBe(BASE_TIMEOUT_MS + (DOMAIN_TIMEOUT_MS * 3));
    });

    it('deve calcular corretamente para limites', () => {
      // Máximos domínios antes de atingir MAX_TIMEOUT
      // MAX = 600000, BASE = 60000, por domínio = 30000
      // (600000 - 60000) / 30000 = 18 domínios
      const domains = Array(18).fill('domain.com');
      const timeout = calculateNsec3Timeout(domains);

      expect(timeout).toBeLessThanOrEqual(MAX_TIMEOUT_MS);
    });

    it('deve validar com 19 domínios (deve atingir limite)', () => {
      const domains = Array(19).fill('domain.com');
      const timeout = calculateNsec3Timeout(domains);

      expect(timeout).toBe(MAX_TIMEOUT_MS);
    });
  });

  describe('generateOperationId()', () => {
    it('deve gerar ID com prefixo nsec3_', () => {
      const id = generateOperationId();
      expect(id).toMatch(/^nsec3_[0-9a-f]+$/);
    });

    it('deve gerar IDs únicos', () => {
      const id1 = generateOperationId();
      const id2 = generateOperationId();
      const id3 = generateOperationId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('deve ter comprimento consistente', () => {
      const id1 = generateOperationId();
      const id2 = generateOperationId();

      expect(id1.length).toBe(id2.length);
    });
  });

  describe('startAsyncOperation() - Happy Path', () => {
    it('deve iniciar operação com sucesso', () => {
      const result = startAsyncOperation(null, 'create', ['example.com']);

      expect(result.operationId).toBeTruthy();
      expect(result.operationId).toMatch(/^nsec3_/);
      expect(result.status).toBe(OPERATION_STATES.QUEUED);
      expect(result.timeout).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    it('deve usar operationId fornecido', () => {
      const customId = 'nsec3_custom123';
      const result = startAsyncOperation(customId, 'update', ['example.com']);

      expect(result.operationId).toBe(customId);
      expect(result.status).toBe(OPERATION_STATES.QUEUED);
    });

    it('deve gerar novo ID se não fornecido', () => {
      const result1 = startAsyncOperation(null, 'create', ['example.com']);
      clearAllOperations();
      const result2 = startAsyncOperation(null, 'create', ['example.com']);

      expect(result1.operationId).not.toBe(result2.operationId);
    });

    it('deve suportar diferentes tipos de operação', () => {
      const types = ['create', 'update', 'delete', 'recalc', 'verify'];

      types.forEach(type => {
        const result = startAsyncOperation(null, type, ['domain.com']);
        expect(result.status).toBe(OPERATION_STATES.QUEUED);
      });
    });

    it('deve ser case-insensitive para tipo', () => {
      clearAllOperations();
      const result1 = startAsyncOperation(null, 'CREATE', ['domain.com']);
      clearAllOperations();
      const result2 = startAsyncOperation(null, 'create', ['domain.com']);

      expect(result1.status).toBe(result2.status);
    });

    it('deve suportar múltiplos domínios', () => {
      const domains = [
        'example.com',
        'test.org',
        'sample.net',
        'another.io'
      ];

      const result = startAsyncOperation(null, 'create', domains);

      expect(result.operationId).toBeTruthy();
      expect(result.status).toBe(OPERATION_STATES.QUEUED);
      expect(result.timeout).toBeGreaterThan(BASE_TIMEOUT_MS);
    });

    it('deve calcular timeout dinamicamente', () => {
      const small = startAsyncOperation(null, 'create', ['domain.com']);
      clearAllOperations();
      const large = startAsyncOperation(null, 'create', Array(10).fill('domain.com'));

      expect(large.timeout).toBeGreaterThan(small.timeout);
    });
  });

  describe('startAsyncOperation() - Error Cases', () => {
    it('deve rejeitar tipo nulo', () => {
      const result = startAsyncOperation(null, null, ['domain.com']);
      expect(result.operationId).toBeNull();
      expect(result.error).toContain('inválido');
    });

    it('deve rejeitar tipo vazio', () => {
      const result = startAsyncOperation(null, '', ['domain.com']);
      expect(result.operationId).toBeNull();
    });

    it('deve rejeitar tipo não-string', () => {
      const result = startAsyncOperation(null, 123, ['domain.com']);
      expect(result.operationId).toBeNull();
    });

    it('deve rejeitar domains nulo', () => {
      const result = startAsyncOperation(null, 'create', null);
      expect(result.operationId).toBeNull();
      expect(result.error).toContain('inválida');
    });

    it('deve rejeitar domains vazio', () => {
      const result = startAsyncOperation(null, 'create', []);
      expect(result.operationId).toBeNull();
    });

    it('deve rejeitar domains não-array', () => {
      const result = startAsyncOperation(null, 'create', 'domain.com');
      expect(result.operationId).toBeNull();
    });

    it('deve rejeitar operationId duplicado', () => {
      const result1 = startAsyncOperation('nsec3_op1', 'create', ['domain.com']);
      expect(result1.operationId).toBe('nsec3_op1');

      const result2 = startAsyncOperation('nsec3_op1', 'create', ['domain.com']);
      expect(result2.operationId).toBe('nsec3_op1');
      expect(result2.error).toContain('já existe');
    });
  });

  describe('getOperationStatus()', () => {
    it('deve retornar status de operação ativa', () => {
      const op = startAsyncOperation(null, 'create', ['example.com']);
      const status = getOperationStatus(op.operationId);

      expect(status.status).toBe(OPERATION_STATES.QUEUED);
      expect(status.progress).toBe(0);
      expect(status.timeout).toBeGreaterThan(0);
    });

    it('deve retornar informações completas', () => {
      const op = startAsyncOperation(null, 'update', ['domain1.com', 'domain2.com']);
      const status = getOperationStatus(op.operationId);

      expect(status.status).toBeDefined();
      expect(status.progress).toBeDefined();
      expect(status.completedSteps).toBeDefined();
      expect(status.totalSteps).toBe(2);
      expect(status.elapsed).toBeDefined();
      expect(status.timeout).toBeGreaterThan(0);
      expect(status.result).toBeNull(); // Ainda não completa
      expect(status.error).toBeNull();
    });

    it('deve retornar error para operationId inválido', () => {
      const status = getOperationStatus('invalid_id');
      expect(status.status).toBeNull();
      expect(status.error).toContain('não encontrada');
    });

    it('deve rejeitar operationId nulo', () => {
      const status = getOperationStatus(null);
      expect(status.status).toBeNull();
      expect(status.error).toContain('inválido');
    });

    it('deve calcular elapsed time corretamente', (done) => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const status1 = getOperationStatus(op.operationId);

      setTimeout(() => {
        const status2 = getOperationStatus(op.operationId);

        expect(status2.elapsed).toBeGreaterThan(status1.elapsed);
        done();
      }, 50);
    });
  });

  describe('updateOperationProgress()', () => {
    it('deve atualizar progresso com sucesso', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const result = updateOperationProgress(op.operationId, 50);

      expect(result.updated).toBe(true);
      expect(result.error).toBeNull();
    });

    it('deve refletir progresso atualizado', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      updateOperationProgress(op.operationId, 75);

      const status = getOperationStatus(op.operationId);
      expect(status.progress).toBe(75);
    });

    it('deve aceitar progresso de 0 a 100', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);

      [0, 25, 50, 75, 99, 100].forEach(progress => {
        const result = updateOperationProgress(op.operationId, progress);
        expect(result.updated).toBe(true);
      });
    });

    it('deve mover para IN_PROGRESS quando progresso > 0', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      let status = getOperationStatus(op.operationId);
      expect(status.status).toBe(OPERATION_STATES.QUEUED);

      updateOperationProgress(op.operationId, 1);
      status = getOperationStatus(op.operationId);
      expect(status.status).toBe(OPERATION_STATES.IN_PROGRESS);
    });

    it('deve marcar como COMPLETED em 100%', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      updateOperationProgress(op.operationId, 50);
      updateOperationProgress(op.operationId, 100);

      const status = getOperationStatus(op.operationId);
      expect(status.status).toBe(OPERATION_STATES.COMPLETED);
      expect(status.progress).toBe(100);
    });

    it('deve aceitar statusData com completedSteps', () => {
      const op = startAsyncOperation(null, 'create', ['d1.com', 'd2.com', 'd3.com']);
      updateOperationProgress(op.operationId, 33, { completedSteps: 1 });

      const status = getOperationStatus(op.operationId);
      expect(status.completedSteps).toBe(1);
      expect(status.totalSteps).toBe(3);
    });

    it('deve aceitar statusData com result em 100%', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const result = updateOperationProgress(op.operationId, 100, {
        result: { status: 'success', domainsProcessed: 1 }
      });

      expect(result.updated).toBe(true);
    });

    it('deve rejeitar progresso < 0', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const result = updateOperationProgress(op.operationId, -1);

      expect(result.updated).toBe(false);
      expect(result.error).toContain('entre 0 e 100');
    });

    it('deve rejeitar progresso > 100', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const result = updateOperationProgress(op.operationId, 101);

      expect(result.updated).toBe(false);
    });

    it('deve rejeitar progresso não-numérico', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const result = updateOperationProgress(op.operationId, 'fifty');

      expect(result.updated).toBe(false);
    });

    it('deve rejeitar operationId inválido', () => {
      const result = updateOperationProgress('invalid', 50);
      expect(result.updated).toBe(false);
      expect(result.error).toContain('não encontrada');
    });
  });

  describe('failOperation()', () => {
    it('deve marcar operação como falhada', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const result = failOperation(op.operationId, 'Domain parsing error');

      expect(result.updated).toBe(true);
      expect(result.error).toBeNull();
    });

    it('deve definir mensagem de erro', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      failOperation(op.operationId, 'Custom error message');

      const status = getOperationStatus(op.operationId);
      expect(status.status).toBe(OPERATION_STATES.FAILED);
      expect(status.error).toBe('Custom error message');
    });

    it('deve usar mensagem padrão se vazia', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      failOperation(op.operationId, '');

      const status = getOperationStatus(op.operationId);
      expect(status.error).toContain('sem detalhes');
    });

    it('deve rejeitar operationId nulo', () => {
      const result = failOperation(null, 'error');
      expect(result.updated).toBe(false);
    });

    it('deve rejeitar operationId inexistente', () => {
      const result = failOperation('nonexistent', 'error');
      expect(result.updated).toBe(false);
      expect(result.error).toContain('não encontrada');
    });
  });

  describe('onOperationProgress()', () => {
    it('deve registrar callback de progresso', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const callback = jest.fn();

      const result = onOperationProgress(op.operationId, callback);
      expect(result.registered).toBe(true);
    });

    it('deve chamar callback ao atualizar progresso', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const callback = jest.fn();

      onOperationProgress(op.operationId, callback);
      updateOperationProgress(op.operationId, 50);

      expect(callback).toHaveBeenCalled();
    });

    it('deve passar dados corretos para callback', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const callback = jest.fn();

      onOperationProgress(op.operationId, callback);
      updateOperationProgress(op.operationId, 75);

      expect(callback).toHaveBeenCalledWith({
        operationId: op.operationId,
        progress: 75,
        status: OPERATION_STATES.IN_PROGRESS
      });
    });

    it('deve suportar múltiplos callbacks', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      onOperationProgress(op.operationId, callback1);
      onOperationProgress(op.operationId, callback2);
      updateOperationProgress(op.operationId, 50);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('deve rejeitar callback não-função', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const result = onOperationProgress(op.operationId, 'notafunction');

      expect(result.registered).toBe(false);
    });

    it('deve rejeitar operationId nulo', () => {
      const callback = jest.fn();
      const result = onOperationProgress(null, callback);

      expect(result.registered).toBe(false);
    });

    it('deve permitir registrar múltiplos callbacks sequencialmente', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      const cb3 = jest.fn();

      onOperationProgress(op.operationId, cb1);
      onOperationProgress(op.operationId, cb2);
      onOperationProgress(op.operationId, cb3);

      updateOperationProgress(op.operationId, 50);

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      expect(cb3).toHaveBeenCalled();
    });
  });

  describe('getOperationStats()', () => {
    it('deve retornar stats zeradas sem operações', () => {
      const stats = getOperationStats();

      expect(stats.total).toBe(0);
      expect(stats.queued).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.cancelled).toBe(0);
    });

    it('deve contar operações queued', () => {
      startAsyncOperation(null, 'create', ['d1.com']);
      startAsyncOperation(null, 'create', ['d2.com']);

      const stats = getOperationStats();
      expect(stats.queued).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('deve contar operações in_progress', () => {
      const op1 = startAsyncOperation(null, 'create', ['d1.com']);
      const op2 = startAsyncOperation(null, 'create', ['d2.com']);

      updateOperationProgress(op1.operationId, 50);
      updateOperationProgress(op2.operationId, 75);

      const stats = getOperationStats();
      expect(stats.inProgress).toBe(2);
    });

    it('deve contar operações completed', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      updateOperationProgress(op.operationId, 100);

      const stats = getOperationStats();
      expect(stats.completed).toBe(1);
    });

    it('deve contar operações failed', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      failOperation(op.operationId, 'error');

      const stats = getOperationStats();
      expect(stats.failed).toBe(1);
    });

    it('deve manter stats corretas em mix de operações', () => {
      const op1 = startAsyncOperation(null, 'create', ['d1.com']);
      const op2 = startAsyncOperation(null, 'update', ['d2.com']);
      const op3 = startAsyncOperation(null, 'delete', ['d3.com']);
      const op4 = startAsyncOperation(null, 'recalc', ['d4.com']);

      updateOperationProgress(op1.operationId, 100); // completed
      updateOperationProgress(op2.operationId, 50); // in_progress
      failOperation(op3.operationId, 'error'); // failed
      // op4 fica queued

      const stats = getOperationStats();
      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.queued).toBe(1);
    });
  });

  describe('cleanupOldOperations()', () => {
    it('deve retornar 0 sem operações', () => {
      const removed = cleanupOldOperations(60);
      expect(removed).toBe(0);
    });

    it('deve aceitar maxAgeMinutes customizado', () => {
      const removed = cleanupOldOperations(30);
      expect(typeof removed).toBe('number');
    });

    it('deve usar default de 60 minutos', () => {
      const removed = cleanupOldOperations();
      expect(typeof removed).toBe('number');
    });

    it('deve não remover operações em progresso', () => {
      const op = startAsyncOperation(null, 'create', ['domain.com']);
      updateOperationProgress(op.operationId, 50);

      const removed = cleanupOldOperations(0); // maxAge = 0
      expect(removed).toBe(0); // Não remove in_progress
    });

    it('deve não remover operações queued', () => {
      startAsyncOperation(null, 'create', ['domain.com']);

      const removed = cleanupOldOperations(0);
      expect(removed).toBe(0); // Não remove queued
    });
  });

  describe('clearAllOperations()', () => {
    it('deve remover todas as operações', () => {
      startAsyncOperation(null, 'create', ['d1.com']);
      startAsyncOperation(null, 'update', ['d2.com']);
      startAsyncOperation(null, 'delete', ['d3.com']);

      const removed = clearAllOperations();

      expect(removed).toBe(3);
      expect(getOperationStats().total).toBe(0);
    });

    it('deve retornar 0 sem operações', () => {
      const removed = clearAllOperations();
      expect(removed).toBe(0);
    });

    it('deve permitir reiniciar após clear', () => {
      startAsyncOperation(null, 'create', ['d1.com']);
      clearAllOperations();

      const op = startAsyncOperation(null, 'create', ['d2.com']);
      expect(op.operationId).toBeTruthy();
      expect(getOperationStats().total).toBe(1);
    });
  });

  describe('NSEC3 Async Handler - Integration Tests', () => {
    it('deve gerenciar operação completa', () => {
      // Iniciar
      const op = startAsyncOperation(null, 'create', ['domain1.com', 'domain2.com']);
      expect(op.operationId).toBeTruthy();

      // Verificar status inicial
      let status = getOperationStatus(op.operationId);
      expect(status.status).toBe(OPERATION_STATES.QUEUED);

      // Atualizar progresso
      updateOperationProgress(op.operationId, 50, { completedSteps: 1 });
      status = getOperationStatus(op.operationId);
      expect(status.status).toBe(OPERATION_STATES.IN_PROGRESS);

      // Completar
      updateOperationProgress(op.operationId, 100, {
        completedSteps: 2,
        result: { success: true }
      });
      status = getOperationStatus(op.operationId);
      expect(status.status).toBe(OPERATION_STATES.COMPLETED);
    });

    it('deve gerenciar múltiplas operações em paralelo', () => {
      const ops = [];
      for (let i = 1; i <= 5; i++) {
        const op = startAsyncOperation(null, 'create', [`domain${i}.com`]);
        ops.push(op);
      }

      // Atualizar progresso em diferentes estágios
      updateOperationProgress(ops[0].operationId, 100);
      updateOperationProgress(ops[1].operationId, 75);
      updateOperationProgress(ops[2].operationId, 50);
      updateOperationProgress(ops[3].operationId, 25);
      // ops[4] fica queued

      const stats = getOperationStats();
      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(1);
      expect(stats.inProgress).toBe(3);
      expect(stats.queued).toBe(1);
    });

    it('deve suportar callbacks em múltiplas operações', () => {
      const op1 = startAsyncOperation(null, 'create', ['d1.com']);
      const op2 = startAsyncOperation(null, 'update', ['d2.com']);

      const cb1 = jest.fn();
      const cb2 = jest.fn();

      onOperationProgress(op1.operationId, cb1);
      onOperationProgress(op2.operationId, cb2);

      updateOperationProgress(op1.operationId, 50);
      updateOperationProgress(op2.operationId, 75);

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb1).toHaveBeenCalledWith(expect.objectContaining({
        progress: 50
      }));
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({
        progress: 75
      }));
    });

    it('deve calcular timeout dinamicamente para operações', () => {
      const opSmall = startAsyncOperation(null, 'create', ['domain.com']);
      const timeoutSmall = opSmall.timeout;

      const opLarge = startAsyncOperation(null, 'create', Array(10).fill('domain.com'));
      const timeoutLarge = opLarge.timeout;

      expect(timeoutLarge).toBeGreaterThan(timeoutSmall);
    });
  });
});
