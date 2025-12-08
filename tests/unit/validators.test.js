/**
 * Validators - Tests (RED PHASE)
 * Testes para validação de domínios e segurança contra LDAP/shell injection
 */

const { validateDomain, validateSubdomain, sanitizeDomain } = require('../../src/lib/validators');

describe('Domain Validators', () => {
  describe('validateDomain() - Valid Domains', () => {
    it('deve validar dominio simples', () => {
      const result = validateDomain('example.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('example.com');
      expect(result.error).toBe(null);
    });

    it('deve validar dominio com subdominio', () => {
      const result = validateDomain('sub.example.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('sub.example.com');
    });

    it('deve validar dominio com multiplos niveis', () => {
      const result = validateDomain('example.com.br');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('example.com.br');
    });

    it('deve validar dominio com numeros', () => {
      const result = validateDomain('api123.example.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('api123.example.com');
    });

    it('deve validar dominio com hifens', () => {
      const result = validateDomain('my-domain.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('my-domain.com');
    });

    it('deve normalizar maiusculas para minusculas', () => {
      const result = validateDomain('Example.COM');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('example.com');
    });

    it('deve remover espacos em branco', () => {
      const result = validateDomain('  example.com  ');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('example.com');
    });

    it('deve validar dominio maximo 255 caracteres', () => {
      const longDomain = 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.com';
      const result = validateDomain(longDomain);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateDomain() - Invalid Domains', () => {
    it('deve rejeitar dominio vazio', () => {
      const result = validateDomain('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('vazio');
    });

    it('deve rejeitar null/undefined', () => {
      expect(validateDomain(null).isValid).toBe(false);
      expect(validateDomain(undefined).isValid).toBe(false);
    });

    it('deve rejeitar dominio com espacos internos', () => {
      const result = validateDomain('example .com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('caracteres inválidos');
    });

    it('deve rejeitar dominio com semicolon (shell injection)', () => {
      const result = validateDomain('example.com; rm -rf /');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('deve rejeitar dominio com pipe (shell injection)', () => {
      const result = validateDomain('example.com | cat /etc/passwd');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('deve rejeitar dominio com backtick (shell injection)', () => {
      const result = validateDomain('example.com`whoami`');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('deve rejeitar dominio com dollar (shell injection)', () => {
      const result = validateDomain('example.com$(whoami)');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('deve rejeitar dominio com parenteses (shell injection)', () => {
      const result = validateDomain('example.com()(whoami)');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('deve rejeitar dominio com ampersand (shell injection)', () => {
      const result = validateDomain('example.com&cd /root');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('deve rejeitar dominio com backslash (LDAP injection)', () => {
      const result = validateDomain('example.com\\admin');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('caracteres inválidos');
    });

    it('deve rejeitar dominio com asterisco (LDAP injection)', () => {
      const result = validateDomain('*');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('caracteres inválidos');
    });

    it('deve rejeitar dominio com path traversal (..)', () => {
      const result = validateDomain('../../../etc/passwd');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('caracteres inválidos');
    });

    it('deve rejeitar dominio iniciando com hifen', () => {
      const result = validateDomain('-example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('não podem começar ou terminar com hífen');
    });

    it('deve rejeitar dominio terminando com hifen', () => {
      const result = validateDomain('example-.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('não podem começar ou terminar com hífen');
    });

    it('deve rejeitar dominio com underscore', () => {
      const result = validateDomain('example_test.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('caracteres inválidos');
    });

    it('deve rejeitar dominio acima de 255 caracteres', () => {
      const tooLongDomain = 'a'.repeat(256) + '.com';
      const result = validateDomain(tooLongDomain);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('255');
    });

    it('deve rejeitar label com mais de 63 caracteres', () => {
      const tooLongLabel = 'a'.repeat(64) + '.com';
      const result = validateDomain(tooLongLabel);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('63');
    });

    it('deve rejeitar dominio sem ponto', () => {
      const result = validateDomain('localhost');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('extensão de domínio');
    });

    it('deve rejeitar dominio com multiplos pontos consecutivos', () => {
      const result = validateDomain('example..com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('pontos consecutivos');
    });

    it('deve rejeitar dominio iniciando com ponto', () => {
      const result = validateDomain('.example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('não pode começar ou terminar com ponto');
    });

    it('deve rejeitar dominio terminando com ponto (sem ser FQDN)', () => {
      // Dominio FQDN terminando com ponto é válido em alguns contextos
      // Mas nosso validador rejeita para simplicidade
      const result = validateDomain('example.com.');
      expect(result.isValid).toBe(false);
    });

    it('deve rejeitar dominio com caracteres especiais', () => {
      const result = validateDomain('example#.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('caracteres inválidos');
    });

    it('deve rejeitar dominio com @ (LDAP injection)', () => {
      const result = validateDomain('admin@example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('caracteres inválidos');
    });
  });

  describe('validateSubdomain() - Valid Subdomains', () => {
    it('deve validar subdominio simples', () => {
      const result = validateSubdomain('www', 'example.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('www');
    });

    it('deve validar subdominio com numeros', () => {
      const result = validateSubdomain('api123', 'example.com');
      expect(result.isValid).toBe(true);
    });

    it('deve validar subdominio com hifens', () => {
      const result = validateSubdomain('my-api', 'example.com');
      expect(result.isValid).toBe(true);
    });

    it('deve normalizar maiusculas', () => {
      const result = validateSubdomain('API', 'example.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('api');
    });

    it('deve remover espacos', () => {
      const result = validateSubdomain('  api  ', 'example.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('api');
    });
  });

  describe('validateSubdomain() - Invalid Subdomains', () => {
    it('deve rejeitar subdominio vazio', () => {
      const result = validateSubdomain('', 'example.com');
      expect(result.isValid).toBe(false);
    });

    it('deve rejeitar dominio pai invalido', () => {
      const result = validateSubdomain('www', 'invalid');
      expect(result.isValid).toBe(false);
    });

    it('deve rejeitar subdominio com shell metacharacters', () => {
      const result = validateSubdomain('api; rm -rf', 'example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('deve rejeitar subdominio iniciando com hifen', () => {
      const result = validateSubdomain('-api', 'example.com');
      expect(result.isValid).toBe(false);
    });

    it('deve rejeitar subdominio terminando com hifen', () => {
      const result = validateSubdomain('api-', 'example.com');
      expect(result.isValid).toBe(false);
    });
  });

  describe('sanitizeDomain() - Sanitization', () => {
    it('deve remover espacos e normalizar maiusculas', () => {
      const result = sanitizeDomain('  Example.COM  ');
      expect(result).toBe('example.com');
    });

    it('deve lidar com null gracefully', () => {
      const result = sanitizeDomain(null);
      expect(result).toBe('');
    });

    it('deve lidar com undefined gracefully', () => {
      const result = sanitizeDomain(undefined);
      expect(result).toBe('');
    });
  });
});
