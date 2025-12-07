/**
 * Sistema de Retry com Backoff Exponencial (CC-06)
 * Implementa AC15: Resiliencia e Rate Limiting
 */

const logger = require('./logger');
const { recordRateLimitHit, recordWhmRetry } = require('./metrics');

/**
 * Calcula delay de backoff exponencial com jitter
 * Formula: delay = min(baseDelay * 2^attempt, maxDelay) * (1 + random(-jitter, +jitter))
 *
 * @param {number} attempt - Numero da tentativa (0-indexed)
 * @param {number} baseDelay - Delay base em ms (default: 1000)
 * @param {number} maxDelay - Delay maximo em ms (default: 32000)
 * @param {number} jitter - Fator de jitter (default: 0.2 = 20%)
 * @returns {number} Delay calculado em ms
 */
function calculateBackoffDelay(attempt, baseDelay = 1000, maxDelay = 32000, jitter = 0.2) {
  // Calculo exponencial
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Limitar ao maximo
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Aplicar jitter aleatorio (+/- jitter%)
  const jitterFactor = 1 + (Math.random() * 2 - 1) * jitter;
  const finalDelay = Math.round(cappedDelay * jitterFactor);

  return finalDelay;
}

/**
 * Verifica se erro e retriavel
 * @param {Error} error - Erro a verificar
 * @returns {boolean} true se deve fazer retry
 */
function isRetryableError(error) {
  // Erros de rede sao retriaveis
  if (!error.response) {
    return true;
  }

  // Status codes retriaveis
  const retryableStatusCodes = [
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
  ];

  return retryableStatusCodes.includes(error.response?.status);
}

/**
 * Extrai valor do header Retry-After
 * @param {object} response - Resposta HTTP
 * @returns {number|null} Delay em ms ou null
 */
function getRetryAfterMs(response) {
  if (!response?.headers) {
    return null;
  }

  const retryAfter = response.headers['retry-after'];
  if (!retryAfter) {
    return null;
  }

  // Tentar parsear como numero (segundos)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Tentar parsear como data HTTP
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : null;
  }

  return null;
}

/**
 * Executa funcao com retry e backoff exponencial
 *
 * @param {Function} fn - Funcao async a executar
 * @param {object} options - Opcoes de retry
 * @param {number} options.maxRetries - Maximo de tentativas (default: 5)
 * @param {number} options.baseDelay - Delay base em ms (default: 1000)
 * @param {number} options.maxDelay - Delay maximo em ms (default: 32000)
 * @param {number} options.jitter - Fator de jitter (default: 0.2)
 * @param {string} options.operationName - Nome da operacao para logs
 * @param {Function} options.onRetry - Callback chamado em cada retry
 * @returns {Promise<any>} Resultado da funcao
 */
async function withRetry(fn, options = {}) {
  /**
   * Executa função com retry automático.
   * PRIORIZA Retry-After header sobre backoff exponencial.
   */
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 32000,
    jitter = 0.2,
    operationName = 'operation',
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Verificar se erro e retriavel
      if (!isRetryableError(error)) {
        logger.warn(`Non-retryable error in ${operationName}`, {
          attempt: attempt + 1,
          error: error.message
        });
        throw error;
      }

      // Se última tentativa, lançar erro
      if (attempt >= maxRetries - 1) {
        logger.error(`Max retries exceeded for ${operationName}`, {
          attempts: maxRetries,
          error: error.message
        });
        throw error;
      }

      // Determinar delay: Retry-After header OU backoff exponencial
      let delayMs;
      let retryAfterUsed = false;

      // 1. Tentar extrair Retry-After do erro (se for erro HTTP)
      if (error.response && error.response.headers) {
        const retryAfterMs = getRetryAfterMs(error.response);

        if (retryAfterMs !== null && retryAfterMs > 0) {
          delayMs = retryAfterMs;
          retryAfterUsed = true;

          logger.info(`Respecting Retry-After header`, {
            operation: operationName,
            attempt: attempt + 1,
            retryAfterSeconds: Math.round(retryAfterMs / 1000),
            httpStatus: error.response.status
          });
        }
      }

      // 2. Se não tem Retry-After, usar backoff exponencial
      if (!retryAfterUsed) {
        delayMs = calculateBackoffDelay(attempt, baseDelay, maxDelay, jitter);

        logger.info(`Retry attempt ${attempt + 1}/${maxRetries}`, {
          operation: operationName,
          delayMs,
          strategy: 'exponential-backoff'
        });
      }

      // Registrar hit de rate limit se for 429
      if (error.response?.status === 429) {
        recordRateLimitHit();
      }

      // Registrar retry nas metricas
      recordWhmRetry(operationName);

      // Callback de retry
      if (onRetry) {
        try {
          await onRetry(attempt + 1, delayMs, error);
        } catch (callbackError) {
          logger.warn(`Retry callback error: ${callbackError.message}`);
        }
      }

      // 3. Aguardar antes de próxima tentativa
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Funcao sleep
 * @param {number} ms - Tempo em ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrapper para axios com retry
 */
function createRetryableAxios(axiosInstance, options = {}) {
  const retryOptions = {
    maxRetries: options.maxRetries || 5,
    baseDelay: options.baseDelay || 1000,
    maxDelay: options.maxDelay || 32000,
    jitter: options.jitter || 0.2
  };

  return {
    async get(url, config = {}) {
      return withRetry(
        () => axiosInstance.get(url, config),
        { ...retryOptions, operationName: `GET ${url}` }
      );
    },

    async post(url, data, config = {}) {
      return withRetry(
        () => axiosInstance.post(url, data, config),
        { ...retryOptions, operationName: `POST ${url}` }
      );
    },

    async put(url, data, config = {}) {
      return withRetry(
        () => axiosInstance.put(url, data, config),
        { ...retryOptions, operationName: `PUT ${url}` }
      );
    },

    async delete(url, config = {}) {
      return withRetry(
        () => axiosInstance.delete(url, config),
        { ...retryOptions, operationName: `DELETE ${url}` }
      );
    }
  };
}

module.exports = {
  calculateBackoffDelay,
  isRetryableError,
  getRetryAfterMs,
  withRetry,
  sleep,
  createRetryableAxios
};
