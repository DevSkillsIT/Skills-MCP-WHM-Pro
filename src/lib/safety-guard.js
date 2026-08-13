/**
 * Safety Guard - Prevencao de operacoes destrutivas sem confirmacao humana.
 *
 * Objetivo: evitar que uma IA "alucine" e dispare comandos de delete/reset/write
 * sem acoes explicitas do operador humano.
 *
 * Duas camadas de token aceitas (nesta ordem de precedencia):
 *   1) Token HMAC assinado pela plataforma chamadora pos-HITL (formato
 *      `hitl-<remote_tool_name>-<tsUnixSeconds>-<hmacSha256Hex>`): prova de
 *      AUTORIZACAO por assinatura + janela de validade (TTL) que tolera o atraso
 *      real da aprovacao HITL (multi-card pode levar minutos). Camada preferida.
 *      O token e vinculado a tool para a qual foi assinado (`hitl.tool`) e so e
 *      aceito na chamada daquela mesma tool.
 *   2) Token estatico compartilhado `MCP_SAFETY_TOKEN` (comportamento legado,
 *      retrocompativel): igualdade timing-safe.
 *
 * A camada 1 e a que o orquestrador (plataforma chamadora) injeta de fato: ele
 * assina `HMAC_SHA256(<segredo do orquestrador>, "<remote_tool_name>:<ts>")` no
 * momento da execucao (resume pos-aprovacao). Para a camada 1 funcionar,
 * `MCP_SAFETY_HMAC_SECRET` aqui DEVE ser igual ao segredo de assinatura usado
 * pelo orquestrador.
 */

const crypto = require('crypto');
const logger = require('./logger');

const DEFAULT_REASON_MIN_LENGTH = 10;
// Janela de validade do token HMAC HITL. Generosa de proposito: a aprovacao
// HITL pode levar minutos (ex: aprovacao granular de varios cards). NAO e um
// bypass — o token continua exigindo assinatura valida da plataforma; o TTL so
// tolera o atraso humano. Ajustavel via MCP_SAFETY_HITL_TTL_SECONDS.
const DEFAULT_HITL_TTL_SECONDS = 900; // 15 minutos
// Tolerancia de relogio para tokens com timestamp no futuro. Deliberadamente
// pequena: nao e o mesmo mecanismo do TTL de atraso HITL (que so se aplica ao
// passado). Um valor grande aqui dobraria a janela de aceitacao efetiva.
const CLOCK_SKEW_SECONDS = 60;
const HITL_TOKEN_PREFIX = 'hitl-';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

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
 * Verifica um token HMAC assinado pela plataforma (camada 1).
 *
 * Formato: `hitl-<remote_tool_name>-<tsUnixSeconds>-<hmacSha256Hex>`
 * Assinatura esperada: HMAC_SHA256(MCP_SAFETY_HMAC_SECRET, `<tool>:<ts>`)
 *
 * O parsing e feito pela DIREITA (assinatura -> ts -> tool) para ser robusto a
 * `-` no nome da tool. A verificacao e apenas de autenticidade + frescor; nao
 * vincula os argumentos especificos (zone/line), pois o token prova que a
 * plataforma autorizou a chamada desta tool ha pouco (pos-HITL).
 *
 * @returns {{ok: boolean, reason?: string, tool?: string, ts?: number, age?: number}}
 */
