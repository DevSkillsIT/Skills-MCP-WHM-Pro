/**
 * Safety Guard - Prevencao de operacoes destrutivas sem confirmacao humana.
 *
 * Objetivo: evitar que uma IA "alucine" e dispare comandos de delete/reset/write
 * sem acoes explicitas do operador humano.
 */

const crypto = require('crypto');
const logger = require('./logger');

const DEFAULT_REASON_MIN_LENGTH = 10;

/**
 * Verifica se a feature esta habilitada.
 */
function isGuardEnabled() {
  const mode = (process.env.MCP_SAFETY_GUARD || 'on').toLowerCase();
  return mode !== 'off';
}

/**
 * Comparacao timing-safe entre tokens.
 */
function tokensMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Requer confirmacao para operacoes destrutivas.
 *
 * @param {string} action - Nome da acao (ex: dns.delete_record)
 * @param {object} args - Argumentos da tool (precisa conter confirmationToken e reason)
 */
function requireConfirmation(action, args = {}) {
  if (!isGuardEnabled()) {
    // Guard desabilitado explicitamente. Logamos aviso para auditoria.
    logger.warn('Safety guard disabled via MCP_SAFETY_GUARD', { action });
    return;
  }

  const expectedToken = process.env.MCP_SAFETY_TOKEN;
  if (!expectedToken) {
    throw new Error('Safety guard token not configured. Defina MCP_SAFETY_TOKEN.');
  }

  const providedToken = args.confirmationToken || args.safetyToken;
  if (!providedToken) {
    throw new Error(`confirmationToken obrigatório para ${action}. Use MCP_SAFETY_TOKEN.`);
  }

  if (!tokensMatch(providedToken, expectedToken)) {
    throw new Error('confirmationToken inválido para operação de alto risco');
  }

  const reason = (args.reason || '').trim();
  if (reason.length < DEFAULT_REASON_MIN_LENGTH) {
    throw new Error('É obrigatório informar um motivo (>=10 caracteres) para operações destrutivas');
  }

  logger.warn('High-risk action authorized', {
    action,
    reason,
    initiator: args.initiator || 'unknown'
  });
}

module.exports = {
  requireConfirmation
};
