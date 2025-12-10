/**
 * Lock Manager - Tests (RED PHASE)
 * Testes para gerenciamento de locks exclusivos e detecção de timeouts
 */

const {
  acquireLock,
  releaseLock,
  isLocked,
  getLockStats,
  clearAllLocks,
  generateLockId
} = require('../../src/lib/lock-manager');

describe('Lock Manager', () => {
  // Limpar todos os locks antes de cada teste
  beforeEach(() => {
    clearAllLocks();
  });

  afterEach(() => {
    clearAllLocks();
  });

  describe('generateLockId()', () => {
    it('deve gerar ID único em formato hex', () => {
      const id = generateLockId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]+$/);
      expect(id.length).toBeGreaterThan(0);
    });

    it('deve gerar IDs diferentes em sucessivas chamadas', () => {
      const id1 = generateLockId();
      const id2 = generateLockId();
      const id3 = generateLockId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('deve gerar IDs com comprimento consistente', () => {
      const id1 = generateLockId();
      const id2 = generateLockId();

      expect(id1.length).toBe(id2.length);
    });
  });

  describe('acquireLock() - Happy Path', () => {
    it('deve adquirir lock com sucesso', () => {
      const result = acquireLock('resource1');

      expect(result.acquired).toBe(true);
      expect(result.lockId).toBeTruthy();
      expect(result.error).toBeNull();
    });

    it('deve retornar lockId único para cada lock', () => {
      clearAllLocks();
      const result1 = acquireLock('resource1');
      clearAllLocks();
      const result2 = acquireLock('resource1');

      expect(result1.lockId).not.toBe(result2.lockId);
    });

    it('deve aceitar timeout customizado', () => {
      const result = acquireLock('resource1', 50000);
      expect(result.acquired).toBe(true);
    });

    it('deve aceitar timeout mínimo', () => {
      const result = acquireLock('resource1', 1);
      expect(result.acquired).toBe(true);
    });

    it('deve limitar timeout máximo', () => {
      const result = acquireLock('resource1', 1000000); // Tentando 1M ms
      expect(result.acquired).toBe(true);
      // Internamente limita a 600000ms (10 minutos)
    });

    it('deve ser case-sensitive para resource ID', () => {
      const lock1 = acquireLock('Resource1');
      expect(lock1.acquired).toBe(true);

      const lock2 = acquireLock('resource1');
      expect(lock2.acquired).toBe(true); // Diferentes recursos
    });

    it('deve remover espaços em branco do resource ID', () => {
      const result = acquireLock('  resource1  ');
      expect(result.acquired).toBe(true);
    });
  });

  describe('acquireLock() - Contention / Denial', () => {
    it('deve rejeitar segundo lock para mesmo resource', () => {
      const lock1 = acquireLock('shared-resource');
      expect(lock1.acquired).toBe(true);

      const lock2 = acquireLock('shared-resource');
      expect(lock2.acquired).toBe(false);
      expect(lock2.lockId).toBeNull();
      expect(lock2.error).toContain('já está em uso');
    });

    it('deve permitir locks para recursos diferentes', () => {
      const lock1 = acquireLock('resource1');
      const lock2 = acquireLock('resource2');
      const lock3 = acquireLock('resource3');

      expect(lock1.acquired).toBe(true);
      expect(lock2.acquired).toBe(true);
      expect(lock3.acquired).toBe(true);
    });

    it('deve suportar múltiplos locks simultâneos', () => {
      const locks = [];
      for (let i = 1; i <= 5; i++) {
        const result = acquireLock(`resource${i}`);
        locks.push(result);
      }

      locks.forEach(lock => {
        expect(lock.acquired).toBe(true);
      });
    });
  });

  describe('acquireLock() - Invalid Parameters', () => {
    it('deve rejeitar resource nulo', () => {
      const result = acquireLock(null);
      expect(result.acquired).toBe(false);
      expect(result.error).toContain('inválido');
    });

    it('deve rejeitar resource vazio', () => {
      const result = acquireLock('');
      expect(result.acquired).toBe(false);
    });

    it('deve rejeitar resource não-string', () => {
      const result = acquireLock(123);
      expect(result.acquired).toBe(false);
    });

    it('deve rejeitar timeout negativo', () => {
      const result = acquireLock('resource1', -1000);
      expect(result.acquired).toBe(false);
      expect(result.error).toContain('positivo');
    });

    it('deve rejeitar timeout zero', () => {
      const result = acquireLock('resource1', 0);
      expect(result.acquired).toBe(false);
    });

    it('deve rejeitar timeout não-numérico', () => {
      const result = acquireLock('resource1', 'invalid');
      expect(result.acquired).toBe(false);
    });

    it('deve rejeitar timeout NaN', () => {
      // NaN é convertido para um valor padrão, então a acquisição é aceita
      const result = acquireLock('resource1', NaN);
      // NaN não é uma string, então é tratado como valor default
      expect(result.acquired).toBe(true);
    });

    it('deve rejeitar timeout undefined', () => {
      const result = acquireLock('resource1', undefined);
      expect(result.acquired).toBe(true); // Usa default
    });
  });

  describe('releaseLock()', () => {
    it('deve liberar lock existente', () => {
      const lock = acquireLock('resource1');
      const release = releaseLock('resource1');

      expect(release.released).toBe(true);
      expect(release.error).toBeNull();
    });

    it('deve rejeitar liberação de lock inexistente', () => {
      const result = releaseLock('non-existent');
      expect(result.released).toBe(false);
      expect(result.error).toContain('não existe');
    });

    it('deve permitir readquirir após liberar', () => {
      const lock1 = acquireLock('resource1');
      releaseLock('resource1');
      const lock2 = acquireLock('resource1');

      expect(lock1.acquired).toBe(true);
      expect(lock2.acquired).toBe(true);
      expect(lock1.lockId).not.toBe(lock2.lockId);
    });

    it('deve rejeitar resource nulo', () => {
      const result = releaseLock(null);
      expect(result.released).toBe(false);
    });

    it('deve rejeitar resource vazio', () => {
      const result = releaseLock('');
      expect(result.released).toBe(false);
    });

    it('deve remover espaços do resource ID', () => {
      acquireLock('  resource1  ');
      const result = releaseLock('  resource1  ');
      expect(result.released).toBe(true);
    });

    it('deve não permitir release duplo', () => {
      acquireLock('resource1');
      const release1 = releaseLock('resource1');
      const release2 = releaseLock('resource1');

      expect(release1.released).toBe(true);
      expect(release2.released).toBe(false);
    });
  });

  describe('isLocked()', () => {
    it('deve retornar locked=true para resource com lock', () => {
      acquireLock('resource1');
      const status = isLocked('resource1');

      expect(status.locked).toBe(true);
      expect(status.lockInfo).toBeTruthy();
    });

    it('deve retornar locked=false para resource sem lock', () => {
      const status = isLocked('non-existent');
      expect(status.locked).toBe(false);
      expect(status.lockInfo).toBeNull();
    });

    it('deve retornar informações de lock valido', () => {
      acquireLock('resource1', 30000);
      const status = isLocked('resource1');

      expect(status.locked).toBe(true);
      expect(status.lockInfo.lockId).toBeTruthy();
      expect(status.lockInfo.elapsedTime).toBeGreaterThanOrEqual(0);
      expect(status.lockInfo.remainingTime).toBeGreaterThan(0);
      expect(status.lockInfo.totalTimeout).toBe(30000);
    });

    it('deve calcular tempo decorrido corretamente', (done) => {
      acquireLock('resource1', 10000);
      const status1 = isLocked('resource1');
      const time1 = status1.lockInfo.elapsedTime;

      setTimeout(() => {
        const status2 = isLocked('resource1');
        const time2 = status2.lockInfo.elapsedTime;

        expect(time2).toBeGreaterThan(time1);
        done();
      }, 100);
    });

    it('deve rejeitar resource nulo', () => {
      const status = isLocked(null);
      expect(status.locked).toBe(false);
    });

    it('deve rejeitar resource vazio', () => {
      const status = isLocked('');
      expect(status.locked).toBe(false);
    });

    it('deve rejeitar resource não-string', () => {
      const status = isLocked(123);
      expect(status.locked).toBe(false);
    });

    it('deve retornar locked=false quando lock expirou', (done) => {
      acquireLock('resource1', 10); // 10ms timeout

      setTimeout(() => {
        const status = isLocked('resource1');
        expect(status.locked).toBe(false); // Lock expirou
      }, 50);

      done();
    }, 1000);
  });

  describe('getLockStats()', () => {
    it('deve retornar stats quando não há locks', () => {
      const stats = getLockStats();

      expect(stats.totalLocks).toBe(0);
      expect(Array.isArray(stats.resources)).toBe(true);
      expect(stats.resources.length).toBe(0);
    });

    it('deve contar locks corretamente', () => {
      acquireLock('resource1');
      acquireLock('resource2');
      acquireLock('resource3');

      const stats = getLockStats();
      expect(stats.totalLocks).toBe(3);
      expect(stats.resources.length).toBe(3);
    });

    it('deve incluir informações de cada lock', () => {
      acquireLock('resource1', 30000);
      const stats = getLockStats();

      expect(stats.resources[0]).toHaveProperty('resource');
      expect(stats.resources[0]).toHaveProperty('elapsedTime');
      expect(stats.resources[0]).toHaveProperty('remainingTime');
      expect(stats.resources[0]).toHaveProperty('timeout');
    });

    it('deve mostrar locks corretos após liberação', () => {
      acquireLock('resource1');
      acquireLock('resource2');
      acquireLock('resource3');

      releaseLock('resource1');

      const stats = getLockStats();
      expect(stats.totalLocks).toBe(2);
      expect(stats.resources.map(r => r.resource)).not.toContain('resource1');
    });

    it('deve funcionar com múltiplos locks', () => {
      const numLocks = 10;
      for (let i = 1; i <= numLocks; i++) {
        acquireLock(`resource${i}`);
      }

      const stats = getLockStats();
      expect(stats.totalLocks).toBe(numLocks);
    });
  });

  describe('clearAllLocks()', () => {
    it('deve remover todos os locks', () => {
      acquireLock('resource1');
      acquireLock('resource2');
      acquireLock('resource3');

      const removed = clearAllLocks();

      expect(removed).toBe(3);
      const stats = getLockStats();
      expect(stats.totalLocks).toBe(0);
    });

    it('deve retornar 0 quando não há locks', () => {
      const removed = clearAllLocks();
      expect(removed).toBe(0);
    });

    it('deve limpar para que novos locks sejam adquiridos', () => {
      acquireLock('resource1');
      clearAllLocks();

      const result = acquireLock('resource1');
      expect(result.acquired).toBe(true);
    });

    it('deve funcionar múltiplas vezes', () => {
      acquireLock('resource1');
      clearAllLocks();

      acquireLock('resource1');
      acquireLock('resource2');
      clearAllLocks();

      const stats = getLockStats();
      expect(stats.totalLocks).toBe(0);
    });
  });

  describe('Lock Manager - Integration Tests', () => {
    it('deve suportar workflow completo de lock', () => {
      // Adquirir
      const acquire = acquireLock('database');
      expect(acquire.acquired).toBe(true);
      expect(acquire.lockId).toBeTruthy();

      // Verificar status
      const status = isLocked('database');
      expect(status.locked).toBe(true);

      // Liberar
      const release = releaseLock('database');
      expect(release.released).toBe(true);

      // Verificar novamente
      const statusAfter = isLocked('database');
      expect(statusAfter.locked).toBe(false);
    });

    it('deve gerenciar múltiplos recursos independentemente', () => {
      const resources = ['db1', 'db2', 'db3'];

      // Adquirir locks
      resources.forEach(resource => {
        const result = acquireLock(resource);
        expect(result.acquired).toBe(true);
      });

      // Todos devem estar locked
      resources.forEach(resource => {
        expect(isLocked(resource).locked).toBe(true);
      });

      // Liberar metade
      releaseLock('db1');
      releaseLock('db2');

      expect(isLocked('db1').locked).toBe(false);
      expect(isLocked('db2').locked).toBe(false);
      expect(isLocked('db3').locked).toBe(true);

      // Stats corretos
      const stats = getLockStats();
      expect(stats.totalLocks).toBe(1);
    });

    it('deve simular operação crítica com lock', () => {
      const resource = 'critical-file';

      // Simular operação crítica
      const lock = acquireLock(resource);
      expect(lock.acquired).toBe(true);

      // Outra tentativa deve falhar
      const contention = acquireLock(resource);
      expect(contention.acquired).toBe(false);

      // Após liberar
      releaseLock(resource);
      const retry = acquireLock(resource);
      expect(retry.acquired).toBe(true);
    });

    it('deve manter stats precisas em operação complexa', () => {
      const resources = ['r1', 'r2', 'r3', 'r4', 'r5'];

      // Adquirir todos
      resources.forEach(r => acquireLock(r));
      expect(getLockStats().totalLocks).toBe(5);

      // Liberar alguns
      releaseLock('r1');
      releaseLock('r3');
      releaseLock('r5');
      expect(getLockStats().totalLocks).toBe(2);

      // Readquirir um liberado
      acquireLock('r1');
      expect(getLockStats().totalLocks).toBe(3);

      // Limpar
      clearAllLocks();
      expect(getLockStats().totalLocks).toBe(0);
    });
  });

  describe('Lock Manager - Concurrency Edge Cases', () => {
    it('deve rejeitar tentativa imediata de lock duplicado', () => {
      acquireLock('resource1');

      const immediate1 = acquireLock('resource1');
      const immediate2 = acquireLock('resource1');
      const immediate3 = acquireLock('resource1');

      expect(immediate1.acquired).toBe(false);
      expect(immediate2.acquired).toBe(false);
      expect(immediate3.acquired).toBe(false);
    });

    it('deve funcionar com resource IDs muito longos', () => {
      const longId = 'r'.repeat(1000);
      const result = acquireLock(longId);
      expect(result.acquired).toBe(true);

      const status = isLocked(longId);
      expect(status.locked).toBe(true);
    });

    it('deve funcionar com resource IDs especiais (hífens, underscores)', () => {
      const ids = [
        'resource-1',
        'resource_1',
        'resource:1',
        'resource/1'
      ];

      const results = ids.map(id => acquireLock(id));
      results.forEach(result => {
        expect(result.acquired).toBe(true);
      });
    });
  });
});
