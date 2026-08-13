/**
 * Reproducao do BUG 8 (HITL + SafetyGuard):
 *   A plataforma chamadora injeta um confirmationToken HMAC assinado no
 *   formato `hitl-<remote_tool_name>-<ts>-<hmacSha256Hex>`, mas o validador
 *   antigo so aceitava igualdade estatica com MCP_SAFETY_TOKEN => TODA
 *   operacao de alto risco (update/delete/reset_zone) falhava com
 *   "confirmationToken inválido", independente de TTL/atraso.
 *
 * Estes testes:
 *   (RED) provam que um token HMAC assinado era rejeitado quando o validador
 *         so conhece o token estatico (MCP_SAFETY_HMAC_SECRET ausente).
 *   (GREEN) provam que, com MCP_SAFETY_HMAC_SECRET = segredo de assinatura do
 *         orquestrador, o token e ACEITO — inclusive com atraso de aprovacao
 *         de minutos, sem virar bypass (assinatura invalida/expirada => nega).
 */

const crypto = require('crypto');
const SafetyGuard = require('../../src/lib/safety-guard');

const ORCHESTRATOR_SECRET = 'orchestrator-hitl-secret-para-testes-abc123';
const WHM_TOOL = 'whm_cpanel_manage_dns_zone_records';
const OTHER_TOOL = 'whm_cpanel_manage_hosting_accounts';