function verifyHitlSignedToken(providedToken) {
  const secret = process.env.MCP_SAFETY_HMAC_SECRET;
  if (!secret) {
    return { ok: false, reason: 'hmac_secret_not_configured' };
  }
  if (typeof providedToken !== 'string' || !providedToken.startsWith(HITL_TOKEN_PREFIX)) {
    return { ok: false, reason: 'not_hitl_format' };
  }

  // Parse pela direita: <...>-<ts>-<sig>
  const lastDash = providedToken.lastIndexOf('-');
  if (lastDash <= HITL_TOKEN_PREFIX.length) {
    return { ok: false, reason: 'malformed' };
  }
  const sig = providedToken.slice(lastDash + 1);
  const rest = providedToken.slice(0, lastDash); // hitl-<tool>-<ts>
  const tsDash = rest.lastIndexOf('-');
  if (tsDash <= HITL_TOKEN_PREFIX.length - 1) {
    return { ok: false, reason: 'malformed' };
  }
  const tsStr = rest.slice(tsDash + 1);
  const tool = rest.slice(HITL_TOKEN_PREFIX.length, tsDash);

  if (!SHA256_HEX_RE.test(sig) || !/^[0-9]+$/.test(tsStr) || !tool) {
    return { ok: false, reason: 'malformed' };
  }
  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'malformed' };
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${tool}:${ts}`)
    .digest('hex');

  // Comparacao timing-safe (ambos hex minusculo, mesmo comprimento).
  if (!tokensMatch(sig.toLowerCase(), expectedSig.toLowerCase())) {
    return { ok: false, reason: 'bad_signature' };
  }

  const ttl = parseInt(
    process.env.MCP_SAFETY_HITL_TTL_SECONDS || String(DEFAULT_HITL_TTL_SECONDS),
    10
  );
  const effectiveTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_HITL_TTL_SECONDS;
  const nowSec = Math.floor(Date.now() / 1000);
  const age = nowSec - ts;
  // Tolera o atraso real da aprovacao HITL para o passado (+ttl) e apenas um
  // pequeno skew de relogio para o futuro (-CLOCK_SKEW_SECONDS).
  if (age > effectiveTtl || age < -CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'expired', tool, ts, age };
  }

  return { ok: true, tool, ts, age };
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
  const hmacSecret = process.env.MCP_SAFETY_HMAC_SECRET;
  if (!expectedToken && !hmacSecret) {
    throw new Error(
      'Safety guard token not configured. Defina MCP_SAFETY_TOKEN e/ou MCP_SAFETY_HMAC_SECRET.'
    );
  }

  const providedToken = args.confirmationToken || args.safetyToken;
  if (!providedToken) {
    throw new Error(`confirmationToken obrigatório para ${action}. Use MCP_SAFETY_TOKEN.`);
  }

  let authMethod;
  let hitl;

  // Camada 1 (preferida): token HMAC assinado pela plataforma pos-HITL.
  if (typeof providedToken === 'string' && providedToken.startsWith(HITL_TOKEN_PREFIX)) {
    hitl = verifyHitlSignedToken(providedToken);
    if (!hitl.ok) {
      if (hitl.reason === 'expired') {
        logger.warn('HITL-signed token rejected (expired)', {
          action,
          tool: hitl.tool,
          tokenAgeSeconds: hitl.age
        });
        throw new Error(
          'confirmationToken expirado para operação de alto risco (aprovação HITL fora da janela)'
        );
      }
      // bad_signature / malformed / hmac_secret_not_configured / not_hitl_format
      throw new Error('confirmationToken inválido para operação de alto risco');
    }
    // Vincula o token a acao: um token assinado para a tool X nao pode ser
    // reaproveitado para autorizar a tool Y (evita reuso cruzado do mesmo
    // token entre diferentes operacoes guardadas).
    if (hitl.tool !== action) {
      logger.warn('HITL-signed token rejected (tool mismatch)', {
        action,
        tokenTool: hitl.tool
      });
      throw new Error('confirmationToken inválido para operação de alto risco');
    }
    authMethod = 'hitl-signed';
  } else {
    // Camada 2 (legado, retrocompativel): token estatico compartilhado.
    if (!expectedToken || !tokensMatch(providedToken, expectedToken)) {
      throw new Error('confirmationToken inválido para operação de alto risco');
    }
    authMethod = 'static';
  }

  const reason = (args.reason || '').trim();
  if (reason.length < DEFAULT_REASON_MIN_LENGTH) {
    throw new Error('É obrigatório informar um motivo (>=10 caracteres) para operações destrutivas');
  }

  // O log de autorizacao so e emitido APOS todas as validacoes passarem
  // (incluindo o motivo), para que chamadas rejeitadas nunca apareçam na
  // auditoria como "authorized".
  if (authMethod === 'hitl-signed') {
    logger.warn('High-risk action authorized (HITL-signed token)', {
      action,
      tool: hitl.tool,
      tokenAgeSeconds: hitl.age,
      initiator: args.initiator || 'hitl',
      reason
    });
  } else {
    logger.warn('High-risk action authorized (static token)', {
      action,
      initiator: args.initiator || 'unknown',
      reason
    });
  }
}

module.exports = {
  requireConfirmation,
  // Exportado para testes/reproducao (verificacao isolada do token HMAC HITL).
  verifyHitlSignedToken
};
