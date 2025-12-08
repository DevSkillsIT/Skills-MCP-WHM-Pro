/**
 * Lock Manager - Gerenciamento de locks exclusivos para operações concorrentes (CC-05)
 *
 * Implementa:
 * - Aquisição de locks exclusivos por recurso
 * - Liberação de locks
 * - Detecção de locks stale com timeout automático
 * - Suporte a múltiplos recursos simultâneos
 */

const crypto = require('crypto');
const logger = require('./logger');

// Armazenamento em memória de locks
// Estrutura: { resourceId: { lockId, timestamp, timeout } }
const locks = new Map();

// Timeout padrão para locks (em milissegundos)
const DEFAULT_LOCK_TIMEOUT = 30000; // 30 segundos

// Intervalo para verificar locks stale
const STALE_CHECK_INTERVAL = 5000; // 5 segundos

/**
 * Inicia verificação periódica de locks stale
 */
function startStaleCheckInterval() {
  setInterval(() => {
    const now = Date.now();
    const staleLocks = [];

    for (const [resourceId, lockData] of locks.entries()) {
      if (lockData.timestamp + lockData.timeout < now) {
        staleLocks.push(resourceId);
      }
    }

    // Remover locks stale
    for (const resourceId of staleLocks) {
      logger.warn('Stale lock removed automatically', { resourceId });
      locks.delete(resourceId);
    }
  }, STALE_CHECK_INTERVAL);
}

// Iniciar verificação de locks stale
startStaleCheckInterval();

/**
 * Gera um ID único para lock
 *
 * @returns {string} ID único em formato hex
 */
function generateLockId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Adquire um lock exclusivo para um recurso
 *
 * @param {string} resource - Identificador único do recurso
 * @param {number} timeout - Timeout em milissegundos (padrão: 30000)
 * @returns {{acquired: boolean, lockId: string, error: string|null}}
 */
function acquireLock(resource, timeout = DEFAULT_LOCK_TIMEOUT) {
  // Validar parâmetros
  if (!resource || typeof resource !== 'string') {
    return {
      acquired: false,
      lockId: null,
      error: 'Identificador de recurso inválido'
    };
  }

  if (typeof timeout !== 'number' || timeout <= 0) {
    return {
      acquired: false,
      lockId: null,
      error: 'Timeout deve ser um número positivo em milissegundos'
    };
  }

  // Limitar timeout máximo (10 minutos)
  const safeTimeout = Math.min(timeout, 600000);

  const resourceId = resource.trim();

  // Verificar se recurso já está locked
  if (locks.has(resourceId)) {
    const existingLock = locks.get(resourceId);
    const now = Date.now();
    const elapsedTime = now - existingLock.timestamp;

    // Verificar se lock expirou
    if (elapsedTime >= existingLock.timeout) {
      // Lock stale, pode remover e retentar
      logger.debug('Stale lock detected, removing', {
        resourceId,
        elapsedTime,
        timeout: existingLock.timeout
      });
      locks.delete(resourceId);
    } else {
      // Lock ainda válido
      logger.debug('Resource already locked', {
        resourceId,
        remainingTime: existingLock.timeout - elapsedTime
      });
      return {
        acquired: false,
        lockId: null,
        error: `Recurso já está em uso. Tente novamente em ${Math.ceil((existingLock.timeout - elapsedTime) / 1000)}s`
      };
    }
  }

  // Criar novo lock
  const lockId = generateLockId();
  const now = Date.now();

  locks.set(resourceId, {
    lockId,
    timestamp: now,
    timeout: safeTimeout
  });

  logger.debug('Lock acquired', {
    resourceId,
    lockId,
    timeoutMs: safeTimeout
  });

  return {
    acquired: true,
    lockId,
    error: null
  };
}

/**
 * Libera um lock
 *
 * @param {string} resource - Identificador do recurso
 * @returns {{released: boolean, error: string|null}}
 */
function releaseLock(resource) {
  // Validar parâmetros
  if (!resource || typeof resource !== 'string') {
    return {
      released: false,
      error: 'Identificador de recurso inválido'
    };
  }

  const resourceId = resource.trim();

  if (!locks.has(resourceId)) {
    logger.warn('Attempted to release non-existent lock', { resourceId });
    return {
      released: false,
      error: 'Lock não existe para este recurso'
    };
  }

  const lockData = locks.get(resourceId);
  locks.delete(resourceId);

  logger.debug('Lock released', {
    resourceId,
    lockId: lockData.lockId,
    heldFor: Date.now() - lockData.timestamp
  });

  return {
    released: true,
    error: null
  };
}

/**
 * Verifica se um recurso está locked
 *
 * @param {string} resource - Identificador do recurso
 * @returns {{locked: boolean, lockInfo: object|null}}
 */
function isLocked(resource) {
  // Validar parâmetros
  if (!resource || typeof resource !== 'string') {
    return {
      locked: false,
      lockInfo: null
    };
  }

  const resourceId = resource.trim();

  if (!locks.has(resourceId)) {
    return {
      locked: false,
      lockInfo: null
    };
  }

  const lockData = locks.get(resourceId);
  const now = Date.now();
  const elapsedTime = now - lockData.timestamp;
  const remainingTime = lockData.timeout - elapsedTime;

  // Verificar se lock expirou
  if (remainingTime <= 0) {
    locks.delete(resourceId);
    return {
      locked: false,
      lockInfo: null
    };
  }

  return {
    locked: true,
    lockInfo: {
      lockId: lockData.lockId,
      elapsedTime,
      remainingTime,
      totalTimeout: lockData.timeout
    }
  };
}

/**
 * Retorna estatísticas de locks
 *
 * @returns {object} Informações sobre locks ativos
 */
function getLockStats() {
  const stats = {
    totalLocks: locks.size,
    resources: []
  };

  const now = Date.now();

  for (const [resourceId, lockData] of locks.entries()) {
    const elapsedTime = now - lockData.timestamp;
    const remainingTime = Math.max(0, lockData.timeout - elapsedTime);

    stats.resources.push({
      resource: resourceId,
      elapsedTime,
      remainingTime,
      timeout: lockData.timeout
    });
  }

  return stats;
}

/**
 * Limpa todos os locks (usar apenas em testes ou reinicialização)
 *
 * @returns {number} Número de locks removidos
 */
function clearAllLocks() {
  const count = locks.size;
  locks.clear();
  logger.warn('All locks cleared', { count });
  return count;
}

module.exports = {
  acquireLock,
  releaseLock,
  isLocked,
  getLockStats,
  clearAllLocks,
  generateLockId
};
