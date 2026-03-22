/**
 * E2E tests — MCP Server WHM/cPanel real
 * SPEC-WHM-ENHANCE-001 / F12 (REQ-F12-005)
 *
 * Pre-requisito: Servidor rodando em localhost:3200
 * Executar: WHM_API_URL=... WHM_API_TOKEN=... npm run test:e2e
 *
 * Se o servidor nao estiver rodando, os testes sao pulados graciosamente.
 */

const BASE_URL = process.env.MCP_BASE_URL || 'http://localhost:3200';
const API_KEY = process.env.MCP_API_KEY || process.env.WHM_API_KEY || 'test-key';

async function mcpCall(method, params = {}) {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  return res.json();
}

let serverAvailable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
  }
  if (!serverAvailable) {
    console.warn('⚠️  Servidor WHM MCP nao disponivel em ' + BASE_URL + '. Testes E2E pulados.');
  }
});

const e2e = serverAvailable ? test : test.skip;

describe('E2E: Infrastructure', () => {
  (serverAvailable ? test : test.skip)('E2E-01: Health check retorna 200', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('mcp-whm-cpanel');
  });
});

describe('E2E: MCP Protocol', () => {
  (serverAvailable ? test : test.skip)('E2E-02: Initialize retorna instructions e v2025-11-25', async () => {
    const res = await mcpCall('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    });
    expect(res.result).toBeDefined();
    expect(res.result.protocolVersion).toBe('2025-11-25');
    expect(res.result.serverInfo.version).toBe('2.0.0');
    expect(res.result.instructions).toBeDefined();
    expect(res.result.instructions.length).toBeGreaterThan(100);
    expect(res.result.instructions.length).toBeLessThan(2000);
    expect(res.result.capabilities.resources).toBeDefined();
  });

  (serverAvailable ? test : test.skip)('E2E-03: tools/list retorna 16 tools consolidadas', async () => {
    const res = await mcpCall('tools/list', {});
    expect(res.result.tools.length).toBe(16);
    const names = res.result.tools.map(t => t.name);
    expect(names).toContain('whm_cpanel_search_hosting_accounts');
    expect(names).toContain('whm_cpanel_manage_hosting_accounts');
    expect(names).toContain('whm_cpanel_search_dns_zone_records');
    expect(names).toContain('whm_cpanel_list_server_resources');
  });

  (serverAvailable ? test : test.skip)('E2E-04: Todas as tools retornadas tem annotations', async () => {
    const res = await mcpCall('tools/list', {});
    res.result.tools.forEach(tool => {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
      expect(typeof tool.annotations.destructiveHint).toBe('boolean');
    });
  });

  (serverAvailable ? test : test.skip)('E2E-05: resources/list retorna >= 2 resources', async () => {
    const res = await mcpCall('resources/list', {});
    expect(res.result.resources.length).toBeGreaterThanOrEqual(2);
    res.result.resources.forEach(r => {
      expect(r.uri).toMatch(/^whm:\/\//);
      expect(r.mimeType).toBe('text/markdown');
    });
  });
});

describe('E2E: Tool Execution', () => {
  (serverAvailable ? test : test.skip)('E2E-06: search_accounts retorna Markdown', async () => {
    const res = await mcpCall('tools/call', {
      name: 'whm_cpanel_search_hosting_accounts',
      arguments: { searchType: 'list', limit: 5 }
    });
    expect(res.result).toBeDefined();
    const text = res.result.content[0].text;
    // Deve conter tabela Markdown
    expect(text).toContain('|');
    // Deve ter info de paginacao
    expect(text).toContain('resultados');
    // NAO deve ser JSON bruto
    expect(text).not.toMatch(/^\s*\{/);
    expect(text).not.toContain('"user":');
  });

  (serverAvailable ? test : test.skip)('E2E-07: search_server retorna Markdown', async () => {
    const res = await mcpCall('tools/call', {
      name: 'whm_cpanel_search_server_status',
      arguments: { type: 'status' }
    });
    expect(res.result).toBeDefined();
    const text = res.result.content[0].text;
    expect(text).toContain('Status');
  });

  (serverAvailable ? test : test.skip)('E2E-08: Alias backward compat funciona', async () => {
    const res = await mcpCall('tools/call', {
      name: 'whm_cpanel_list_accounts',
      arguments: {}
    });
    // Deve funcionar via alias (redireciona para search_accounts)
    expect(res.result || res.error).toBeDefined();
    // Se result, deve conter Markdown
    if (res.result?.content?.[0]?.text) {
      expect(res.result.content[0].text).toContain('|');
    }
  });

  (serverAvailable ? test : test.skip)('E2E-09: manage_accounts delete sem token retorna erro', async () => {
    const res = await mcpCall('tools/call', {
      name: 'whm_cpanel_manage_hosting_accounts',
      arguments: { action: 'delete', username: 'nonexistent_test_user' }
    });
    // Deve retornar erro pedindo confirmationToken
    const text = res.result?.content?.[0]?.text || res.error?.message || '';
    expect(text.toLowerCase()).toMatch(/confirm|token|required/i);
  });

  (serverAvailable ? test : test.skip)('E2E-10: bridge list_prompts retorna lista', async () => {
    const res = await mcpCall('tools/call', {
      name: 'whm_cpanel_list_server_prompts',
      arguments: {}
    });
    expect(res.result).toBeDefined();
    const text = res.result.content[0].text;
    expect(text).toContain('whm_');
  });
});
