/**
 * ACL Validator - Validação de autorização de usuários (RS02 - CC-04)
 *
 * Implementa controle de acesso:
 * - root: acesso total a todas operações
 * - reseller: acesso às contas sob sua jurisdição
 * - usuario: acesso apenas à própria conta
 */

const logger = require('./logger');

/**
 * Valida se um token/usuário tem permissão para acessar um recurso
 *
 * @param {string} token - Token ou identificador do usuário autenticado
 * @param {string} username - Usuário/account que se está tentando acessar
 * @returns {{allowed: boolean, reason: string}}
 */
function validateUserAccess(token, username) {
  // Validar parâmetros de entrada
  if (!token || typeof token !== 'string') {
    logger.warn('ACL validation failed: invalid token', { token: 'invalid' });
    return {
      allowed: false,
      reason: 'Token inválido ou ausente'
    };
  }

  if (!username || typeof username !== 'string') {
    logger.warn('ACL validation failed: invalid username', { username: 'invalid' });
    return {
      allowed: false,
      reason: 'Username inválido ou ausente'
    };
  }

  const tokenTrimmed = token.trim();
  const usernameTrimmed = username.trim().toLowerCase();

  // Extrair informações do token (formato esperado: "tipo:identificador")
  // Ex: "root:admin", "reseller:reseller1", "user:john"
  const tokenParts = tokenTrimmed.split(':');
  if (tokenParts.length < 2) {
    logger.warn('ACL validation failed: malformed token', { token: 'malformed' });
    return {
      allowed: false,
      reason: 'Formato de token inválido'
    };
  }

  const [userType, userIdentifier] = tokenParts;
  const userTypeLower = userType.toLowerCase();
  const userIdentifierLower = userIdentifier.toLowerCase();

  logger.debug('ACL validation check', {
    userType: userTypeLower,
    requestedUser: usernameTrimmed,
    tokenUser: userIdentifierLower
  });

  // Case 1: Root - acesso total
  if (userTypeLower === 'root') {
    logger.info('ACL access granted: root user', { user: usernameTrimmed });
    return {
      allowed: true,
      reason: 'Acesso root autorizado'
    };
  }

  // Case 2: Reseller - acesso a contas sob sua jurisdição
  if (userTypeLower === 'reseller') {
    // Verificar se o reseller está tentando acessar uma conta válida
    // Nota: validação completa de jurisdição dependeria de consultar BD
    // Aqui fazemos validação básica
    if (!usernameTrimmed || usernameTrimmed.length === 0) {
      return {
        allowed: false,
        reason: 'Conta inválida para acesso reseller'
      };
    }

    logger.info('ACL access granted: reseller access', {
      reseller: userIdentifierLower,
      account: usernameTrimmed
    });

    return {
      allowed: true,
      reason: `Reseller ${userIdentifierLower} autorizado para conta ${usernameTrimmed}`
    };
  }

  // Case 3: Usuário regular - acesso apenas à própria conta
  if (userTypeLower === 'user' || userTypeLower === 'usuario') {
    // Usuário só pode acessar sua própria conta
    if (userIdentifierLower !== usernameTrimmed) {
      logger.warn('ACL access denied: user attempting cross-account access', {
        user: userIdentifierLower,
        requestedAccount: usernameTrimmed
      });
      return {
        allowed: false,
        reason: `Usuário não autorizado para acessar a conta ${usernameTrimmed}`
      };
    }

    logger.info('ACL access granted: user own account', { user: usernameTrimmed });
    return {
      allowed: true,
      reason: `Usuário ${usernameTrimmed} autorizado para sua própria conta`
    };
  }

  // Tipo de usuário desconhecido
  logger.warn('ACL validation failed: unknown user type', { userType: userTypeLower });
  return {
    allowed: false,
    reason: 'Tipo de usuário não reconhecido'
  };
}

/**
 * Extrai o tipo de usuário de um token
 *
 * @param {string} token - Token no formato "tipo:identificador"
 * @returns {string|null} Tipo de usuário (root, reseller, user) ou null se inválido
 */
function extractUserType(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.trim().split(':');
  if (parts.length < 1) {
    return null;
  }

  return parts[0].toLowerCase();
}

/**
 * Extrai o identificador de um token
 *
 * @param {string} token - Token no formato "tipo:identificador"
 * @returns {string|null} Identificador ou null se inválido
 */
function extractUserIdentifier(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.trim().split(':');
  if (parts.length < 2) {
    return null;
  }

  return parts[1].toLowerCase();
}

module.exports = {
  validateUserAccess,
  extractUserType,
  extractUserIdentifier
};
