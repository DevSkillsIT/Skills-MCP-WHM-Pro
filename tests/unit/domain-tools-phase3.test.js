/**
 * Domain Tools - Phase 3 (DNS / NSEC3 / System)
 * Cobertura para RF14-RF22 e RNF06 idempotência MX
 */

jest.mock('../../src/lib/nsec3-async-handler', () => ({
  startAsyncOperation: jest.fn(() => ({ operationId: 'op-nsec3' })),
  getOperationStatus: jest.fn(() => ({ status: 'queued', progress: 0 })),
  updateOperationProgress: jest.fn(),
  failOperation: jest.fn()
}));

jest.mock('../../src/lib/lock-manager', () => ({
  acquireLock: jest.fn(() => ({ acquired: true })),
  releaseLock: jest.fn(() => ({ released: true }))
}));

jest.mock('../../src/lib/transaction-log', () => ({
  beginTransaction: jest.fn(() => ({ transactionId: 'txn-1' })),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn()
}));

const nsec3Handler = require('../../src/lib/nsec3-async-handler');
const lockManager = require('../../src/lib/lock-manager');
const WHMService = require('../../src/lib/whm-service');

describe('WHMService - Domain Tools Phase 3', () => {
  let whmService;
  let mockAxios;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
      post: jest.fn()
    };

    whmService = new WHMService({
      host: 'test-whm.com',
      username: 'root',
      apiToken: 'test-token-123',
      verifyTLS: false
    });

    whmService.api = mockAxios;
  });

  describe('RF14: hasLocalAuthority()', () => {
    it('deve validar domínio', async () => {
      await expect(whmService.hasLocalAuthority('bad domain')).rejects.toThrow();
    });
  });

  describe('RF15: listMXRecords()', () => {
    it('deve validar domínio', async () => {
      await expect(whmService.listMXRecords('invalid;rm')).rejects.toThrow();
    });
  });

  describe('RF16: saveMXRecord() idempotência', () => {
    it('deve retornar idempotent=true se MX já existe', async () => {
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: [{ exchange: 'mail.example.com', priority: 10 }]
        }
      });

      const result = await whmService.saveMXRecord('example.com', 'mail.example.com', 10, false);
      expect(result.idempotent).toBe(true);
    });
  });

  describe('RF17: getDSRecords()', () => {
    it('deve falhar para array vazio', async () => {
      await expect(whmService.getDSRecords([])).rejects.toThrow();
    });
  });

  describe('RF18: isAliasAvailable()', () => {
    it('deve falhar para zona inválida', async () => {
      await expect(whmService.isAliasAvailable('bad zone', 'www')).rejects.toThrow();
    });
  });

  describe('RF19: setNSEC3ForDomains()', () => {
    it('deve registrar operação assíncrona e retornar operation_id', async () => {
      const result = await whmService.setNSEC3ForDomains(['example.com']);
      expect(nsec3Handler.startAsyncOperation).toHaveBeenCalled();
      expect(result.operation_id).toBe('op-nsec3');
    });
  });

  describe('RF20: unsetNSEC3ForDomains()', () => {
    it('deve registrar operação assíncrona e retornar operation_id', async () => {
      const result = await whmService.unsetNSEC3ForDomains(['example.com']);
      expect(nsec3Handler.startAsyncOperation).toHaveBeenCalled();
      expect(result.operation_id).toBe('op-nsec3');
    });
  });

  describe('RF21: updateUserdomains()', () => {
    it('deve retornar erro 409 quando lock não adquirido', async () => {
      lockManager.acquireLock.mockReturnValueOnce({ acquired: false, error: 'busy' });
      await expect(whmService.updateUserdomains()).rejects.toThrow(/busy/i);
    });
  });

  describe('RF22: getNsec3Status()', () => {
    it('deve lançar erro para operation_id inválido', async () => {
      nsec3Handler.getOperationStatus.mockReturnValueOnce({ error: 'Operação não encontrada' });
      await expect(whmService.getNsec3Status('invalid')).rejects.toThrow(/não encontrada/i);
    });
  });
});