/** Reproduz o algoritmo de assinatura do orquestrador chamador. */
function buildSignedConfirmationToken(remoteToolName, tsUnixSeconds, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${remoteToolName}:${tsUnixSeconds}`)
    .digest('hex');
  return `hitl-${remoteToolName}-${tsUnixSeconds}-${signature}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe('SafetyGuard - camada HMAC HITL (BUG 8)', () => {
  const snapshot = {
    guard: process.env.MCP_SAFETY_GUARD,
    token: process.env.MCP_SAFETY_TOKEN,
    hmac: process.env.MCP_SAFETY_HMAC_SECRET,
    ttl: process.env.MCP_SAFETY_HITL_TTL_SECONDS
  };

  beforeEach(() => {
    process.env.MCP_SAFETY_GUARD = 'on';
    process.env.MCP_SAFETY_TOKEN = 'sk_static_legacy_token';
    delete process.env.MCP_SAFETY_HMAC_SECRET;
    delete process.env.MCP_SAFETY_HITL_TTL_SECONDS;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries({
      MCP_SAFETY_GUARD: snapshot.guard,
      MCP_SAFETY_TOKEN: snapshot.token,
      MCP_SAFETY_HMAC_SECRET: snapshot.hmac,
      MCP_SAFETY_HITL_TTL_SECONDS: snapshot.ttl
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('RED: sem MCP_SAFETY_HMAC_SECRET, token HMAC assinado e rejeitado (reproduz o bug)', () => {
    // Estado pre-fix: validador so conhece o token estatico.
    const token = buildSignedConfirmationToken(WHM_TOOL, nowSec(), ORCHESTRATOR_SECRET);
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: token,
        reason: 'Atualizar registros DNS aprovado via HITL'
      })
    ).toThrow(/inválido para operação de alto risco/);
  });

  it('GREEN: com o secret compartilhado, token HMAC FRESCO e aceito', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    const token = buildSignedConfirmationToken(WHM_TOOL, nowSec(), ORCHESTRATOR_SECRET);
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: token,
        reason: 'Atualizar registros DNS aprovado via HITL'
      })
    ).not.toThrow();
  });

  it('GREEN: tolera o atraso REAL do HITL (~3min21s) dentro do TTL de 15min', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    // Caso tipico: aprovacao HITL leva alguns minutos. Mesmo que o ts fosse
    // congelado no inicio, 201s < 900s => aceito.
    const tsOld = nowSec() - 201;
    const token = buildSignedConfirmationToken(WHM_TOOL, tsOld, ORCHESTRATOR_SECRET);
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: token,
        reason: 'update CNAME lp.example.com aprovado via HITL'
      })
    ).not.toThrow();
  });

  it('SEGURANCA: token HMAC EXPIRADO (>TTL) e rejeitado (nao vira bypass)', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    process.env.MCP_SAFETY_HITL_TTL_SECONDS = '900';
    const tsExpired = nowSec() - 1000; // > 900s
    const token = buildSignedConfirmationToken(WHM_TOOL, tsExpired, ORCHESTRATOR_SECRET);
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: token,
        reason: 'update DNS aprovado ha muito tempo'
      })
    ).toThrow(/expirado para operação de alto risco/);
  });

  it('SEGURANCA: assinatura adulterada e rejeitada', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    const ts = nowSec();
    // Assinado com secret ERRADO (nao conhece o segredo compartilhado).
    const forged = buildSignedConfirmationToken(WHM_TOOL, ts, 'secret-do-atacante');
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: forged,
        reason: 'tentativa de forjar autorizacao'
      })
    ).toThrow(/inválido para operação de alto risco/);
  });

  it('SEGURANCA: token HMAC valido mas SEM reason (>=10 chars) e rejeitado', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    const token = buildSignedConfirmationToken(WHM_TOOL, nowSec(), ORCHESTRATOR_SECRET);
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: token,
        reason: 'x'
      })
    ).toThrow(/motivo/);
  });

  it('RETROCOMPAT: token estatico legado continua funcionando com HMAC habilitado', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: 'sk_static_legacy_token',
        reason: 'operacao legada via token estatico'
      })
    ).not.toThrow();
  });

  it('verifyHitlSignedToken: parse robusto e frescor (unit direto)', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    const ts = nowSec();
    const token = buildSignedConfirmationToken(WHM_TOOL, ts, ORCHESTRATOR_SECRET);
    const res = SafetyGuard.verifyHitlSignedToken(token);
    expect(res.ok).toBe(true);
    expect(res.tool).toBe(WHM_TOOL);
    expect(res.ts).toBe(ts);
  });

  it('SEGURANCA (bypass de autorizacao): token assinado para a tool A e REJEITADO na tool B', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    // Token minted for WHM_TOOL must not authorize a call to OTHER_TOOL,
    // even though the signature itself is valid and fresh.
    const token = buildSignedConfirmationToken(WHM_TOOL, nowSec(), ORCHESTRATOR_SECRET);
    expect(() =>
      SafetyGuard.requireConfirmation(OTHER_TOOL, {
        confirmationToken: token,
        reason: 'tentativa de reuso do token em outra tool'
      })
    ).toThrow(/inválido para operação de alto risco/);
  });

  it('SEGURANCA (clock skew): token com timestamp 300s no futuro e rejeitado', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    const tsFuture = nowSec() + 300; // muito alem da tolerancia de skew (60s)
    const token = buildSignedConfirmationToken(WHM_TOOL, tsFuture, ORCHESTRATOR_SECRET);
    expect(() =>
      SafetyGuard.requireConfirmation(WHM_TOOL, {
        confirmationToken: token,
        reason: 'token com timestamp no futuro'
      })
    ).toThrow(/expirado para operação de alto risco/);
  });

  it('AUDITORIA: reason curta demais NAO produz log de "authorized"', () => {
    process.env.MCP_SAFETY_HMAC_SECRET = ORCHESTRATOR_SECRET;
    const logger = require('../../src/lib/logger');
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      const token = buildSignedConfirmationToken(WHM_TOOL, nowSec(), ORCHESTRATOR_SECRET);
      expect(() =>
        SafetyGuard.requireConfirmation(WHM_TOOL, {
          confirmationToken: token,
          reason: 'curta'
        })
      ).toThrow(/motivo/);

      const authorizedCalls = warnSpy.mock.calls.filter(([message]) =>
        /authorized/i.test(message)
      );
      expect(authorizedCalls).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
