/**
 * Validators - Validação de domínios e segurança
 * Previne LDAP injection, shell injection e path traversal
 *
 * Padrões de domínio (RFC 1035, RFC 1123):
 * - 1-255 caracteres totais
 * - Labels (partes separadas por pontos): 1-63 caracteres
 * - Caracteres válidos: a-z, A-Z, 0-9, hífen
 * - Não pode começar ou terminar com hífen
 * - Deve ter pelo menos um ponto (extensão de domínio)
 */

/**
 * Valida formato de domínio
 * @param {string} domain - Nome do domínio
 * @returns {{isValid: boolean, sanitized: string, error: string|null}}
 */
function validateDomain(domain) {
  // Validar tipo
  if (domain === null || domain === undefined) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio não pode ser nulo'
    };
  }

  // Converter para string se necessário
  if (typeof domain !== 'string') {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio deve ser uma string'
    };
  }

  // Sanitizar: remover espaços e converter para minúsculas
  const sanitized = domain.trim().toLowerCase();

  // Validar vazio
  if (sanitized.length === 0) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio não pode ser vazio'
    };
  }

  // Validar comprimento máximo (255 caracteres)
  if (sanitized.length > 255) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio não pode exceder 255 caracteres'
    };
  }

  // Verificar shell metacharacters (segurança crítica)
  const shellMetacharacters = [';', '|', '`', '$', '(', ')', '{', '}', '[', ']', '<', '>', '!', '&'];
  for (const char of shellMetacharacters) {
    if (sanitized.includes(char)) {
      return {
        isValid: false,
        sanitized: '',
        error: `Domínio contém shell metacharacters: ${char}`
      };
    }
  }

  // Verificar caracteres inválidos
  // Válidos: a-z, 0-9, hífen, ponto
  const validChars = /^[a-z0-9\.\-]*$/;
  if (!validChars.test(sanitized)) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio contém caracteres inválidos (permitidos: a-z, 0-9, ponto, hífen)'
    };
  }

  // Verificar path traversal (..)
  if (sanitized.includes('..')) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio contém pontos consecutivos'
    };
  }

  // Verificar backslash
  if (sanitized.includes('\\')) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio contém caracteres inválidos'
    };
  }

  // Verificar início/fim com pontos
  if (sanitized.startsWith('.') || sanitized.endsWith('.')) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio não pode começar ou terminar com ponto'
    };
  }

  // Validar que tem pelo menos um ponto (extensão de domínio)
  if (!sanitized.includes('.')) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Domínio deve ter extensão de domínio (ex: .com)'
    };
  }

  // Validar cada label (parte separada por ponto)
  const labels = sanitized.split('.');
  for (const label of labels) {
    // Validar comprimento do label (63 caracteres máximo)
    if (label.length === 0 || label.length > 63) {
      return {
        isValid: false,
        sanitized: '',
        error: 'Cada label do domínio deve ter 1-63 caracteres'
      };
    }

    // Validar que não começa ou termina com hífen
    if (label.startsWith('-') || label.endsWith('-')) {
      return {
        isValid: false,
        sanitized: '',
        error: 'Labels do domínio não podem começar ou terminar com hífen'
      };
    }
  }

  return {
    isValid: true,
    sanitized,
    error: null
  };
}

/**
 * Valida subdomínio e domínio pai
 * @param {string} subdomain - Nome do subdomínio
 * @param {string} parentDomain - Domínio pai
 * @returns {{isValid: boolean, sanitized: string, error: string|null}}
 */
function validateSubdomain(subdomain, parentDomain) {
  // Primeiro validar domínio pai
  const parentValidation = validateDomain(parentDomain);
  if (!parentValidation.isValid) {
    return {
      isValid: false,
      sanitized: '',
      error: `Domínio pai inválido: ${parentValidation.error}`
    };
  }

  // Validar subdomínio
  if (subdomain === null || subdomain === undefined) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Subdomínio não pode ser nulo'
    };
  }

  if (typeof subdomain !== 'string') {
    return {
      isValid: false,
      sanitized: '',
      error: 'Subdomínio deve ser uma string'
    };
  }

  const sanitized = subdomain.trim().toLowerCase();

  // Validar vazio
  if (sanitized.length === 0) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Subdomínio não pode ser vazio'
    };
  }

  // Verificar shell metacharacters
  const shellMetacharacters = [';', '|', '`', '$', '(', ')', '{', '}', '[', ']', '<', '>', '!', '&'];
  for (const char of shellMetacharacters) {
    if (sanitized.includes(char)) {
      return {
        isValid: false,
        sanitized: '',
        error: `Subdomínio contém shell metacharacters: ${char}`
      };
    }
  }

  // Validar caracteres (subdomínio não pode ter pontos)
  const validChars = /^[a-z0-9\-]*$/;
  if (!validChars.test(sanitized)) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Subdomínio contém caracteres inválidos (permitidos: a-z, 0-9, hífen)'
    };
  }

  // Validar que não começa ou termina com hífen
  if (sanitized.startsWith('-') || sanitized.endsWith('-')) {
    return {
      isValid: false,
      sanitized: '',
      error: 'Subdomínio não pode começar ou terminar com hífen'
    };
  }

  return {
    isValid: true,
    sanitized,
    error: null
  };
}

/**
 * Sanitiza domínio removendo espaços e normalizando
 * @param {string} domain - Domínio para sanitizar
 * @returns {string} Domínio sanitizado
 */
function sanitizeDomain(domain) {
  if (domain === null || domain === undefined) {
    return '';
  }

  return String(domain).trim().toLowerCase();
}

module.exports = {
  validateDomain,
  validateSubdomain,
  sanitizeDomain
};
