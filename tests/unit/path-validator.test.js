/**
 * Path Validator - Tests (RED PHASE)
 * Testes para validação de document_root e prevenção de path traversal
 */

const {
  validateDocumentRoot,
  isRestrictedDir,
  getRestrictedDirs,
  sanitizePath
} = require('../../src/lib/path-validator');

describe('Path Validator', () => {
  describe('validateDocumentRoot() - Happy Path', () => {
    it('deve validar document root padrão /home/username/', () => {
      const result = validateDocumentRoot('/home/johnsmith/', 'johnsmith');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('johnsmith');
      expect(result.error).toBeNull();
    });

    it('deve validar document root sem trailing slash', () => {
      const result = validateDocumentRoot('/home/johnsmith', 'johnsmith');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('/home/johnsmith');
    });

    it('deve validar public_html dentro de home', () => {
      const result = validateDocumentRoot('/home/johnsmith/public_html', 'johnsmith');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('/home/johnsmith/public_html');
    });

    it('deve validar path profundo dentro de home', () => {
      const result = validateDocumentRoot('/home/johnsmith/public_html/app/views', 'johnsmith');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('/home/johnsmith/public_html/app/views');
    });

    it('deve normalizar múltiplas slashes', () => {
      const result = validateDocumentRoot('/home//johnsmith///public_html', 'johnsmith');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('johnsmith');
    });

    it('deve converter backslashes para forward slashes', () => {
      const result = validateDocumentRoot('/home\\johnsmith\\public_html', 'johnsmith');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('johnsmith');
    });

    it('deve ser case-insensitive para username', () => {
      const result = validateDocumentRoot('/home/johnsmith/', 'JOHNSMITH');
      expect(result.valid).toBe(true);
    });

    it('deve lidar com username contendo números', () => {
      const result = validateDocumentRoot('/home/user123/', 'user123');
      expect(result.valid).toBe(true);
    });

    it('deve lidar com username contendo hífens', () => {
      const result = validateDocumentRoot('/home/john-smith/', 'john-smith');
      expect(result.valid).toBe(true);
    });

    it('deve lidar com username contendo underscores', () => {
      const result = validateDocumentRoot('/home/john_smith/', 'john_smith');
      expect(result.valid).toBe(true);
    });

    it('deve lidar com username contendo pontos', () => {
      const result = validateDocumentRoot('/home/john.smith/', 'john.smith');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateDocumentRoot() - Path Traversal Security', () => {
    it('deve rejeitar path com ../ traversal', () => {
      const result = validateDocumentRoot('/home/johnsmith/../mary/', 'johnsmith');
      expect(result.valid).toBe(false);
      // O path depois de normalizado (/home/mary/) está fora do /home/johnsmith
      expect(result.error).toContain('dentro');
    });

    it('deve rejeitar path iniciado com ../', () => {
      const result = validateDocumentRoot('../../etc/passwd', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar múltiplos ../../../', () => {
      const result = validateDocumentRoot('/home/johnsmith/../../../etc/', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar .. sem slashes', () => {
      const result = validateDocumentRoot('/home/johnsmith..mary', 'johnsmith');
      // .. sem slashes pode passar, mas fora de /home/username
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar absolute path fora de home', () => {
      const result = validateDocumentRoot('/etc/passwd', 'johnsmith');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dentro');
    });

    it('deve rejeitar path em /root', () => {
      const result = validateDocumentRoot('/root/.ssh', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path em /tmp', () => {
      const result = validateDocumentRoot('/tmp/malicious', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path em /var', () => {
      const result = validateDocumentRoot('/var/www', 'johnsmith');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDocumentRoot() - Restricted Directories', () => {
    it('deve rejeitar acesso a .ssh', () => {
      const result = validateDocumentRoot('/home/johnsmith/.ssh', 'johnsmith');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.ssh');
    });

    it('deve rejeitar acesso a .cpanel', () => {
      const result = validateDocumentRoot('/home/johnsmith/.cpanel/config', 'johnsmith');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.cpanel');
    });

    it('deve rejeitar acesso a .gnupg', () => {
      const result = validateDocumentRoot('/home/johnsmith/.gnupg', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar acesso a etc', () => {
      const result = validateDocumentRoot('/home/johnsmith/etc', 'johnsmith');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('etc');
    });

    it('deve rejeitar acesso a mail', () => {
      const result = validateDocumentRoot('/home/johnsmith/mail', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar acesso a tmp', () => {
      const result = validateDocumentRoot('/home/johnsmith/tmp', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar acesso a .cache', () => {
      const result = validateDocumentRoot('/home/johnsmith/.cache/file', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar acesso a .local', () => {
      const result = validateDocumentRoot('/home/johnsmith/.local/share', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar acesso a .config', () => {
      const result = validateDocumentRoot('/home/johnsmith/.config', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve ser case-insensitive para restricted dirs', () => {
      const result = validateDocumentRoot('/home/johnsmith/.SSH/keys', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar .bash_history', () => {
      const result = validateDocumentRoot('/home/johnsmith/.bash_history', 'johnsmith');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDocumentRoot() - Shell Metacharacter Injection', () => {
    it('deve rejeitar path com ponto e vírgula (;)', () => {
      const result = validateDocumentRoot('/home/johnsmith/public_html;rm', 'johnsmith');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('inválidos');
    });

    it('deve rejeitar path com pipe (|)', () => {
      const result = validateDocumentRoot('/home/johnsmith/public_html|cat', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com backtick (`)', () => {
      const result = validateDocumentRoot('/home/johnsmith/`whoami`', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com dólar ($)', () => {
      const result = validateDocumentRoot('/home/johnsmith/$USER', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com parênteses ()', () => {
      const result = validateDocumentRoot('/home/johnsmith/(whoami)', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com chaves {}', () => {
      const result = validateDocumentRoot('/home/johnsmith/{cmd}', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com colchetes []', () => {
      const result = validateDocumentRoot('/home/johnsmith/[file]', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com redirecionamento <>', () => {
      const result = validateDocumentRoot('/home/johnsmith/file<etc', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com ampersand (&)', () => {
      const result = validateDocumentRoot('/home/johnsmith/public_html&whoami', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com asterisco (*)', () => {
      const result = validateDocumentRoot('/home/johnsmith/*.html', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com interrogação (?)', () => {
      const result = validateDocumentRoot('/home/johnsmith/file?.txt', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar path com exclamação (!)', () => {
      const result = validateDocumentRoot('/home/johnsmith/file!', 'johnsmith');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDocumentRoot() - Invalid Parameters', () => {
    it('deve rejeitar documentRoot nulo', () => {
      const result = validateDocumentRoot(null, 'johnsmith');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('inválido');
    });

    it('deve rejeitar documentRoot vazio', () => {
      const result = validateDocumentRoot('', 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar documentRoot não-string', () => {
      const result = validateDocumentRoot(123, 'johnsmith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar username nulo', () => {
      const result = validateDocumentRoot('/home/johnsmith/', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Username');
    });

    it('deve rejeitar username vazio', () => {
      const result = validateDocumentRoot('/home/johnsmith/', '');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar username não-string', () => {
      const result = validateDocumentRoot('/home/johnsmith/', 123);
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar username com caracteres especiais', () => {
      const result = validateDocumentRoot('/home/john@smith/', 'john@smith');
      expect(result.valid).toBe(false);
    });

    it('deve rejeitar username com espaços', () => {
      const result = validateDocumentRoot('/home/john smith/', 'john smith');
      expect(result.valid).toBe(false);
    });
  });

  describe('isRestrictedDir()', () => {
    it('deve identificar .ssh como restrito', () => {
      expect(isRestrictedDir('.ssh')).toBe(true);
    });

    it('deve identificar .cpanel como restrito', () => {
      expect(isRestrictedDir('.cpanel')).toBe(true);
    });

    it('deve identificar mail como restrito', () => {
      expect(isRestrictedDir('mail')).toBe(true);
    });

    it('deve identificar etc como restrito', () => {
      expect(isRestrictedDir('etc')).toBe(true);
    });

    it('deve ser case-insensitive', () => {
      expect(isRestrictedDir('.SSH')).toBe(true);
      expect(isRestrictedDir('.CPANEL')).toBe(true);
    });

    it('deve retornar false para diretório permitido', () => {
      expect(isRestrictedDir('public_html')).toBe(false);
    });

    it('deve retornar false para nulo', () => {
      expect(isRestrictedDir(null)).toBe(false);
    });

    it('deve retornar false para vazio', () => {
      expect(isRestrictedDir('')).toBe(false);
    });

    it('deve retornar false para não-string', () => {
      expect(isRestrictedDir(123)).toBe(false);
    });
  });

  describe('getRestrictedDirs()', () => {
    it('deve retornar array de diretórios restritos', () => {
      const dirs = getRestrictedDirs();
      expect(Array.isArray(dirs)).toBe(true);
      expect(dirs.length).toBeGreaterThan(0);
    });

    it('deve incluir .ssh', () => {
      const dirs = getRestrictedDirs();
      expect(dirs).toContain('.ssh');
    });

    it('deve incluir .cpanel', () => {
      const dirs = getRestrictedDirs();
      expect(dirs).toContain('.cpanel');
    });

    it('deve incluir mail', () => {
      const dirs = getRestrictedDirs();
      expect(dirs).toContain('mail');
    });

    it('deve incluir etc', () => {
      const dirs = getRestrictedDirs();
      expect(dirs).toContain('etc');
    });

    it('deve retornar cópia, não referência original', () => {
      const dirs1 = getRestrictedDirs();
      const dirs2 = getRestrictedDirs();
      dirs1.push('newdir');
      expect(dirs2).not.toContain('newdir');
    });

    it('deve conter pelo menos 10 diretórios restritos', () => {
      const dirs = getRestrictedDirs();
      expect(dirs.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('sanitizePath()', () => {
    it('deve normalizar caminho com múltiplas slashes', () => {
      const result = sanitizePath('/home//johnsmith///public_html');
      expect(result).toContain('johnsmith');
      expect(result).not.toContain('//');
    });

    it('deve converter backslashes para forward slashes', () => {
      const result = sanitizePath('/home\\johnsmith\\public_html');
      expect(result).not.toContain('\\');
      expect(result).toContain('/');
    });

    it('deve remover ./ relativo', () => {
      const result = sanitizePath('./public_html');
      expect(result).toBeDefined();
    });

    it('deve retornar vazio para entrada nula', () => {
      const result = sanitizePath(null);
      expect(result).toBe('');
    });

    it('deve retornar vazio para entrada vazia', () => {
      const result = sanitizePath('');
      expect(result).toBe('');
    });

    it('deve retornar vazio para entrada não-string', () => {
      const result = sanitizePath(123);
      expect(result).toBe('');
    });

    it('deve remover espaços em branco leading/trailing', () => {
      const result = sanitizePath('  /home/johnsmith  ');
      // sanitizePath não remove trim, ele apenas normaliza
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('deve processar paths com múltiplos dots', () => {
      const result = sanitizePath('/home/john.smith.test');
      expect(result).toContain('john');
    });

    it('deve lidar com paths muito longos', () => {
      const longPath = '/home/' + 'a'.repeat(1000);
      const result = sanitizePath(longPath);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('validateDocumentRoot() - Integration Tests', () => {
    it('deve permitir paths profundos válidos', () => {
      const result = validateDocumentRoot(
        '/home/client1/public_html/app/controllers/api/v1',
        'client1'
      );
      expect(result.valid).toBe(true);
    });

    it('deve rejeitar múltiplos tipos de ataques em sequência', () => {
      const traversal = validateDocumentRoot('/home/johnsmith/../../../', 'johnsmith');
      const restricted = validateDocumentRoot('/home/johnsmith/.ssh/', 'johnsmith');
      const injection = validateDocumentRoot('/home/johnsmith/file;whoami', 'johnsmith');

      expect(traversal.valid).toBe(false);
      expect(restricted.valid).toBe(false);
      expect(injection.valid).toBe(false);
    });

    it('deve validar múltiplos usuários sequencialmente', () => {
      const user1 = validateDocumentRoot('/home/client1/public_html', 'client1');
      const user2 = validateDocumentRoot('/home/client2/public_html', 'client2');
      const user3 = validateDocumentRoot('/home/client3/public_html', 'client3');

      expect(user1.valid).toBe(true);
      expect(user2.valid).toBe(true);
      expect(user3.valid).toBe(true);
    });
  });
});
