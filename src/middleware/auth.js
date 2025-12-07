/**
 * Middleware de Autenticacao HTTP (CC-01)
 * Implementa AC01b: Autenticacao Obrigatoria
 *
 * - Header obrigatorio: x-api-key
 * - Formato: sk_whm_mcp_{env}_{random}
 * - Comparacao timing-safe com crypto.timingSafeEqual()
 */

const crypto = require('crypto');
const logger = require('../lib/logger');

/**
 * Valida formato da API Key
 * Formato esperado: sk_whm_mcp_{env}_{random} (minimo 32 caracteres)
 * @param {string} key - API Key a validar
 * @returns {boolean} true se formato valido
 */
function isValidKeyFormat(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Formato: sk_whm_mcp_{env}_{random}
  // Exemplo: REDACTED_API_KEY
  // Aceita hex (a-f0-9) ou alfanumerico (a-z0-9) para flexibilidade
  const pattern = /^sk_whm_mcp_[a-z]+_[a-z0-9]{8,}$/i;
  return pattern.test(key) && key.length >= 24;
}

/**
 * Comparacao timing-safe de API Keys
 * Previne timing attacks
 * @param {string} providedKey - Key fornecida na requisicao
 * @param {string} expectedKey - Key esperada (do .env)
 * @returns {boolean} true se keys sao iguais
 */
function timingSafeCompare(providedKey, expectedKey) {
  if (!providedKey || !expectedKey) {
    return false;
  }

  // Garantir mesmo tamanho para comparacao segura
  const keyBuffer = Buffer.alloc(Math.max(providedKey.length, expectedKey.length));
  const expectedBuffer = Buffer.alloc(Math.max(providedKey.length, expectedKey.length));

  // Copiar keys para buffers
  Buffer.from(providedKey).copy(keyBuffer);
  Buffer.from(expectedKey).copy(expectedBuffer);

  // Se tamanhos diferentes, ja e falso mas continua comparacao
  const lengthMatch = providedKey.length === expectedKey.length;

  // Comparacao timing-safe
  try {
    const match = crypto.timingSafeEqual(keyBuffer, expectedBuffer);
    return match && lengthMatch;
  } catch (err) {
    return false;
  }
}

/**
 * Middleware de autenticacao
 * Verifica header x-api-key em todas as requisicoes (exceto /health e /metrics)
 */
function authMiddleware(req, res, next) {
  // Endpoints que nao requerem autenticacao
  const publicEndpoints = ['/health', '/metrics'];
  if (publicEndpoints.includes(req.path)) {
    return next();
  }

  // Obter API Key do header
  const apiKey = req.headers['x-api-key'];

  // Verificar se header esta presente
  if (!apiKey) {
    logger.warn('Request without x-api-key header', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    return res.status(401).json({
      error: 'Missing x-api-key header',
      message: 'Authentication required. Provide x-api-key header.'
    });
  }

  // Obter key esperada do ambiente
  const expectedKey = process.env.WHM_MCP_API_KEY;

  if (!expectedKey) {
    logger.error('WHM_MCP_API_KEY not configured in environment');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'API Key not configured on server'
    });
  }

  // Validar formato (opcional, mas recomendado)
  if (!isValidKeyFormat(apiKey)) {
    logger.warn('Invalid API Key format', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    return res.status(401).json({
      error: 'Invalid API Key format',
      message: 'API Key must match format: sk_whm_mcp_{env}_{random}'
    });
  }

  // Comparacao timing-safe
  if (!timingSafeCompare(apiKey, expectedKey)) {
    logger.warn('Invalid API Key provided', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    return res.status(401).json({
      error: 'Invalid API Key',
      message: 'The provided API Key is not valid'
    });
  }

  // Autenticacao bem-sucedida
  logger.debug('Authentication successful', {
    path: req.path,
    method: req.method
  });

  next();
}

module.exports = authMiddleware;
module.exports.isValidKeyFormat = isValidKeyFormat;
module.exports.timingSafeCompare = timingSafeCompare;
