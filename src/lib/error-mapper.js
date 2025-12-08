/**
 * Error Mapper - Mapeamento de erros WHM para tipos específicos (CI-07)
 *
 * Implementa:
 * - Conversão de códigos de erro WHM para classes de erro tipadas
 * - Suporte a retry automático com configuração de tentativas
 * - Mapeamento de timeouts e rate limiting
 * - Classificação de erros por severidade
 */

const logger = require('./logger');

// Tipos de erro mapeados
const ERROR_TYPES = {
  // Sistema operacional
  EEXIST: 'EEXIST',           // Arquivo/recurso já existe
  ENOENT: 'ENOENT',           // Arquivo/recurso não encontrado
  EPERM: 'EPERM',             // Operação não permitida
  EBUSY: 'EBUSY',             // Recurso em uso

  // Rede/Timeout
  ETIMEDOUT: 'ETIMEDOUT',     // Operação expirou
  ECONNREFUSED: 'ECONNREFUSED', // Conexão recusada

  // API/Taxa limite
  RATE_LIMITED: 'RATE_LIMITED', // Limite de taxa excedido
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED', // Cota excedida

  // Validação
  INVALID_INPUT: 'INVALID_INPUT', // Entrada inválida
  VALIDATION_ERROR: 'VALIDATION_ERROR', // Erro de validação

  // Autenticação/Autorização
  UNAUTHORIZED: 'UNAUTHORIZED', // Não autorizado
  FORBIDDEN: 'FORBIDDEN',       // Acesso proibido

  // Servidor
  INTERNAL_ERROR: 'INTERNAL_ERROR', // Erro interno do servidor
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE', // Serviço indisponível

  // Desconhecido
  UNKNOWN: 'UNKNOWN'            // Erro desconhecido
};

// Configuração de retry por tipo de erro
const RETRY_CONFIG = {
  [ERROR_TYPES.EEXIST]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Arquivo ou recurso já existe'
  },
  [ERROR_TYPES.ENOENT]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Arquivo ou recurso não encontrado'
  },
  [ERROR_TYPES.EPERM]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Operação não permitida (permissão negada)'
  },
  [ERROR_TYPES.EBUSY]: {
    shouldRetry: true,
    maxRetries: 3,
    backoffMs: 1000,
    description: 'Recurso ocupado, tente novamente'
  },
  [ERROR_TYPES.ETIMEDOUT]: {
    shouldRetry: true,
    maxRetries: 2,
    backoffMs: 2000,
    description: 'Operação expirou, tente novamente'
  },
  [ERROR_TYPES.ECONNREFUSED]: {
    shouldRetry: true,
    maxRetries: 3,
    backoffMs: 1000,
    description: 'Conexão recusada, serviço pode estar indisponível'
  },
  [ERROR_TYPES.RATE_LIMITED]: {
    shouldRetry: true,
    maxRetries: 5,
    backoffMs: 5000,
    description: 'Limite de taxa excedido, aguarde antes de tentar novamente'
  },
  [ERROR_TYPES.QUOTA_EXCEEDED]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Cota de recursos excedida'
  },
  [ERROR_TYPES.INVALID_INPUT]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Entrada inválida, verifique parâmetros'
  },
  [ERROR_TYPES.VALIDATION_ERROR]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Erro de validação'
  },
  [ERROR_TYPES.UNAUTHORIZED]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Autenticação falhou'
  },
  [ERROR_TYPES.FORBIDDEN]: {
    shouldRetry: false,
    maxRetries: 0,
    description: 'Acesso proibido'
  },
  [ERROR_TYPES.INTERNAL_ERROR]: {
    shouldRetry: true,
    maxRetries: 2,
    backoffMs: 2000,
    description: 'Erro interno do servidor, tente novamente'
  },
  [ERROR_TYPES.SERVICE_UNAVAILABLE]: {
    shouldRetry: true,
    maxRetries: 3,
    backoffMs: 3000,
    description: 'Serviço temporariamente indisponível'
  },
  [ERROR_TYPES.UNKNOWN]: {
    shouldRetry: true,
    maxRetries: 1,
    backoffMs: 1000,
    description: 'Erro desconhecido'
  }
};

/**
 * Mapeamento de padrões de erro para tipos conhecidos
 * Tenta identificar tipo de erro a partir de mensagens comuns
 */
const ERROR_PATTERN_MAP = {
  'file exists': ERROR_TYPES.EEXIST,
  'no such file': ERROR_TYPES.ENOENT,
  'not found': ERROR_TYPES.ENOENT,
  'permission denied': ERROR_TYPES.EPERM,
  'resource busy': ERROR_TYPES.EBUSY,
  'timeout': ERROR_TYPES.ETIMEDOUT,
  'timed out': ERROR_TYPES.ETIMEDOUT,
  'connection refused': ERROR_TYPES.ECONNREFUSED,
  'rate limit': ERROR_TYPES.RATE_LIMITED,
  'too many requests': ERROR_TYPES.RATE_LIMITED,
  'quota': ERROR_TYPES.QUOTA_EXCEEDED,
  'invalid': ERROR_TYPES.INVALID_INPUT,
  'unauthorized': ERROR_TYPES.UNAUTHORIZED,
  'forbidden': ERROR_TYPES.FORBIDDEN,
  'internal server error': ERROR_TYPES.INTERNAL_ERROR,
  'service unavailable': ERROR_TYPES.SERVICE_UNAVAILABLE,
  'bad request': ERROR_TYPES.INVALID_INPUT
};

