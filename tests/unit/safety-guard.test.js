const SafetyGuard = require('../../src/lib/safety-guard');

describe('SafetyGuard', () => {
  const originalGuard = process.env.MCP_SAFETY_GUARD;
  const originalToken = process.env.MCP_SAFETY_TOKEN;

  beforeEach(() => {
    process.env.MCP_SAFETY_GUARD = 'on';
    process.env.MCP_SAFETY_TOKEN = 'unit-test-token';
  });

  afterEach(() => {
    if (originalGuard === undefined) {
      delete process.env.MCP_SAFETY_GUARD;
    } else {
      process.env.MCP_SAFETY_GUARD = originalGuard;
    }

    if (originalToken === undefined) {
      delete process.env.MCP_SAFETY_TOKEN;
    } else {
      process.env.MCP_SAFETY_TOKEN = originalToken;
    }
  });

  it('permite operacao quando token e motivo corretos', () => {
    expect(() =>
      SafetyGuard.requireConfirmation('file_delete', {
        confirmationToken: 'unit-test-token',
        reason: 'Remocao solicitada pelo cliente'
      })
    ).not.toThrow();
  });

  it('falha quando token nao foi configurado', () => {
    delete process.env.MCP_SAFETY_TOKEN;

    expect(() =>
      SafetyGuard.requireConfirmation('file_delete', {
        confirmationToken: 'qualquer',
        reason: 'motivo valido'
      })
    ).toThrow(/MCP_SAFETY_TOKEN/);
  });

  it('falha quando token informado e invalido', () => {
    expect(() =>
      SafetyGuard.requireConfirmation('file_delete', {
        confirmationToken: 'token-errado',
        reason: 'motivo qualquer'
      })
    ).toThrow(/confirmationToken inválido/i);
  });

  it('falha quando motivo e muito curto', () => {
    expect(() =>
      SafetyGuard.requireConfirmation('dns_reset_zone', {
        confirmationToken: 'unit-test-token',
        reason: 'curto'
      })
    ).toThrow(/motivo/i);
  });

  it('ignora verificacao quando guard esta desativado', () => {
    process.env.MCP_SAFETY_GUARD = 'off';
    delete process.env.MCP_SAFETY_TOKEN;

    expect(() =>
      SafetyGuard.requireConfirmation('file_delete', {
        confirmationToken: 'qualquer',
        reason: 'nao deveria validar'
      })
    ).not.toThrow();
  });
});
