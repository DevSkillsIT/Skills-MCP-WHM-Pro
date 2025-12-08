/**
 * Transaction Log - Sistema de log de transações para rollback (CC-06)
 *
 * Implementa:
 * - Registro de transações com backup de estado anterior
 * - Commit de transações (confirmação)
 * - Rollback de transações (reversão ao estado anterior)
 * - Consulta de status de transações
 * - Armazenamento em memória com possibilidade de persistência
 */

const crypto = require('crypto');
const logger = require('./logger');

// Armazenamento de transações em memória
// Estrutura: { transactionId: { operationData, backup, status, timestamp, completedAt } }
const transactions = new Map();

// Estados possíveis de transação
const TRANSACTION_STATES = {
  PENDING: 'pending',      // Transação iniciada, aguardando commit/rollback
  COMMITTED: 'committed',  // Transação confirmada e completada
  ROLLED_BACK: 'rolled_back' // Transação revertida
};

/**
 * Gera um ID único para transação
 *
 * @returns {string} ID em formato hex
 */
function generateTransactionId() {
  return `txn_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Inicia uma nova transação com backup de dados
 *
 * @param {object} operationData - Dados da operação a ser executada
 * @returns {{transactionId: string, status: string, backup: object}}
 */
function beginTransaction(operationData) {
  // Validar parâmetros
  if (!operationData || typeof operationData !== 'object') {
    logger.warn('Transaction begin failed: invalid operation data');
    throw new Error('Dados da operação inválidos');
  }

  // Gerar ID único
  const transactionId = generateTransactionId();

  // Criar backup profundo dos dados
  let backup;
  try {
    backup = JSON.parse(JSON.stringify(operationData));
  } catch (error) {
    logger.error('Failed to create transaction backup', { error: error.message });
    throw new Error('Não foi possível fazer backup dos dados');
  }

  // Registrar transação
  transactions.set(transactionId, {
    operationData: JSON.parse(JSON.stringify(operationData)),
    backup,
    status: TRANSACTION_STATES.PENDING,
    timestamp: Date.now(),
    completedAt: null
  });

  logger.info('Transaction started', {
    transactionId,
    operationType: operationData.type || 'unknown'
  });

  return {
    transactionId,
    status: TRANSACTION_STATES.PENDING,
    backup
  };
}

/**
 * Confirma uma transação como bem-sucedida
 *
 * @param {string} transactionId - ID da transação
 * @returns {{status: string, error: string|null}}
 */
function commitTransaction(transactionId) {
  // Validar parâmetros
  if (!transactionId || typeof transactionId !== 'string') {
    return {
      status: null,
      error: 'ID de transação inválido'
    };
  }

  const txnId = transactionId.trim();

  // Verificar se transação existe
  if (!transactions.has(txnId)) {
    logger.warn('Commit failed: transaction not found', { transactionId: txnId });
    return {
      status: null,
      error: 'Transação não encontrada'
    };
  }

  const txn = transactions.get(txnId);

  // Verificar status
  if (txn.status !== TRANSACTION_STATES.PENDING) {
    logger.warn('Commit failed: transaction not in pending state', {
      transactionId: txnId,
      currentStatus: txn.status
    });
    return {
      status: null,
      error: `Transação não está em estado pendente (status: ${txn.status})`
    };
  }

  // Atualizar status
  txn.status = TRANSACTION_STATES.COMMITTED;
  txn.completedAt = Date.now();

  logger.info('Transaction committed', {
    transactionId: txnId,
    duration: txn.completedAt - txn.timestamp
  });

  return {
    status: TRANSACTION_STATES.COMMITTED,
    error: null
  };
}

/**
 * Reverte uma transação para seu estado anterior (backup)
 *
 * @param {string} transactionId - ID da transação
 * @returns {{status: string, backup: object|null, error: string|null}}
 */
function rollbackTransaction(transactionId) {
  // Validar parâmetros
  if (!transactionId || typeof transactionId !== 'string') {
    return {
      status: null,
      backup: null,
      error: 'ID de transação inválido'
    };
  }

  const txnId = transactionId.trim();

  // Verificar se transação existe
  if (!transactions.has(txnId)) {
    logger.warn('Rollback failed: transaction not found', { transactionId: txnId });
    return {
      status: null,
      backup: null,
      error: 'Transação não encontrada'
    };
  }

  const txn = transactions.get(txnId);

  // Só pode fazer rollback de transações pendentes
  if (txn.status !== TRANSACTION_STATES.PENDING) {
    logger.warn('Rollback failed: transaction not in pending state', {
      transactionId: txnId,
      currentStatus: txn.status
    });
    return {
      status: null,
      backup: null,
      error: `Rollback não é possível para transação em estado: ${txn.status}`
    };
  }

  // Fazer backup dos dados atuais para auditoria
  const backup = JSON.parse(JSON.stringify(txn.backup));

  // Atualizar status
  txn.status = TRANSACTION_STATES.ROLLED_BACK;
  txn.completedAt = Date.now();

  logger.info('Transaction rolled back', {
    transactionId: txnId,
    duration: txn.completedAt - txn.timestamp
  });

  return {
    status: TRANSACTION_STATES.ROLLED_BACK,
    backup,
    error: null
  };
}

/**
 * Consulta o status de uma transação
 *
 * @param {string} transactionId - ID da transação
 * @returns {{status: string|null, data: object|null, error: string|null}}
 */
function getTransactionStatus(transactionId) {
  // Validar parâmetros
  if (!transactionId || typeof transactionId !== 'string') {
    return {
      status: null,
      data: null,
      error: 'ID de transação inválido'
    };
  }

  const txnId = transactionId.trim();

  // Verificar se transação existe
  if (!transactions.has(txnId)) {
    logger.debug('Transaction not found', { transactionId: txnId });
    return {
      status: null,
      data: null,
      error: 'Transação não encontrada'
    };
  }

  const txn = transactions.get(txnId);

  return {
    status: txn.status,
    data: {
      transactionId: txnId,
      status: txn.status,
      operationType: txn.operationData.type || 'unknown',
      startedAt: txn.timestamp,
      completedAt: txn.completedAt,
      duration: txn.completedAt ? txn.completedAt - txn.timestamp : null,
      hasBackup: !!txn.backup
    },
    error: null
  };
}

/**
 * Lista todas as transações ativas (em estado pendente)
 *
 * @returns {array} Array com IDs de transações ativas
 */
function getActiveTransactions() {
  const active = [];

  for (const [txnId, txn] of transactions.entries()) {
    if (txn.status === TRANSACTION_STATES.PENDING) {
      active.push({
        transactionId: txnId,
        operationType: txn.operationData.type || 'unknown',
        startedAt: txn.timestamp,
        duration: Date.now() - txn.timestamp
      });
    }
  }

  return active;
}

/**
 * Limpa transações antigas (mantém apenas as últimas N horas)
 *
 * @param {number} maxAgeHours - Idade máxima em horas (padrão: 24)
 * @returns {number} Número de transações limpas
 */
function cleanupOldTransactions(maxAgeHours = 24) {
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();
  let removed = 0;

  const toRemove = [];

  for (const [txnId, txn] of transactions.entries()) {
    // Só limpar transações completas (committed ou rolled_back)
    if (txn.status === TRANSACTION_STATES.PENDING) {
      continue;
    }

    // Verificar idade
    const age = now - txn.completedAt;
    if (age > maxAgeMs) {
      toRemove.push(txnId);
    }
  }

  for (const txnId of toRemove) {
    transactions.delete(txnId);
    removed++;
  }

  if (removed > 0) {
    logger.debug('Old transactions cleaned up', {
      removed,
      maxAgeHours
    });
  }

  return removed;
}

/**
 * Retorna estatísticas de transações
 *
 * @returns {object} Informações sobre transações
 */
function getTransactionStats() {
  let pending = 0;
  let committed = 0;
  let rolledBack = 0;

  for (const txn of transactions.values()) {
    switch (txn.status) {
      case TRANSACTION_STATES.PENDING:
        pending++;
        break;
      case TRANSACTION_STATES.COMMITTED:
        committed++;
        break;
      case TRANSACTION_STATES.ROLLED_BACK:
        rolledBack++;
        break;
    }
  }

  return {
    total: transactions.size,
    pending,
    committed,
    rolledBack
  };
}

/**
 * Limpa todas as transações (usar apenas em testes)
 *
 * @returns {number} Número de transações removidas
 */
function clearAllTransactions() {
  const count = transactions.size;
  transactions.clear();
  logger.warn('All transactions cleared', { count });
  return count;
}

module.exports = {
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  getTransactionStatus,
  getActiveTransactions,
  cleanupOldTransactions,
  getTransactionStats,
  clearAllTransactions,
  generateTransactionId,
  TRANSACTION_STATES
};