/**
 * Mapeia um erro WHM ou genérico para um tipo de erro classificado
 *
 * @param {Error|string|object} whmError - Erro a ser mapeado
 * @returns {object} Erro mapeado com tipo, retry, etc
 */
function mapWhmError(whmError) {
  // Validar entrada
  if (!whmError) {
    return createMappedError(ERROR_TYPES.UNKNOWN, 'Erro vazio ou nulo');
  }

  let errorCode = null;
  let errorMessage = '';

  // Extrair informações do erro
  if (typeof whmError === 'string') {
    errorMessage = whmError;
  } else if (whmError instanceof Error) {
    errorCode = whmError.code;
    errorMessage = whmError.message || '';
  } else if (typeof whmError === 'object') {
    errorCode = whmError.code || whmError.errno;
    errorMessage = whmError.message || whmError.msg || JSON.stringify(whmError);
  }

  // Se temos um código de erro direto, usar ele
  if (errorCode && ERROR_TYPES[errorCode]) {
    return createMappedError(errorCode, errorMessage);
  }

  // Tentar identificar pelo padrão de mensagem
  const normalizedMessage = errorMessage.toLowerCase();

  for (const [pattern, errorType] of Object.entries(ERROR_PATTERN_MAP)) {
    if (normalizedMessage.includes(pattern)) {
      return createMappedError(errorType, errorMessage);
    }
  }

  // Padrão não encontrado
  logger.debug('Unknown error pattern, defaulting to UNKNOWN', {
    errorMessage: errorMessage.substring(0, 100)
  });

  return createMappedError(ERROR_TYPES.UNKNOWN, errorMessage);
}

/**
 * Cria objeto de erro mapeado com informações de retry
 *
 * @param {string} errorType - Tipo de erro (uma das constantes ERROR_TYPES)
 * @param {string} originalMessage - Mensagem de erro original
 * @returns {object} Objeto com erro mapeado, retry, etc
 */
function createMappedError(errorType, originalMessage) {
  // Validar tipo
  if (!ERROR_TYPES[errorType]) {
    logger.warn('Invalid error type provided', { errorType });
    errorType = ERROR_TYPES.UNKNOWN;
  }

  const retryConfig = RETRY_CONFIG[errorType] || RETRY_CONFIG[ERROR_TYPES.UNKNOWN];

  return {
    type: errorType,
    message: retryConfig.description,
    originalMessage: originalMessage || '',
    retry: {
      shouldRetry: retryConfig.shouldRetry,
      maxRetries: retryConfig.maxRetries,
      backoffMs: retryConfig.backoffMs || 0
    },
    severity: calculateSeverity(errorType),
    timestamp: Date.now()
  };
}

/**
 * Calcula severidade do erro (low, medium, high, critical)
 *
 * @param {string} errorType - Tipo de erro
 * @returns {string} Nível de severidade
 */
function calculateSeverity(errorType) {
  switch (errorType) {
    case ERROR_TYPES.EEXIST:
    case ERROR_TYPES.QUOTA_EXCEEDED:
      return 'medium';

    case ERROR_TYPES.EPERM:
    case ERROR_TYPES.FORBIDDEN:
    case ERROR_TYPES.UNAUTHORIZED:
      return 'high';

    case ERROR_TYPES.INTERNAL_ERROR:
    case ERROR_TYPES.SERVICE_UNAVAILABLE:
      return 'high';

    case ERROR_TYPES.ENOENT:
    case ERROR_TYPES.INVALID_INPUT:
    case ERROR_TYPES.VALIDATION_ERROR:
      return 'low';

    case ERROR_TYPES.EBUSY:
    case ERROR_TYPES.ETIMEDOUT:
    case ERROR_TYPES.ECONNREFUSED:
    case ERROR_TYPES.RATE_LIMITED:
      return 'medium';

    default:
      return 'medium';
  }
}

/**
 * Verifica se um erro é recuperável (pode fazer retry)
 *
 * @param {object} mappedError - Erro mapeado (resultado de mapWhmError)
 * @returns {boolean} True se erro pode fazer retry
 */
function isRecoverable(mappedError) {
  if (!mappedError || !mappedError.retry) {
    return false;
  }

  return mappedError.retry.shouldRetry === true &&
         mappedError.retry.maxRetries > 0;
}

/**
 * Retorna tempo de espera (backoff) para próxima tentativa
 *
 * @param {object} mappedError - Erro mapeado
 * @param {number} attemptNumber - Número da tentativa (0-based)
 * @returns {number} Tempo em ms para aguardar
 */
function getRetryBackoff(mappedError, attemptNumber = 0) {
  if (!mappedError || !mappedError.retry) {
    return 0;
  }

  const baseBackoff = mappedError.retry.backoffMs || 1000;

  // Implementar exponential backoff: backoff * (2 ^ attemptNumber)
  return baseBackoff * Math.pow(2, Math.min(attemptNumber, 3));
}

/**
 * Lista todos os tipos de erro disponíveis
 *
 * @returns {array} Array com tipos de erro
 */
function getErrorTypes() {
  return Object.keys(ERROR_TYPES);
}

/**
 * Retorna configuração de retry para um tipo de erro
 *
 * @param {string} errorType - Tipo de erro
 * @returns {object} Configuração de retry
 */
function getRetryConfig(errorType) {
  return RETRY_CONFIG[errorType] || null;
}

module.exports = {
  mapWhmError,
  createMappedError,
  isRecoverable,
  getRetryBackoff,
  calculateSeverity,
  getErrorTypes,
  getRetryConfig,
  ERROR_TYPES,
  RETRY_CONFIG
};
