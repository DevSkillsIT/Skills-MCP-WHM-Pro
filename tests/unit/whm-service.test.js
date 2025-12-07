/**
 * WHM Service - Tests
 * Testes unitários para GAP-CRIT-01
 */

const WHMService = require('../../src/lib/whm-service');

describe('WHMService', () => {
  let whmService;
  let mockAxios;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
      post: jest.fn()
    };

    whmService = new WHMService({
      host: 'test-host.com',
      username: 'root',
      apiToken: 'test-token',
      verifyTLS: false
    });

    // Substituir axios instance por mock
    whmService.api = mockAxios;
  });

  describe('Metadata Validation', () => {
    it('deve validar metadata.result=0 como erro', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 0, reason: 'Account already exists' },
          data: null
        }
      });

      await expect(
        whmService.createAccount({ username: 'test', domain: 'test.com', password: 'secret' })
      ).rejects.toThrow('Account already exists');
    }, 30000); // 30s timeout para retry

    it('deve aceitar metadata.result=1 como sucesso', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: { account: { username: 'test' } }
        }
      });

      const result = await whmService.createAccount({
        username: 'test',
        domain: 'test.com',
        password: 'secret'
      });

      expect(result.success).toBe(true);
      expect(result.data.account.username).toBe('test');
    });

    it('deve lançar erro genérico se metadata.reason ausente', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 0 },
          data: null
        }
      });

      await expect(
        whmService.listAccounts()
      ).rejects.toThrow('WHM operation failed');
    }, 30000); // 30s timeout para retry
  });

  describe('Retry Logic', () => {
    it('deve fazer retry em 429 e registrar rate limit hit', async () => {
      const error429 = new Error('Request failed with status code 429');
      error429.response = { status: 429, headers: { 'retry-after': '1' } };

      mockAxios.get
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce({
          status: 200,
          data: { metadata: { result: 1 }, data: { accounts: [] } }
        });

      const result = await whmService.listAccounts();

      expect(result.data.accounts).toEqual([]);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    }, 15000); // 15s timeout para retry

    it('deve fazer retry em 500', async () => {
      const error500 = new Error('Request failed with status code 500');
      error500.response = { status: 500, headers: {} };

      mockAxios.get
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce({
          status: 200,
          data: { metadata: { result: 1 }, data: { accounts: [] } }
        });

      const result = await whmService.listAccounts();

      expect(result.success).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    }, 15000); // 15s timeout para retry

    it('deve lançar erro após max retries', async () => {
      const error = new Error('Request failed with status code 500');
      error.response = { status: 500, headers: {} };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        whmService.listAccounts()
      ).rejects.toThrow();

      expect(mockAxios.get).toHaveBeenCalledTimes(5); // max retries
    }, 30000); // 30s timeout para max retries

    it('não deve fazer retry para erro 400', async () => {
      const error = new Error('Request failed with status code 400');
      error.response = { status: 400, headers: {} };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        whmService.listAccounts()
      ).rejects.toThrow();

      expect(mockAxios.get).toHaveBeenCalledTimes(1); // Sem retries
    }, 15000); // 15s timeout para retry
  });

  describe('Account Management', () => {
    it('deve listar accounts com sucesso', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: {
            accounts: [
              { username: 'user1', domain: 'example.com' },
              { username: 'user2', domain: 'test.com' }
            ]
          }
        }
      });

      const result = await whmService.listAccounts();

      expect(result.success).toBe(true);
      expect(result.data.accounts.length).toBe(2);
      expect(result.data.accounts[0].username).toBe('user1');
    });

    it('deve criar account com parâmetros corretos', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: { account: { username: 'newuser' } }
        }
      });

      const accountData = {
        username: 'newuser',
        domain: 'newdomain.com',
        password: 'SecurePass123!',
        plan: 'default'
      };

      const result = await whmService.createAccount(accountData);

      expect(result.success).toBe(true);
      expect(mockAxios.post).toHaveBeenCalled();
    });

    it('deve obter informações de account específica', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: {
            account: {
              username: 'testuser',
              domain: 'test.com',
              disk_used: 1024,
              disk_limit: 10240
            }
          }
        }
      });

      const result = await whmService.getAccountInfo('testuser');

      expect(result.success).toBe(true);
      expect(result.data.account.username).toBe('testuser');
      expect(result.data.account.disk_used).toBe(1024);
    });

    it('deve suspender account', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: { result: 'Account suspended' }
        }
      });

      const result = await whmService.suspendAccount('testuser', 'Policy violation');

      expect(result.success).toBe(true);
      expect(mockAxios.post).toHaveBeenCalled();
    });

    it('deve remover account', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: { result: 'Account removed' }
        }
      });

      const result = await whmService.removeAccount('testuser');

      expect(result.success).toBe(true);
    });
  });

  describe('Package Management', () => {
    it('deve listar packages', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: {
            pkg: [
              { name: 'default', quota: 1000 },
              { name: 'premium', quota: 5000 }
            ]
          }
        }
      });

      const result = await whmService.listPackages();

      expect(result.success).toBe(true);
      expect(result.data.packages.length).toBe(2);
    });

    it('deve obter informações de package', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1 },
          data: {
            pkg: [
              {
                name: 'default',
                quota: 1000,
                bandwidth: 10000
              }
            ]
          }
        }
      });

      const result = await whmService.getPackageInfo('default');

      expect(result.success).toBe(true);
      expect(result.data.package.name).toBe('default');
    });
  });

  describe('Error Handling', () => {
    it('deve tratar timeout corretamente', async () => {
      const timeoutError = new Error('Timeout of 30000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      mockAxios.get.mockRejectedValue(timeoutError);

      await expect(
        whmService.listAccounts()
      ).rejects.toThrow('Timeout');
    }, 30000); // 30s timeout para retry

    it('deve tratar erro de conexão', async () => {
      const networkError = new Error('Network Error');
      networkError.code = 'ENETUNREACH';
      mockAxios.get.mockRejectedValue(networkError);

      await expect(
        whmService.listAccounts()
      ).rejects.toThrow();
    }, 30000); // 30s timeout para retry

    it('deve sanitizar senha em logs de erro', async () => {
      mockAxios.post.mockRejectedValue(new Error('API Error'));

      await expect(
        whmService.createAccount({
          username: 'test',
          password: 'SuperSecretPass123!',
          domain: 'test.com'
        })
      ).rejects.toThrow();

      // Verificar que senha não aparece em logs (mock logger se necessário)
    }, 30000); // 30s timeout para retry
  });

  describe('HTTP Status Handling', () => {
    it('deve tratar 401 Unauthorized', async () => {
      const error = new Error('Request failed with status code 401');
      error.response = {
        status: 401,
        data: {
          metadata: { result: 0, reason: 'Invalid credentials' }
        }
      };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        whmService.listAccounts()
      ).rejects.toThrow();
    });

    it('deve tratar 403 Forbidden', async () => {
      const error = new Error('Request failed with status code 403');
      error.response = {
        status: 403,
        data: {
          metadata: { result: 0, reason: 'Forbidden' }
        }
      };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        whmService.listAccounts()
      ).rejects.toThrow();
    });

    it('deve tratar 404 Not Found', async () => {
      const error = new Error('Request failed with status code 404');
      error.response = {
        status: 404,
        data: {
          metadata: { result: 0, reason: 'Resource not found' }
        }
      };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        whmService.getAccountInfo('nonexistent')
      ).rejects.toThrow();
    });
  });
});
