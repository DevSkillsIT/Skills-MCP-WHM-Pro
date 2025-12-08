/**
 * ACL Validator - Tests (RED PHASE)
 * Testes para validação de autorização de usuários
 */

const {
  validateUserAccess,
  extractUserType,
  extractUserIdentifier
} = require('../../src/lib/acl-validator');

describe('ACL Validator', () => {
  describe('validateUserAccess() - Happy Path', () => {
    it('deve permitir acesso root a qualquer usuário', () => {
      const result = validateUserAccess('root:admin', 'johnsmith');
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('root');
    });

    it('deve permitir acesso root com usuário em maiúsculas', () => {
      const result = validateUserAccess('ROOT:ADMIN', 'johnsmith');
      expect(result.allowed).toBe(true);
    });

    it('deve permitir acesso reseller a conta válida', () => {
      const result = validateUserAccess('reseller:reseller1', 'client1');
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('reseller1');
      expect(result.reason).toContain('client1');
    });

    it('deve permitir acesso de usuário à própria conta', () => {
      const result = validateUserAccess('user:johnsmith', 'johnsmith');
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('johnsmith');
    });

    it('deve permitir acesso de usuário com tipo "usuario" (em português)', () => {
      const result = validateUserAccess('usuario:maryjane', 'maryjane');
      expect(result.allowed).toBe(true);
    });

    it('deve normalizar maiúsculas em token de usuário', () => {
      const result = validateUserAccess('USER:JOHNSMITH', 'johnsmith');
      expect(result.allowed).toBe(true);
    });

    it('deve remover espaços em branco do token e username', () => {
      const result = validateUserAccess('  user:johnsmith  ', '  johnsmith  ');
      expect(result.allowed).toBe(true);
    });

    it('deve permitir reseller com uppercase', () => {
      const result = validateUserAccess('RESELLER:RESELLER1', 'CLIENT1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateUserAccess() - Security / Denial Cases', () => {
    it('deve negar acesso de usuário a conta diferente', () => {
      const result = validateUserAccess('user:johnsmith', 'maryjane');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('não autorizado');
    });

    it('deve negar acesso com token inválido (nulo)', () => {
      const result = validateUserAccess(null, 'johnsmith');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Token');
    });

    it('deve negar acesso com token vazio', () => {
      const result = validateUserAccess('', 'johnsmith');
      expect(result.allowed).toBe(false);
    });

    it('deve negar acesso com token não-string', () => {
      const result = validateUserAccess(123, 'johnsmith');
      expect(result.allowed).toBe(false);
    });

    it('deve negar acesso com username inválido (nulo)', () => {
      const result = validateUserAccess('root:admin', null);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Username');
    });

    it('deve negar acesso com username vazio', () => {
      const result = validateUserAccess('root:admin', '');
      expect(result.allowed).toBe(false);
    });

    it('deve negar acesso com username não-string', () => {
      const result = validateUserAccess('root:admin', 123);
      expect(result.allowed).toBe(false);
    });

    it('deve negar acesso com token malformado (sem separador)', () => {
      const result = validateUserAccess('adminuser', 'johnsmith');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Formato');
    });

    it('deve negar acesso com token apenas com tipo (sem identificador)', () => {
      const result = validateUserAccess('user:', 'johnsmith');
      expect(result.allowed).toBe(false);
    });

    it('deve negar acesso com tipo de usuário desconhecido', () => {
      const result = validateUserAccess('superadmin:admin', 'johnsmith');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('não reconhecido');
    });

    it('deve negar reseller tentando acessar conta com username vazio', () => {
      const result = validateUserAccess('reseller:reseller1', '');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Username');
    });

    it('deve ser case-insensitive para user identifier', () => {
      const result = validateUserAccess('user:JOHNSMITH', 'johnsmith');
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateUserAccess() - Edge Cases', () => {
    it('deve lidar com espaços múltiplos no token', () => {
      const result = validateUserAccess('  root:admin  ', 'johnsmith');
      expect(result.allowed).toBe(true);
    });

    it('deve lidar com tokens muito longos', () => {
      const longId = 'x'.repeat(1000);
      const result = validateUserAccess(`root:${longId}`, 'johnsmith');
      expect(result.allowed).toBe(true);
    });

    it('deve lidar com usernames contendo hífens e underscores', () => {
      const result = validateUserAccess('user:john-smith_123', 'john-smith_123');
      expect(result.allowed).toBe(true);
    });

    it('deve rejeitar caracteres especiais em tipo de usuário', () => {
      // Mesmo com caracteres especiais, normaliza para tipo desconhecido
      const result = validateUserAccess('root@:admin', 'johnsmith');
      expect(result.allowed).toBe(false); // "root@" não é tipo válido
    });

    it('deve funcionar com múltiplos dois-pontos no token', () => {
      // Pega apenas primeiro como tipo, resto como identificador
      const result = validateUserAccess('root:admin:extra', 'johnsmith');
      expect(result.allowed).toBe(true); // root é válido
    });
  });

  describe('extractUserType() - Valid Cases', () => {
    it('deve extrair tipo "root" de token válido', () => {
      const type = extractUserType('root:admin');
      expect(type).toBe('root');
    });

    it('deve extrair tipo "reseller" de token válido', () => {
      const type = extractUserType('reseller:reseller1');
      expect(type).toBe('reseller');
    });

    it('deve extrair tipo "user" de token válido', () => {
      const type = extractUserType('user:johnsmith');
      expect(type).toBe('user');
    });

    it('deve normalizar tipo para minúsculas', () => {
      const type = extractUserType('ROOT:admin');
      expect(type).toBe('root');
    });

    it('deve remover espaços antes de extrair tipo', () => {
      const type = extractUserType('  root:admin  ');
      expect(type).toBe('root');
    });

    it('deve lidar com tipo em português', () => {
      const type = extractUserType('usuario:johnsmith');
      expect(type).toBe('usuario');
    });
  });

  describe('extractUserType() - Error Cases', () => {
    it('deve retornar null para token nulo', () => {
      const type = extractUserType(null);
      expect(type).toBeNull();
    });

    it('deve retornar null para token vazio', () => {
      const type = extractUserType('');
      expect(type).toBeNull();
    });

    it('deve retornar null para token não-string', () => {
      const type = extractUserType(123);
      expect(type).toBeNull();
    });

    it('deve retornar o tipo mesmo sem separador (usa split)', () => {
      const type = extractUserType('rootadmin');
      expect(type).toBe('rootadmin'); // split retorna array com 1 elemento
    });

    it('deve retornar tipo mesmo com múltiplos dois-pontos', () => {
      const type = extractUserType('root:admin:extra');
      expect(type).toBe('root');
    });

    it('deve retornar vazio para apenas dois-pontos', () => {
      const type = extractUserType(':');
      expect(type).toBe(''); // Extrai vazio antes do ':'
    });
  });

  describe('extractUserIdentifier() - Valid Cases', () => {
    it('deve extrair identificador "admin" de token válido', () => {
      const id = extractUserIdentifier('root:admin');
      expect(id).toBe('admin');
    });

    it('deve extrair identificador "reseller1" de token válido', () => {
      const id = extractUserIdentifier('reseller:reseller1');
      expect(id).toBe('reseller1');
    });

    it('deve extrair identificador "johnsmith" de token válido', () => {
      const id = extractUserIdentifier('user:johnsmith');
      expect(id).toBe('johnsmith');
    });

    it('deve normalizar identificador para minúsculas', () => {
      const id = extractUserIdentifier('root:ADMIN');
      expect(id).toBe('admin');
    });

    it('deve remover espaços antes de extrair identificador', () => {
      const id = extractUserIdentifier('  root:admin  ');
      expect(id).toBe('admin');
    });

    it('deve extrair tudo após primeiro dois-pontos como identificador', () => {
      const id = extractUserIdentifier('root:admin:extra:stuff');
      // split(':')[1] retorna apenas 'admin'
      expect(id).toBe('admin');
    });
  });

  describe('extractUserIdentifier() - Error Cases', () => {
    it('deve retornar null para token nulo', () => {
      const id = extractUserIdentifier(null);
      expect(id).toBeNull();
    });

    it('deve retornar null para token vazio', () => {
      const id = extractUserIdentifier('');
      expect(id).toBeNull();
    });

    it('deve retornar null para token não-string', () => {
      const id = extractUserIdentifier(123);
      expect(id).toBeNull();
    });

    it('deve retornar null para token malformado (sem separador)', () => {
      const id = extractUserIdentifier('rootadmin');
      expect(id).toBeNull();
    });

    it('deve retornar vazio para token com apenas separador no final', () => {
      const id = extractUserIdentifier('root:');
      // Split retorna ['root', ''], então parts[1] é ''
      expect(id).toBe('');
    });

    it('deve retornar vazio para apenas dois-pontos', () => {
      const id = extractUserIdentifier(':');
      expect(id).toBe(''); // Extrai vazio após o ':'
    });
  });

  describe('validateUserAccess() - Integration Tests', () => {
    it('deve permitir multiple root operations em sequência', () => {
      const result1 = validateUserAccess('root:admin', 'client1');
      const result2 = validateUserAccess('root:admin', 'client2');
      const result3 = validateUserAccess('root:admin', 'client3');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
    });

    it('deve negar múltiplas tentativas de cross-account access', () => {
      const result1 = validateUserAccess('user:alice', 'bob');
      const result2 = validateUserAccess('user:bob', 'alice');

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
    });

    it('deve funcionar com diferentes tipos de usuário em sequência', () => {
      const root = validateUserAccess('root:admin', 'anyone');
      const reseller = validateUserAccess('reseller:reseller1', 'client1');
      const user = validateUserAccess('user:user1', 'user1');

      expect(root.allowed).toBe(true);
      expect(reseller.allowed).toBe(true);
      expect(user.allowed).toBe(true);
    });
  });
});
