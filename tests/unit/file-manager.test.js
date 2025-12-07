/**
 * File Manager - Path Validation Tests
 * Testes unitários para BUG-CRIT-01
 */

const FileManager = require('../../src/lib/file-manager');
const { validatePath } = require('../../src/lib/file-manager');

describe('FileManager - Path Validation', () => {
  let fileManager;

  beforeEach(() => {
    fileManager = new FileManager({
      host: 'test-host.com',
      username: 'root',
      apiToken: 'test-token',
      verifyTLS: false
    });
  });

  describe('Directory Traversal Prevention', () => {
    it('deve bloquear path traversal com ../', () => {
      const result = validatePath('../../../etc/passwd', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Directory traversal');
    });

    it('deve bloquear path traversal normalizado', () => {
      // Caso crítico: /home/user/../../tmp/secret → /tmp/secret
      const result = validatePath('/home/testuser/../../tmp/secret', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Directory traversal');
    });

    it('deve bloquear acesso a /etc/shadow', () => {
      const result = validatePath('/etc/shadow', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('forbidden');
    });

    it('deve bloquear acesso a /etc/passwd', () => {
      const result = validatePath('/etc/passwd', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('forbidden');
    });

    it('deve bloquear acesso a /root', () => {
      const result = validatePath('/root/.ssh/id_rsa', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('forbidden');
    });

    it('deve bloquear acesso a /.env', () => {
      const result = validatePath('/.env', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('forbidden');
    });

    it('deve bloquear acesso a /proc', () => {
      const result = validatePath('/proc/self/environ', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('forbidden');
    });

    it('deve permitir path válido dentro de /home/user', () => {
      const result = validatePath('public_html/index.html', 'testuser');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/testuser/public_html/index.html');
    });

    it('deve permitir path absoluto válido dentro de /home/user', () => {
      const result = validatePath('/home/testuser/public_html/style.css', 'testuser');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/testuser/public_html/style.css');
    });

    it('deve rejeitar nome de arquivo com caracteres inválidos (;)', () => {
      const result = validatePath('file;rm -rf /', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid filename');
    });

    it('deve rejeitar nome de arquivo com caracteres inválidos (&)', () => {
      const result = validatePath('file&whoami', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid filename');
    });

    it('deve rejeitar nome de arquivo com caracteres inválidos ($)', () => {
      const result = validatePath('file$injected', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid filename');
    });

    it('deve permitir nome de arquivo válido com ponto', () => {
      const result = validatePath('config.json', 'testuser');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/testuser/config.json');
    });

    it('deve permitir nome de arquivo válido com traço', () => {
      const result = validatePath('my-file.txt', 'testuser');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/testuser/my-file.txt');
    });

    it('deve permitir nome de arquivo válido com underscore', () => {
      const result = validatePath('my_file.txt', 'testuser');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/testuser/my_file.txt');
    });
  });

  describe('Edge Cases', () => {
    it('deve bloquear tentativa de escapar com links simbólicos simulados', () => {
      // Tentar simular /home/testuser/../../../etc/passwd
      const result = validatePath('../otheruser/../../etc/passwd', 'testuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Directory traversal');
    });

    it('deve permitir diretório base do usuário', () => {
      const result = validatePath('', 'testuser');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/testuser');
    });

    it('deve permitir ponto (diretório atual) dentro de base', () => {
      const result = validatePath('./index.html', 'testuser');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/testuser/index.html');
    });
  });
});
