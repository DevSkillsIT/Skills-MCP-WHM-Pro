/**
 * NSEC3 Async Handler - Gerenciamento de operações NSEC3 assíncronas (CC-03)
 *
 * Implementa:
 * - Cálculo dinâmico de timeout baseado no número de domínios
 * - Geração de IDs únicos para operações
 * - Rastreamento de status de operações assíncronas
 * - Atualização de progresso com callbacks
 * - Armazenamento em memória de operações
 */

const crypto = require('crypto');
const logger = require('./logger');

// Constantes de timeout NSEC3
const BASE_TIMEOUT_MS = 60000;        // 60 segundos
const DOMAIN_TIMEOUT_MS = 30000;      // 30 segundos por domínio
const MAX_TIMEOUT_MS = 600000;        // 10 minutos máximo

// Estados possíveis de operação
const OPERATION_STATES = {
  QUEUED: 'queued',           // Operação na fila, aguardando início
  IN_PROGRESS: 'in_progress', // Operação em execução
  COMPLETED: 'completed',     // Operação completada com sucesso
  FAILED: 'failed',           // Operação falhou
  CANCELLED: 'cancelled'      // Operação cancelada
};

// Armazenamento de operações em memória
// Estrutura: { operationId: { type, domains, status, progress, result, error, timeout, startedAt, completedAt } }
const operations = new Map();

// Callbacks de progresso (para notificações em tempo real)
const progressCallbacks = new Map();

/**
 * Calcula o timeout dinâmico para operação NSEC3
 *
 * Fórmula: 60s + (30s * número_domínios), máximo 600s
 *
 * @param {array} domains - Lista de domínios a processar
 * @returns {number} Timeout em milissegundos
 */
function calculateNsec3Timeout(domains) {
  // Validar parâmetros
  if (!Array.isArray(domains)) {
    logger.warn('calculateNsec3Timeout: invalid domains parameter');
    return BASE_TIMEOUT_MS;
  }

  // Contar domínios válidos
  const validDomains = domains.filter(d => d && typeof d === 'string' && d.length > 0);
  const domainCount = validDomains.length;

  // Calcular timeout: 60s + (30s * domínios)
  const calculatedTimeout = BASE_TIMEOUT_MS + (DOMAIN_TIMEOUT_MS * domainCount);

  // Limitar ao máximo
  const finalTimeout = Math.min(calculatedTimeout, MAX_TIMEOUT_MS);

  logger.debug('NSEC3 timeout calculated', {
    domainCount,
    calculatedMs: calculatedTimeout,
    finalMs: finalTimeout
  });

  return finalTimeout;
}

/**
 * Gera um ID único para operação
 *
 * @returns {string} ID em formato hex
 */
