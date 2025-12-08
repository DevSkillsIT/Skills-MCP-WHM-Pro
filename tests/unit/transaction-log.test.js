/**
 * Transaction Log - Tests (RED PHASE)
 * Testes para sistema de log de transações com suporte a rollback
 */

const {
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  getTransactionStatus,
  getActiveTransactions,
  cleanupOldTransactions,
  getTransactionStats,
  clearAllTransactions,
  generateTransactionId,
  TRANSACTION_STATES
} = require('../../src/lib/transaction-log');

describe('Transaction Log', () => {
  // Limpar todas as transações antes de cada teste
  beforeEach(() => {
    clearAllTransactions();
  });

  afterEach(() => {
    clearAllTransactions();
  });

  describe('generateTransactionId()', () => {
    it('deve gerar ID único com prefixo txn_', () => {
      const id = generateTransactionId();
      expect(id).toMatch(/^txn_[0-9a-f]+$/);
      expect(id.startsWith('txn_')).toBe(true);
    });

    it('deve gerar IDs diferentes em sucessivas chamadas', () => {
      const id1 = generateTransactionId();
      const id2 = generateTransactionId();
      const id3 = generateTransactionId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('deve gerar IDs com comprimento consistente', () => {
      const id1 = generateTransactionId();
      const id2 = generateTransactionId();

      expect(id1.length).toBe(id2.length);
    });
  });

  describe('beginTransaction() - Happy Path', () => {
    it('deve iniciar transação com dados válidos', () => {
      const data = { type: 'domain_update', domain: 'example.com' };
      const result = beginTransaction(data);

      expect(result.transactionId).toBeTruthy();
      expect(result.transactionId).toMatch(/^txn_/);
      expect(result.status).toBe(TRANSACTION_STATES.PENDING);
      expect(result.backup).toBeDefined();
    });

    it('deve criar backup profundo dos dados', () => {
      const originalData = { type: 'update', value: 100, nested: { prop: 'test' } };
      const result = beginTransaction(originalData);

      expect(result.backup).toEqual(originalData);
      expect(result.backup).not.toBe(originalData); // Deve ser cópia
    });

    it('deve iniciar com status PENDING', () => {
      const data = { type: 'test' };
      const result = beginTransaction(data);

      expect(result.status).toBe(TRANSACTION_STATES.PENDING);
    });

    it('deve retornar backup completo', () => {
      const data = { operation: 'create', user: 'admin', timestamp: Date.now() };
      const result = beginTransaction(data);

      expect(result.backup.operation).toBe('create');
      expect(result.backup.user).toBe('admin');
    });

    it('deve suportar objetos complexos', () => {
      const complexData = {
        type: 'bulk_update',
        items: [
          { id: 1, name: 'item1' },
          { id: 2, name: 'item2' }
        ],
        metadata: {
          timestamp: Date.now(),
          user: 'admin'
        }
      };

      const result = beginTransaction(complexData);
      expect(result.transactionId).toBeTruthy();
      expect(result.backup.items.length).toBe(2);
    });

    it('deve suportar arrays vazios', () => {
      const data = { type: 'bulk_delete', items: [] };
      const result = beginTransaction(data);

      expect(result.backup.items).toEqual([]);
    });

    it('deve suportar objetos vazios', () => {
      const data = {};
      const result = beginTransaction(data);

      expect(result.transactionId).toBeTruthy();
      expect(result.backup).toEqual({});
    });
  });

  describe('beginTransaction() - Error Cases', () => {
    it('deve rejeitar operationData nulo', () => {
      expect(() => beginTransaction(null)).toThrow();
    });

    it('deve rejeitar operationData undefined', () => {
      expect(() => beginTransaction(undefined)).toThrow();
    });

    it('deve rejeitar operationData não-objeto', () => {
      expect(() => beginTransaction('string')).toThrow();
      expect(() => beginTransaction(123)).toThrow();
      // Arrays são objetos em JavaScript, então não lança
    });

    it('deve ignorar funções em operationData', () => {
      const data = {
        type: 'test',
        func: () => {} // Funções são ignoradas na serialização JSON
      };
      // JSON.stringify ignora funções, não lança erro
      const result = beginTransaction(data);
      expect(result.transactionId).toBeTruthy();
    });

    it('deve rejeitar operationData com referência circular', () => {
      const data = { type: 'test' };
      data.self = data; // Referência circular
      expect(() => beginTransaction(data)).toThrow();
    });
  });

  describe('commitTransaction() - Happy Path', () => {
    it('deve commitar transação pendente', () => {
      const txn = beginTransaction({ type: 'update' });
      const result = commitTransaction(txn.transactionId);

      expect(result.status).toBe(TRANSACTION_STATES.COMMITTED);
      expect(result.error).toBeNull();
    });

    it('deve aceitar transactionId com espaços', () => {
      const txn = beginTransaction({ type: 'update' });
      const result = commitTransaction(`  ${txn.transactionId}  `);

      expect(result.status).toBe(TRANSACTION_STATES.COMMITTED);
    });

    it('deve permitir commit apenas uma vez', () => {
      const txn = beginTransaction({ type: 'update' });
      commitTransaction(txn.transactionId);

      const retry = commitTransaction(txn.transactionId);
      expect(retry.status).toBeNull();
      expect(retry.error).toContain('não está em estado');
    });
  });

  describe('commitTransaction() - Error Cases', () => {
    it('deve rejeitar transactionId nulo', () => {
      const result = commitTransaction(null);
      expect(result.status).toBeNull();
      expect(result.error).toContain('inválido');
    });

    it('deve rejeitar transactionId vazio', () => {
      const result = commitTransaction('');
      expect(result.status).toBeNull();
    });

    it('deve rejeitar transactionId não-string', () => {
      const result = commitTransaction(123);
      expect(result.status).toBeNull();
    });

    it('deve rejeitar commit de transação inexistente', () => {
      const result = commitTransaction('txn_nonexistent');
      expect(result.status).toBeNull();
      expect(result.error).toContain('não encontrada');
    });

    it('deve rejeitar commit após rollback', () => {
      const txn = beginTransaction({ type: 'update' });
      rollbackTransaction(txn.transactionId);

      const result = commitTransaction(txn.transactionId);
      expect(result.status).toBeNull();
      expect(result.error).toContain('não está em estado');
    });
  });

  describe('rollbackTransaction() - Happy Path', () => {
    it('deve fazer rollback de transação pendente', () => {
      const txn = beginTransaction({ type: 'update', value: 100 });
      const result = rollbackTransaction(txn.transactionId);

      expect(result.status).toBe(TRANSACTION_STATES.ROLLED_BACK);
      expect(result.error).toBeNull();
      expect(result.backup).toBeDefined();
    });

    it('deve retornar backup original no rollback', () => {
      const originalData = { type: 'update', value: 100 };
      const txn = beginTransaction(originalData);

      const result = rollbackTransaction(txn.transactionId);
      expect(result.backup.value).toBe(100);
    });

    it('deve aceitar transactionId com espaços', () => {
      const txn = beginTransaction({ type: 'update' });
      const result = rollbackTransaction(`  ${txn.transactionId}  `);

      expect(result.status).toBe(TRANSACTION_STATES.ROLLED_BACK);
    });
  });

  describe('rollbackTransaction() - Error Cases', () => {
    it('deve rejeitar transactionId nulo', () => {
      const result = rollbackTransaction(null);
      expect(result.status).toBeNull();
      expect(result.error).toContain('inválido');
    });

    it('deve rejeitar transactionId vazio', () => {
      const result = rollbackTransaction('');
      expect(result.status).toBeNull();
    });

    it('deve rejeitar rollback de transação inexistente', () => {
      const result = rollbackTransaction('txn_nonexistent');
      expect(result.status).toBeNull();
      expect(result.error).toContain('não encontrada');
    });

    it('deve rejeitar rollback após commit', () => {
      const txn = beginTransaction({ type: 'update' });
      commitTransaction(txn.transactionId);

      const result = rollbackTransaction(txn.transactionId);
      expect(result.status).toBeNull();
      expect(result.error).toContain('não é possível');
    });

    it('deve rejeitar rollback duplo', () => {
      const txn = beginTransaction({ type: 'update' });
      rollbackTransaction(txn.transactionId);

      const retry = rollbackTransaction(txn.transactionId);
      expect(retry.status).toBeNull();
      expect(retry.error).toContain('não é possível');
    });
  });

  describe('getTransactionStatus()', () => {
    it('deve retornar status de transação pendente', () => {
      const txn = beginTransaction({ type: 'test' });
      const status = getTransactionStatus(txn.transactionId);

      expect(status.status).toBe(TRANSACTION_STATES.PENDING);
      expect(status.error).toBeNull();
      expect(status.data).toBeDefined();
    });

    it('deve retornar dados completos de transação', () => {
      const txn = beginTransaction({ type: 'domain_create', domain: 'example.com' });
      const status = getTransactionStatus(txn.transactionId);

      expect(status.data.transactionId).toBe(txn.transactionId);
      expect(status.data.status).toBe(TRANSACTION_STATES.PENDING);
      expect(status.data.operationType).toBe('domain_create');
      expect(status.data.startedAt).toBeDefined();
      expect(status.data.completedAt).toBeNull();
      expect(status.data.hasBackup).toBe(true);
    });

    it('deve retornar status de transação commitada', () => {
      const txn = beginTransaction({ type: 'update' });
      commitTransaction(txn.transactionId);

      const status = getTransactionStatus(txn.transactionId);
      expect(status.status).toBe(TRANSACTION_STATES.COMMITTED);
      expect(status.data.completedAt).toBeDefined();
      expect(status.data.duration).toBeDefined();
    });

    it('deve retornar status de transação rolled back', () => {
      const txn = beginTransaction({ type: 'update' });
      rollbackTransaction(txn.transactionId);

      const status = getTransactionStatus(txn.transactionId);
      expect(status.status).toBe(TRANSACTION_STATES.ROLLED_BACK);
      expect(status.data.completedAt).toBeDefined();
    });

    it('deve rejeitar transactionId nulo', () => {
      const result = getTransactionStatus(null);
      expect(result.status).toBeNull();
      expect(result.error).toContain('inválido');
    });

    it('deve rejeitar transactionId inexistente', () => {
      const result = getTransactionStatus('txn_nonexistent');
      expect(result.status).toBeNull();
      expect(result.error).toContain('não encontrada');
    });

    it('deve calcular duration corretamente para transação completada', (done) => {
      const txn = beginTransaction({ type: 'update' });

      setTimeout(() => {
        commitTransaction(txn.transactionId);
        const status = getTransactionStatus(txn.transactionId);

        expect(status.data.duration).toBeGreaterThanOrEqual(50); // Pelo menos 50ms
        done();
      }, 50);
    });
  });

  describe('getActiveTransactions()', () => {
    it('deve retornar array vazio quando não há transações', () => {
      const active = getActiveTransactions();
      expect(Array.isArray(active)).toBe(true);
      expect(active.length).toBe(0);
    });

    it('deve retornar transações pendentes', () => {
      beginTransaction({ type: 'update1' });
      beginTransaction({ type: 'update2' });

      const active = getActiveTransactions();
      expect(active.length).toBe(2);
    });

    it('deve não incluir transações commitadas', () => {
      const txn1 = beginTransaction({ type: 'update1' });
      const txn2 = beginTransaction({ type: 'update2' });

      commitTransaction(txn1.transactionId);

      const active = getActiveTransactions();
      expect(active.length).toBe(1); // Apenas txn2
    });

    it('deve não incluir transações rolled back', () => {
      const txn1 = beginTransaction({ type: 'update1' });
      const txn2 = beginTransaction({ type: 'update2' });

      rollbackTransaction(txn1.transactionId);

      const active = getActiveTransactions();
      expect(active.length).toBe(1); // Apenas txn2
    });

    it('deve incluir informações de cada transação ativa', () => {
      const txn = beginTransaction({ type: 'domain_update' });
      const active = getActiveTransactions();

      expect(active[0]).toHaveProperty('transactionId');
      expect(active[0]).toHaveProperty('operationType');
      expect(active[0]).toHaveProperty('startedAt');
      expect(active[0]).toHaveProperty('duration');
    });

    it('deve calcular duration corretamente', (done) => {
      beginTransaction({ type: 'update' });
      const active1 = getActiveTransactions();
      const duration1 = active1[0].duration;

      setTimeout(() => {
        const active2 = getActiveTransactions();
        const duration2 = active2[0].duration;

        expect(duration2).toBeGreaterThan(duration1);
        done();
      }, 50);
    });
  });

  describe('getTransactionStats()', () => {
    it('deve retornar stats zeradas quando não há transações', () => {
      const stats = getTransactionStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.committed).toBe(0);
      expect(stats.rolledBack).toBe(0);
    });

    it('deve contar transações pendentes', () => {
      beginTransaction({ type: 'update1' });
      beginTransaction({ type: 'update2' });
      beginTransaction({ type: 'update3' });

      const stats = getTransactionStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(3);
      expect(stats.committed).toBe(0);
      expect(stats.rolledBack).toBe(0);
    });

    it('deve contar transações commitadas', () => {
      const txn1 = beginTransaction({ type: 'update1' });
      const txn2 = beginTransaction({ type: 'update2' });

      commitTransaction(txn1.transactionId);
      commitTransaction(txn2.transactionId);

      const stats = getTransactionStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(0);
      expect(stats.committed).toBe(2);
    });

    it('deve contar transações rolled back', () => {
      const txn1 = beginTransaction({ type: 'update1' });
      const txn2 = beginTransaction({ type: 'update2' });

      rollbackTransaction(txn1.transactionId);
      rollbackTransaction(txn2.transactionId);

      const stats = getTransactionStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(0);
      expect(stats.rolledBack).toBe(2);
    });

    it('deve manter stats corretas em operações mistas', () => {
      const txn1 = beginTransaction({ type: 'update1' });
      const txn2 = beginTransaction({ type: 'update2' });
      const txn3 = beginTransaction({ type: 'update3' });

      commitTransaction(txn1.transactionId);
      rollbackTransaction(txn2.transactionId);
      // txn3 permanece pending

      const stats = getTransactionStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.committed).toBe(1);
      expect(stats.rolledBack).toBe(1);
    });
  });

  describe('cleanupOldTransactions()', () => {
    it('deve remover 0 transações quando não há', () => {
      const removed = cleanupOldTransactions(24);
      expect(removed).toBe(0);
    });

    it('deve não remover transações pendentes', () => {
      beginTransaction({ type: 'update' });

      const removed = cleanupOldTransactions(0); // maxAge = 0 deveria limpar tudo
      expect(removed).toBe(0); // Pendentes não são limpas
    });

    it('deve aceitar maxAgeHours customizado', () => {
      const removed1 = cleanupOldTransactions(1);
      const removed2 = cleanupOldTransactions(24);
      const removed3 = cleanupOldTransactions(48);

      // Apenas verificar que não lança erro
      expect(typeof removed1).toBe('number');
      expect(typeof removed2).toBe('number');
      expect(typeof removed3).toBe('number');
    });

    it('deve usar default de 24 horas', () => {
      const removed = cleanupOldTransactions(); // Sem parâmetro
      expect(typeof removed).toBe('number');
    });
  });

  describe('clearAllTransactions()', () => {
    it('deve remover todas as transações', () => {
      beginTransaction({ type: 'update1' });
      beginTransaction({ type: 'update2' });
      beginTransaction({ type: 'update3' });

      const removed = clearAllTransactions();

      expect(removed).toBe(3);
      expect(getTransactionStats().total).toBe(0);
    });

    it('deve retornar 0 quando não há transações', () => {
      const removed = clearAllTransactions();
      expect(removed).toBe(0);
    });

    it('deve permitir reiniciar após clear', () => {
      beginTransaction({ type: 'update1' });
      clearAllTransactions();

      const txn = beginTransaction({ type: 'update2' });
      expect(txn.transactionId).toBeTruthy();
      expect(getTransactionStats().total).toBe(1);
    });
  });

  describe('Transaction Log - Integration Tests', () => {
    it('deve suportar workflow completo de transação', () => {
      const data = { type: 'domain_update', domain: 'example.com', ttl: 3600 };

      // Iniciar transação
      const txn = beginTransaction(data);
      expect(txn.status).toBe(TRANSACTION_STATES.PENDING);

      // Verificar status
      let status = getTransactionStatus(txn.transactionId);
      expect(status.status).toBe(TRANSACTION_STATES.PENDING);

      // Commitar
      const commitResult = commitTransaction(txn.transactionId);
      expect(commitResult.status).toBe(TRANSACTION_STATES.COMMITTED);

      // Verificar status final
      status = getTransactionStatus(txn.transactionId);
      expect(status.status).toBe(TRANSACTION_STATES.COMMITTED);
    });

    it('deve suportar rollback após iniciar', () => {
      const data = { type: 'domain_delete', domain: 'example.com' };

      const txn = beginTransaction(data);
      const rollbackResult = rollbackTransaction(txn.transactionId);

      expect(rollbackResult.status).toBe(TRANSACTION_STATES.ROLLED_BACK);
      expect(rollbackResult.backup.domain).toBe('example.com');
    });

    it('deve gerenciar múltiplas transações em paralelo', () => {
      const txn1 = beginTransaction({ type: 'update1' });
      const txn2 = beginTransaction({ type: 'update2' });
      const txn3 = beginTransaction({ type: 'update3' });

      const active = getActiveTransactions();
      expect(active.length).toBe(3);

      commitTransaction(txn1.transactionId);
      rollbackTransaction(txn2.transactionId);
      // txn3 permanece pending

      const stats = getTransactionStats();
      expect(stats.pending).toBe(1);
      expect(stats.committed).toBe(1);
      expect(stats.rolledBack).toBe(1);
    });

    it('deve manter integridade de backup em múltiplas operações', () => {
      const data1 = { type: 'create_domain', user: 'admin', domain: 'test1.com' };
      const data2 = { type: 'update_dns', user: 'reseller', domain: 'test2.com' };

      const txn1 = beginTransaction(data1);
      const txn2 = beginTransaction(data2);

      const status1 = getTransactionStatus(txn1.transactionId);
      const status2 = getTransactionStatus(txn2.transactionId);

      expect(status1.data.operationType).toBe('create_domain');
      expect(status2.data.operationType).toBe('update_dns');
    });
  });
});
