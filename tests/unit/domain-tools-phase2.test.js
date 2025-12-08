/**
 * Domain Tools - Phase 2 (Addon Domains)
 * Cobertura para RF04-RF09 conforme GAP-CRIT-03 (cobertura mínima)
 */

jest.mock('../../src/lib/nsec3-async-handler', () => ({
  startAsyncOperation: jest.fn(() => ({ operationId: 'op-1' })),
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

const WHMService = require('../../src/lib/whm-service');

describe('WHMService - Domain Tools Phase 2 (Addon Domains)', () => {
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

  describe('RF04: listAddonDomains()', () => {
    it('deve listar addon domains do usuário', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: { metadata: { result: 1 }, data: [{ domain: 'addon.com' }] }
      });

      const result = await whmService.listAddonDomains('user1');
      expect(result.success).toBe(true);
      expect(result.data[0].domain).toBe('addon.com');
    });

    it('deve falhar se username ausente', async () => {
      await expect(whmService.listAddonDomains('')).rejects.toThrow();
    });
  });

  describe('RF05: getAddonDomainDetails()', () => {
    it('deve rejeitar domínio inválido', async () => {
      await expect(
        whmService.getAddonDomainDetails('invalid;rm', 'user1')
      ).rejects.toThrow();
    });
  });

  describe('RF06: getConversionStatus()', () => {
    it('deve exigir conversion_id', async () => {
      await expect(whmService.getConversionStatus('')).rejects.toThrow();
    });
  });

  describe('RF07: initiateAddonConversion()', () => {
    it('deve iniciar conversão com parâmetros válidos', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { metadata: { result: 1 }, data: { conversion_id: 'conv-1' } }
      });

      const result = await whmService.initiateAddonConversion({
        domain: 'example.com',
        username: 'user1',
        new_username: 'newuser',
        reason: 'Migration'
      });

      expect(result.success).toBe(true);
      expect(mockAxios.post).toHaveBeenCalled();
    });
  });

  describe('RF08: getConversionDetails()', () => {
    it('deve exigir conversion_id', async () => {
      await expect(whmService.getConversionDetails(null)).rejects.toThrow();
    });
  });

  describe('RF09: listConversions()', () => {
    it('deve retornar lista de conversões', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: { metadata: { result: 1 }, data: [{ conversion_id: 'conv-1' }] }
      });

      const result = await whmService.listConversions();
      expect(result.success).toBe(true);
      expect(result.data[0].conversion_id).toBe('conv-1');
    });
  });
});
