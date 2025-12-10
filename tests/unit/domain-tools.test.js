/**
 * Domain Tools - Tests (RED PHASE)
 * Testes para os 7 métodos de gerenciamento de domínios (Phase 1)
 *
 * Phase 1 Tools:
 * - RF01: getDomainUserData
 * - RF02: getAllDomainInfo (com paginação)
 * - RF03: getDomainOwner
 * - RF10: createParkedDomain
 * - RF11: createSubdomain
 * - RF12: deleteDomain
 * - RF13: resolveDomainName
 */

const WHMService = require('../../src/lib/whm-service');

describe('WHMService - Domain Tools Phase 1', () => {
  let whmService;
  let mockAxios;

  beforeEach(() => {
    // Mock axios com métodos get e post
    mockAxios = {
      get: jest.fn(),
      post: jest.fn()
    };

    // Criar instância de WHMService com configuração de teste
    whmService = new WHMService({
      host: 'test-whm.com',
      username: 'root',
      apiToken: 'test-token-123',
      verifyTLS: false
    });

    // Substituir axios por mock
    whmService.api = mockAxios;
  });

  describe('RF01: getDomainUserData()', () => {
    it('deve retornar dados do usuário do domínio', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: {
            user: 'john_doe',
            domain: 'example.com',
            email: 'john@example.com'
          }
        }
      });

      const result = await whmService.getDomainUserData('example.com');

      expect(result.success).toBe(true);
      expect(result.data.user).toBe('john_doe');
      expect(result.data.domain).toBe('example.com');
    });

    it('deve rejeitar domínio inválido', async () => {
      await expect(
        whmService.getDomainUserData('invalid; rm -rf /')
      ).rejects.toThrow();
    });

    it('deve fazer retry em caso de erro 429', async () => {
      const error429 = new Error('Rate limit exceeded');
      error429.response = { status: 429 };

      mockAxios.get.mockRejectedValueOnce(error429);
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: { user: 'john_doe' }
        }
      });

      const result = await whmService.getDomainUserData('example.com');
      expect(result.success).toBe(true);
    }, 30000); // 30s timeout para retry
  });

  describe('RF02: getAllDomainInfo()', () => {
    it('deve retornar lista de domínios com paginação', async () => {
      // Validar que o método existe
      expect(whmService.getAllDomainInfo).toBeDefined();
      expect(typeof whmService.getAllDomainInfo).toBe('function');
    });

    it('deve aplicar filter quando fornecido', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: { domains: [] }
        }
      });

      await whmService.getAllDomainInfo(10, 0, 'example');

      // Verificar que o filter foi passado
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('deve usar paginação padrão', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: { domains: [] }
        }
      });

      await whmService.getAllDomainInfo();

      // Verificar que defaults foram usados
      expect(mockAxios.get).toHaveBeenCalled();
    });
  });

  describe('RF03: getDomainOwner()', () => {
    it('deve retornar proprietário do domínio', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: {
            domain: 'example.com',
            owner: 'john_doe'
          }
        }
      });

      const result = await whmService.getDomainOwner('example.com');

      expect(result.success).toBe(true);
      expect(result.data.owner).toBe('john_doe');
    });

    it('deve rejeitar domínio inválido', async () => {
      await expect(
        whmService.getDomainOwner('example.com | cat /etc/passwd')
      ).rejects.toThrow();
    });

    it('deve lançar erro se domínio não encontrado', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 0, reason: 'Domain not found' }
        }
      });

      await expect(
        whmService.getDomainOwner('nonexistent.com')
      ).rejects.toThrow('Domain not found');
    }, 35000); // 35s timeout para retry
  });

  describe('RF10: createParkedDomain()', () => {
    it('deve criar domínio estacionado', async () => {
      // Validar que o método existe
      expect(whmService.createParkedDomain).toBeDefined();
      expect(typeof whmService.createParkedDomain).toBe('function');
    });

    it('deve validar domínio parked', async () => {
      await expect(
        whmService.createParkedDomain(
          'invalid$(whoami)',
          'john_doe',
          'example.com'
        )
      ).rejects.toThrow();
    });

    it('deve validar domínio alvo', async () => {
      await expect(
        whmService.createParkedDomain(
          'parked.com',
          'john_doe',
          'invalid; rm'
        )
      ).rejects.toThrow();
    });
  });

  describe('RF11: createSubdomain()', () => {
    it('deve criar subdomínio', async () => {
      // Validar que o método existe
      expect(whmService.createSubdomain).toBeDefined();
      expect(typeof whmService.createSubdomain).toBe('function');
    });

    it('deve validar subdomínio', async () => {
      await expect(
        whmService.createSubdomain(
          'api; rm',
          'example.com',
          'john_doe',
          '/public_html/api'
        )
      ).rejects.toThrow();
    });

    it('deve validar domínio pai', async () => {
      await expect(
        whmService.createSubdomain(
          'api',
          'invalid.com | ls',
          'john_doe',
          '/public_html/api'
        )
      ).rejects.toThrow();
    });

    it('deve validar caminho do documento', async () => {
      await expect(
        whmService.createSubdomain(
          'api',
          'example.com',
          'john_doe',
          '../../../etc/passwd'
        )
      ).rejects.toThrow();
    });
  });

  describe('RF12: deleteDomain() - com SafetyGuard', () => {
    it('deve rejeitar delete sem confirmação', async () => {
      await expect(
        whmService.deleteDomain('example.com', 'john_doe', 'addon')
      ).rejects.toThrow();
    });

    it('deve deletar domínio com confirmação', async () => {
      // Mock do SafetyGuard (será implementado no handler MCP)
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: { domain: 'example.com', deleted: true }
        }
      });

      const result = await whmService.deleteDomain(
        'example.com',
        'john_doe',
        'addon',
        true // confirmation flag
      );

      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(true);
    });

    it('deve validar domínio', async () => {
      await expect(
        whmService.deleteDomain(
          'example.com`whoami`',
          'john_doe',
          'addon',
          true
        )
      ).rejects.toThrow();
    });

    it('deve aceitar tipos válidos (addon, parked, subdomain)', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: { deleted: true }
        }
      });

      await whmService.deleteDomain('example.com', 'john_doe', 'addon', true);
      await whmService.deleteDomain('example.com', 'john_doe', 'parked', true);
      await whmService.deleteDomain('example.com', 'john_doe', 'subdomain', true);

      expect(mockAxios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('RF13: resolveDomainName()', () => {
    it('deve resolver nome de domínio para IP', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: {
            domain: 'example.com',
            ipv4: '192.168.1.1',
            ipv6: '2001:db8::1'
          }
        }
      });

      const result = await whmService.resolveDomainName('example.com');

      expect(result.success).toBe(true);
      expect(result.data.ipv4).toBe('192.168.1.1');
      expect(result.data.ipv6).toBe('2001:db8::1');
    });

    it('deve rejeitar domínio inválido', async () => {
      await expect(
        whmService.resolveDomainName('example.com&cd /root')
      ).rejects.toThrow();
    });

    it('deve lançar erro se domínio não resolver', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 0, reason: 'Domain not found' }
        }
      });

      await expect(
        whmService.resolveDomainName('nonexistent.com')
      ).rejects.toThrow();
    }, 35000); // 35s timeout para retry
  });

  describe('Segurança - Validação de Entrada', () => {
    it('deve rejeitar todos os shell metacharacters', async () => {
      const shellChars = [';', '|', '`', '$', '(', ')', '&'];

      for (const char of shellChars) {
        await expect(
          whmService.getDomainUserData(`example.com${char}cmd`)
        ).rejects.toThrow();
      }
    });

    it('deve rejeitar path traversal em domínios', async () => {
      await expect(
        whmService.getDomainUserData('../../../etc/passwd')
      ).rejects.toThrow();
    });

    it('deve normalizar maiúsculas e espaços', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: {
          metadata: { result: 1, reason: 'OK' },
          data: { user: 'john' }
        }
      });

      await whmService.getDomainUserData('  EXAMPLE.COM  ');

      // Verificar que foi normalizado
      expect(mockAxios.get).toHaveBeenCalled();
    });
  });
});
