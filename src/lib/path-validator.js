/**
 * Path Validator - Validação de document_root e caminhos (RS03)
 *
 * Implementa:
 * - Prevenção de path traversal (../, ..\\)
 * - Bloqueio de diretórios restritos
 * - Validação de path dentro de /home/{username}/
 * - Sanitização de caracteres especiais
 */

const path = require('path');
const logger = require('./logger');

// Diretórios restritos que não podem ser acessados
const RESTRICTED_DIRS = [
  '.ssh',
  '.cpanel',
  '.gnupg',
  'etc',
  'mail',
  'tmp',
  '.bash_history',
  '.cache',
  '.local',
  '.config'
];

/**
 * Valida um document_root para um usuário específico
 *
 * @param {string} documentRoot - Caminho do document root a validar
 * @param {string} username - Nome do usuário proprietário
 * @returns {{valid: boolean, sanitized: string, error: string|null}}
 */
function validateDocumentRoot(documentRoot, username) {
  // Validar parâmetros de entrada
  if (!documentRoot || typeof documentRoot !== 'string') {
    return {
      valid: false,
      sanitized: '',
      error: 'Document root inválido ou ausente'
    };
  }

  if (!username || typeof username !== 'string') {
    return {
      valid: false,
      sanitized: '',
      error: 'Username inválido ou ausente'
    };
  }

  const usernameTrimmed = username.trim().toLowerCase();

  // Validar username contém apenas caracteres seguros
  if (!/^[a-z0-9_\-\.]+$/.test(usernameTrimmed)) {
    return {
      valid: false,
      sanitized: '',
      error: 'Username contém caracteres inválidos'
    };
  }

  // Normalizar caminho (remover / duplos, ./, etc)
  let normalizedPath = path.normalize(documentRoot.trim());

  // Converter backslashes para forward slashes
  normalizedPath = normalizedPath.replace(/\\/g, '/');

  // Detectar tentativas óbvias de path traversal
  if (normalizedPath.includes('..')) {
    logger.warn('Path traversal attempt detected', {
      path: 'redacted',
      username: usernameTrimmed
    });
    return {
      valid: false,
      sanitized: '',
      error: 'Caminho contém traversal (..)'
    };
  }

  // Detectar backslash (mesmo após normalização)
  if (normalizedPath.includes('\\')) {
    return {
      valid: false,
      sanitized: '',
      error: 'Caminho contém caracteres inválidos (backslash)'
    };
  }

  // Validar que o caminho começa com /home/{username}/
  const expectedBasePath = `/home/${usernameTrimmed}`;
  const expectedBasePathWithoutTrailingSlash = expectedBasePath.replace(/\/$/, '');

  // Path pode ser /home/username ou /home/username/ ou /home/username/public_html, etc
  const isValidBase =
    normalizedPath === expectedBasePathWithoutTrailingSlash ||
    normalizedPath.startsWith(expectedBasePath + '/');

  if (!isValidBase) {
    logger.warn('Path outside home directory', {
      path: 'redacted',
      username: usernameTrimmed,
      expectedBase: expectedBasePath
    });
    return {
      valid: false,
      sanitized: '',
      error: `Caminho deve estar dentro de ${expectedBasePath}`
    };
  }

  // Extrair diretório relativo dentro do /home/{username}
  let relativePath = normalizedPath.substring(expectedBasePath.length);
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }

  // Verificar se algum componente do caminho é um diretório restrito
  if (relativePath) {
    const pathComponents = relativePath.split('/');

    for (const component of pathComponents) {
      const componentLower = component.toLowerCase();

      // Ignorar componentes vazios (múltiplas slashes)
      if (!component) {
        continue;
      }

      // Verificar contra lista de diretórios restritos
      if (RESTRICTED_DIRS.includes(componentLower)) {
        logger.warn('Restricted directory access attempt', {
          directory: componentLower,
          username: usernameTrimmed
        });
        return {
          valid: false,
          sanitized: '',
          error: `Acesso ao diretório "${componentLower}" não permitido`
        };
      }

      // Validar caracteres do componente (não permite shell metacharacters)
      const shellMetacharacters = [';', '|', '`', '$', '(', ')', '{', '}', '[', ']', '<', '>', '!', '&', '*', '?'];
      for (const char of shellMetacharacters) {
        if (componentLower.includes(char)) {
          return {
            valid: false,
            sanitized: '',
            error: `Componente do caminho contém caracteres inválidos: ${char}`
          };
        }
      }
    }
  }

  logger.debug('Path validation successful', {
    username: usernameTrimmed,
    pathLength: normalizedPath.length
  });

  return {
    valid: true,
    sanitized: normalizedPath,
    error: null
  };
}

/**
 * Verifica se um diretório está na lista de restritos
 *
 * @param {string} dirname - Nome do diretório
 * @returns {boolean} True se diretório é restrito
 */
function isRestrictedDir(dirname) {
  if (!dirname || typeof dirname !== 'string') {
    return false;
  }

  const dirnameLower = dirname.toLowerCase();
  return RESTRICTED_DIRS.includes(dirnameLower);
}

/**
 * Retorna lista de diretórios restritos
 *
 * @returns {string[]} Array com nomes de diretórios restritos
 */
function getRestrictedDirs() {
  return [...RESTRICTED_DIRS];
}

/**
 * Sanitiza um caminho removendo caracteres potencialmente perigosos
 *
 * @param {string} dirPath - Caminho a sanitizar
 * @returns {string} Caminho sanitizado
 */
function sanitizePath(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    return '';
  }

  // Normalizar
  let sanitized = path.normalize(dirPath);

  // Converter backslashes
  sanitized = sanitized.replace(/\\/g, '/');

  // Remover múltiplas slashes
  sanitized = sanitized.replace(/\/+/g, '/');

  return sanitized;
}

module.exports = {
  validateDocumentRoot,
  isRestrictedDir,
  getRestrictedDirs,
  sanitizePath
};