function generateOperationId() {
  return `nsec3_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Inicia uma operação NSEC3 assíncrona
 *
 * @param {string} operationId - ID da operação (se vazio, gera novo)
 * @param {string} type - Tipo de operação (create, update, delete, recalc, etc)
 * @param {array} domains - Lista de domínios a processar
 * @returns {{operationId: string, status: string, timeout: number, error: string|null}}
 */
function startAsyncOperation(operationId = null, type, domains) {
  // Validar parâmetros
  if (!type || typeof type !== 'string') {
    logger.warn('startAsyncOperation: invalid operation type');
    return {
      operationId: null,
      status: null,
      timeout: null,
      error: 'Tipo de operação inválido'
    };
  }

  if (!Array.isArray(domains) || domains.length === 0) {
    logger.warn('startAsyncOperation: invalid domains', { type });
    return {
      operationId: null,
      status: null,
      timeout: null,
      error: 'Lista de domínios inválida ou vazia'
    };
  }

  // Gerar ID se não fornecido
  const finalOperationId = operationId || generateOperationId();

  // Verificar se operação já existe
  if (operations.has(finalOperationId)) {
    logger.warn('startAsyncOperation: operation already exists', {
      operationId: finalOperationId
    });
    return {
      operationId: finalOperationId,
      status: null,
      timeout: null,
      error: 'Operação com esse ID já existe'
    };
  }

  // Calcular timeout
  const timeout = calculateNsec3Timeout(domains);

  // Criar objeto de operação
  const operation = {
    operationId: finalOperationId,
    type: type.toLowerCase(),
    domains: [...domains],
    status: OPERATION_STATES.QUEUED,
    progress: 0,
    result: null,
    error: null,
    timeout,
    startedAt: Date.now(),
    completedAt: null,
    totalSteps: domains.length,
    completedSteps: 0
  };

  // Armazenar operação
  operations.set(finalOperationId, operation);

  logger.info('NSEC3 operation started', {
    operationId: finalOperationId,
    type,
    domainCount: domains.length,
    timeoutMs: timeout
  });

  return {
    operationId: finalOperationId,
    status: OPERATION_STATES.QUEUED,
    timeout,
    error: null
  };
}

/**
 * Retorna o status atual de uma operação
 *
 * @param {string} operationId - ID da operação
 * @returns {{status: string, progress: number, result: object|null, error: string|null}}
 */
function getOperationStatus(operationId) {
  // Validar parâmetro
  if (!operationId || typeof operationId !== 'string') {
    return {
      status: null,
      progress: 0,
      result: null,
      error: 'ID de operação inválido'
    };
  }

  const opId = operationId.trim();

  // Verificar se operação existe
  if (!operations.has(opId)) {
    logger.debug('Operation not found', { operationId: opId });
    return {
      status: null,
      progress: 0,
      result: null,
      error: 'Operação não encontrada'
    };
  }

  const operation = operations.get(opId);

  // Verificar timeout
  const elapsed = Date.now() - operation.startedAt;
  if (operation.status === OPERATION_STATES.IN_PROGRESS && elapsed > operation.timeout) {
    operation.status = OPERATION_STATES.FAILED;
    operation.error = 'Operação expirou (timeout)';
    operation.completedAt = Date.now();
    logger.warn('Operation timeout detected', { operationId: opId });
  }

  return {
    status: operation.status,
    progress: operation.progress,
    completedSteps: operation.completedSteps,
    totalSteps: operation.totalSteps,
    elapsed: Date.now() - operation.startedAt,
    timeout: operation.timeout,
    result: operation.result,
    error: operation.error
  };
}

/**
 * Atualiza o progresso de uma operação
 *
 * @param {string} operationId - ID da operação
 * @param {number} progress - Progresso em porcentagem (0-100)
 * @param {object} statusData - Dados adicionais de status
 * @returns {{updated: boolean, error: string|null}}
 */
function updateOperationProgress(operationId, progress, statusData = {}) {
  // Validar parâmetros
  if (!operationId || typeof operationId !== 'string') {
    return {
      updated: false,
      error: 'ID de operação inválido'
    };
  }

  if (typeof progress !== 'number' || progress < 0 || progress > 100) {
    return {
      updated: false,
      error: 'Progresso deve ser um número entre 0 e 100'
    };
  }

  const opId = operationId.trim();

  // Verificar se operação existe
  if (!operations.has(opId)) {
    logger.warn('Cannot update progress: operation not found', {
      operationId: opId
    });
    return {
      updated: false,
      error: 'Operação não encontrada'
    };
  }

  const operation = operations.get(opId);

  // Atualizar status
  operation.progress = progress;

  // Atualizar passos completados se fornecido
  if (typeof statusData.completedSteps === 'number') {
    operation.completedSteps = statusData.completedSteps;
  }

  // Se operação ainda está queued e recebeu update, mover para in_progress
  if (operation.status === OPERATION_STATES.QUEUED && progress > 0) {
    operation.status = OPERATION_STATES.IN_PROGRESS;
    logger.debug('Operation moved to IN_PROGRESS', { operationId: opId });
  }

  // Se chegou a 100%, marcar como completa
  if (progress === 100 && operation.status === OPERATION_STATES.IN_PROGRESS) {
    operation.status = OPERATION_STATES.COMPLETED;
    operation.completedAt = Date.now();
    operation.result = statusData.result || {};
    logger.info('Operation completed', {
      operationId: opId,
      duration: operation.completedAt - operation.startedAt
    });
  }

  logger.debug('Operation progress updated', {
    operationId: opId,
    progress,
    completedSteps: operation.completedSteps
  });

  // Chamar callbacks de progresso se registrados
  if (progressCallbacks.has(opId)) {
    const callbacks = progressCallbacks.get(opId);
    callbacks.forEach(callback => {
      try {
        callback({
          operationId: opId,
          progress,
          status: operation.status
        });
      } catch (error) {
        logger.error('Error in progress callback', {
          operationId: opId,
          error: error.message
        });
      }
    });
  }

  return {
    updated: true,
    error: null
  };
}

/**
 * Marca uma operação como falhada
 *
 * @param {string} operationId - ID da operação
 * @param {string} errorMessage - Mensagem de erro
 * @returns {{updated: boolean, error: string|null}}
 */
function failOperation(operationId, errorMessage) {
  // Validar parâmetros
  if (!operationId || typeof operationId !== 'string') {
    return {
      updated: false,
      error: 'ID de operação inválido'
    };
  }

  const opId = operationId.trim();

  // Verificar se operação existe
  if (!operations.has(opId)) {
    return {
      updated: false,
      error: 'Operação não encontrada'
    };
  }

  const operation = operations.get(opId);

  operation.status = OPERATION_STATES.FAILED;
  operation.error = errorMessage || 'Operação falhou sem detalhes de erro';
  operation.completedAt = Date.now();

  logger.error('Operation failed', {
    operationId: opId,
    error: operation.error
  });

  return {
    updated: true,
    error: null
  };
}

/**
 * Registra callback para receber atualizações de progresso
 *
 * @param {string} operationId - ID da operação
 * @param {function} callback - Função a chamar com atualizações
 * @returns {{registered: boolean}}
 */
function onOperationProgress(operationId, callback) {
  if (!operationId || typeof operationId !== 'string') {
    return { registered: false };
  }

  if (typeof callback !== 'function') {
    return { registered: false };
  }

  const opId = operationId.trim();

  if (!progressCallbacks.has(opId)) {
    progressCallbacks.set(opId, []);
  }

  progressCallbacks.get(opId).push(callback);

  return { registered: true };
}

/**
 * Retorna estatísticas de operações
 *
 * @returns {object} Informações sobre operações
 */
function getOperationStats() {
  let queued = 0;
  let inProgress = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;

  for (const op of operations.values()) {
    switch (op.status) {
      case OPERATION_STATES.QUEUED:
        queued++;
        break;
      case OPERATION_STATES.IN_PROGRESS:
        inProgress++;
        break;
      case OPERATION_STATES.COMPLETED:
        completed++;
        break;
      case OPERATION_STATES.FAILED:
        failed++;
        break;
      case OPERATION_STATES.CANCELLED:
        cancelled++;
        break;
    }
  }

  return {
    total: operations.size,
    queued,
    inProgress,
    completed,
    failed,
    cancelled
  };
}

/**
 * Limpa operações antigas (completadas há mais de N minutos)
 *
 * @param {number} maxAgeMinutes - Idade máxima em minutos
 * @returns {number} Número de operações limpas
 */
function cleanupOldOperations(maxAgeMinutes = 60) {
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  const now = Date.now();
  let removed = 0;

  const toRemove = [];

  for (const [opId, op] of operations.entries()) {
    // Só limpar operações completas (não in_progress)
    if (op.status === OPERATION_STATES.IN_PROGRESS || op.status === OPERATION_STATES.QUEUED) {
      continue;
    }

    // Verificar idade da operação completada
    if (op.completedAt) {
      const age = now - op.completedAt;
      if (age > maxAgeMs) {
        toRemove.push(opId);
      }
    }
  }

  for (const opId of toRemove) {
    operations.delete(opId);
    progressCallbacks.delete(opId);
    removed++;
  }

  if (removed > 0) {
    logger.debug('Old operations cleaned up', {
      removed,
      maxAgeMinutes
    });
  }

  return removed;
}

/**
 * Limpa todas as operações (usar apenas em testes)
 *
 * @returns {number} Número de operações removidas
 */
function clearAllOperations() {
  const count = operations.size;
  operations.clear();
  progressCallbacks.clear();
  logger.warn('All operations cleared', { count });
  return count;
}

module.exports = {
  calculateNsec3Timeout,
  generateOperationId,
  startAsyncOperation,
  getOperationStatus,
  updateOperationProgress,
  failOperation,
  onOperationProgress,
  getOperationStats,
  cleanupOldOperations,
  clearAllOperations,
  OPERATION_STATES,
  BASE_TIMEOUT_MS,
  DOMAIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS
};
