/**
 * Sistema de Timeout Hierarchical (AC17)
 * Implementa RNF01: Performance e Timeout
 *
 * Valores obrigatorios:
 * - WHM API: 30s
 * - SSH: 60s
 * - DNS operations: 45s
 * - HTTP geral: 30s
 */

const logger = require('./logger');
const { recordError } = require('./metrics');

// Configuracao de timeouts por tipo de operacao (em ms)
// Valores podem ser sobrescritos via variaveis de ambiente
const TIMEOUT_CONFIG = {
  WHM_API: parseInt(process.env.TIMEOUT_WHM_API) || 30000,      // 30 segundos (default)
  SSH: parseInt(process.env.TIMEOUT_SSH) || 60000,              // 60 segundos (default)
  DNS: parseInt(process.env.TIMEOUT_DNS) || 45000,              // 45 segundos (default)
  HTTP: parseInt(process.env.TIMEOUT_HTTP) || 30000,            // 30 segundos (default)
  FILE: parseInt(process.env.TIMEOUT_FILE) || 30000,            // 30 segundos (default)
  DEFAULT: parseInt(process.env.TIMEOUT_DEFAULT) || 30000       // 30 segundos (default)
};

// Mapeamento de operacoes para tipos de timeout
const OPERATION_TIMEOUT_MAP = {
  // WHM API
  'whm_list_accounts': 'WHM_API',
  'whm_create_account': 'WHM_API',
  'whm_suspend_account': 'WHM_API',
  'whm_unsuspend_account': 'WHM_API',
  'whm_terminate_account': 'WHM_API',
  'whm_get_account_summary': 'WHM_API',
  'whm_server_status': 'WHM_API',
  'whm_service_status': 'WHM_API',
  'whm_restart_service': 'WHM_API',
  'whm_list_domains': 'WHM_API',

  // DNS
  'dns_list_zones': 'DNS',
  'dns_get_zone': 'DNS',
  'dns_add_record': 'DNS',
  'dns_edit_record': 'DNS',
  'dns_delete_record': 'DNS',
  'dns_reset_zone': 'DNS',

  // SSH
  'system_restart_service': 'SSH',
  'system_get_load': 'SSH',
  'log_read_last_lines': 'SSH',

  // File
  'file_list': 'FILE',
  'file_read': 'FILE',
  'file_write': 'FILE',
  'file_delete': 'FILE'
};

/**
 * Classe de erro de timeout
 */
class TimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`Operation timed out after ${timeoutMs / 1000}s`);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.timeoutSeconds = timeoutMs / 1000;
    this.code = -32000; // Codigo JSON-RPC para server error
  }

  toJsonRpcError() {
    return {
      code: this.code,
      message: `Operation timed out after ${this.timeoutSeconds}s`,
      data: {
        operation: this.operation,
        timeout_seconds: this.timeoutSeconds,
        suggestion: this.getSuggestion()
      }
    };
  }

  getSuggestion() {
    const type = OPERATION_TIMEOUT_MAP[this.operation] || 'DEFAULT';
    switch (type) {
      case 'WHM_API':
        return 'Check WHM server connectivity or increase timeout';
      case 'SSH':
        return 'Check SSH connectivity or server load';
      case 'DNS':
        return 'Zone might be very large or WHM server is slow';
      case 'FILE':
        return 'File might be very large or server is slow';
      default:
        return 'Check server connectivity';
    }
  }
}

/**
 * Obtem timeout para uma operacao
 * @param {string} operation - Nome da operacao
 * @returns {number} Timeout em ms
 */
function getTimeoutForOperation(operation) {
  const type = OPERATION_TIMEOUT_MAP[operation] || 'DEFAULT';
  return TIMEOUT_CONFIG[type] || TIMEOUT_CONFIG.DEFAULT;
}

/**
 * Obtem timeout por tipo
 * @param {string} type - Tipo de timeout (WHM_API, SSH, DNS, etc)
 * @returns {number} Timeout em ms
 */
function getTimeoutByType(type) {
  return TIMEOUT_CONFIG[type] || TIMEOUT_CONFIG.DEFAULT;
}

/**
 * Executa funcao com timeout
 * @param {Function} fn - Funcao async a executar
 * @param {number} timeoutMs - Timeout em ms
 * @param {string} operation - Nome da operacao para logs
 * @returns {Promise<any>} Resultado da funcao
 */
async function withTimeout(fn, timeoutMs, operation = 'operation') {
  return new Promise(async (resolve, reject) => {
    let settled = false;

    // Timer de timeout
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const error = new TimeoutError(operation, timeoutMs);
        logger.warn(`Timeout: ${operation} exceeded ${timeoutMs}ms`);
        recordError('timeout', error.code);
        reject(error);
      }
    }, timeoutMs);

    try {
      // await funciona com Promise e valores síncronos
      const result = await fn();

      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    }
  });
}

/**
 * Executa funcao com timeout baseado no tipo de operacao
 * @param {Function} fn - Funcao async a executar
 * @param {string} operation - Nome da operacao
 * @returns {Promise<any>} Resultado da funcao
 */
async function withOperationTimeout(fn, operation) {
  const timeoutMs = getTimeoutForOperation(operation);
  return withTimeout(fn, timeoutMs, operation);
}

/**
 * Cria AbortController com timeout
 * @param {number} timeoutMs - Timeout em ms
 * @returns {AbortController} Controller com timeout configurado
 */
function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Adicionar metodo para limpar timeout
  controller.cleanup = () => clearTimeout(timeoutId);

  return controller;
}

/**
 * Wrapper para axios com timeout por tipo de operacao
 */
function createTimeoutAxios(axiosInstance, operationType = 'HTTP') {
  const timeout = TIMEOUT_CONFIG[operationType] || TIMEOUT_CONFIG.DEFAULT;

  return {
    async get(url, config = {}) {
      return axiosInstance.get(url, { ...config, timeout });
    },

    async post(url, data, config = {}) {
      return axiosInstance.post(url, data, { ...config, timeout });
    },

    async put(url, data, config = {}) {
      return axiosInstance.put(url, data, { ...config, timeout });
    },

    async delete(url, config = {}) {
      return axiosInstance.delete(url, config, { ...config, timeout });
    }
  };
}

module.exports = {
  TIMEOUT_CONFIG,
  OPERATION_TIMEOUT_MAP,
  TimeoutError,
  getTimeoutForOperation,
  getTimeoutByType,
  withTimeout,
  withOperationTimeout,
  createTimeoutController,
  createTimeoutAxios
};
