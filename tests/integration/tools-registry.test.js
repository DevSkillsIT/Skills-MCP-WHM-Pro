/**
 * Integration tests for consolidated tools registry
 * SPEC-WHM-ENHANCE-001 / F02, F06, F10
 */
const MCPHandler = require('../../src/mcp-handler');
const { toolDefinitions } = MCPHandler;

describe('AC-03: Tool count = 16', () => {
  test('total de 16 tools (12 core + 4 bridge)', () => {
    expect(toolDefinitions.length).toBe(16);
  });

  test('12 tools core com prefixo search_/manage_', () => {
    const core = toolDefinitions.filter(t =>
      (t.name.includes('search_') || t.name.includes('manage_')) && !t.name.includes('list_resources') && !t.name.includes('read_resource') && !t.name.includes('list_prompts') && !t.name.includes('get_prompt')
    );
    expect(core.length).toBe(12);
  });

  test('4 bridge tools', () => {
    const bridge = toolDefinitions.filter(t =>
      ['whm_cpanel_list_server_resources', 'whm_cpanel_read_server_resource', 'whm_cpanel_list_server_prompts', 'whm_cpanel_get_analysis_prompt'].includes(t.name)
    );
    expect(bridge.length).toBe(4);
  });
});

describe('AC-05: Annotations completas', () => {
  test('TODAS as 16 tools possuem annotations com 4 propriedades', () => {
    toolDefinitions.forEach(tool => {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
      expect(typeof tool.annotations.destructiveHint).toBe('boolean');
      expect(typeof tool.annotations.openWorldHint).toBe('boolean');
      expect(typeof tool.annotations.idempotentHint).toBe('boolean');
    });
  });

  test('AC-05a: search_ tools tem readOnlyHint=true', () => {
    const searches = toolDefinitions.filter(t => t.name.includes('search_'));
    searches.forEach(tool => {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.annotations.idempotentHint).toBe(true);
    });
  });

  test('AC-19: tools com delete tem destructiveHint=true', () => {
    const destructive = ['whm_cpanel_manage_hosting_accounts', 'whm_cpanel_manage_hosted_domains', 'whm_cpanel_manage_dns_zone_records', 'whm_cpanel_manage_account_files'];
    destructive.forEach(name => {
      const tool = toolDefinitions.find(t => t.name === name);
      expect(tool.annotations.destructiveHint).toBe(true);
    });
  });

  test('manage_server e manage_dnssec NAO sao destrutivos', () => {
    ['whm_cpanel_manage_server_service', 'whm_cpanel_manage_dnssec_settings'].forEach(name => {
      const tool = toolDefinitions.find(t => t.name === name);
      expect(tool.annotations.destructiveHint).toBe(false);
    });
  });

  test('bridge tools list_resources e list_prompts sao locais (openWorldHint=false)', () => {
    ['whm_cpanel_list_server_resources', 'whm_cpanel_list_server_prompts'].forEach(name => {
      const tool = toolDefinitions.find(t => t.name === name);
      expect(tool.annotations.openWorldHint).toBe(false);
    });
  });
});

describe('AC-09: Paginacao defaults', () => {
  test('search_accounts limit default=25', () => {
    const tool = toolDefinitions.find(t => t.name === 'whm_cpanel_search_hosting_accounts');
    expect(tool.inputSchema.properties.limit.default).toBe(25);
  });

  test('search_domains limit default=25', () => {
    const tool = toolDefinitions.find(t => t.name === 'whm_cpanel_search_hosted_domains');
    expect(tool.inputSchema.properties.limit.default).toBe(25);
  });

  test('search_dns max_records default=25', () => {
    const tool = toolDefinitions.find(t => t.name === 'whm_cpanel_search_dns_zone_records');
    expect(tool.inputSchema.properties.max_records.default).toBe(25);
  });
});

describe('F06: additionalProperties e enums', () => {
  test('TODAS as tools tem additionalProperties:false', () => {
    toolDefinitions.forEach(tool => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });
  });

  test('search_ tools tem enum para searchType/type', () => {
    const searchAccounts = toolDefinitions.find(t => t.name === 'whm_cpanel_search_hosting_accounts');
    expect(searchAccounts.inputSchema.properties.searchType.enum).toEqual(['list', 'summary', 'domains']);

    const searchDns = toolDefinitions.find(t => t.name === 'whm_cpanel_search_dns_zone_records');
    expect(searchDns.inputSchema.properties.searchType.enum).toContain('zones');
    expect(searchDns.inputSchema.properties.searchType.enum).toContain('records');
  });

  test('manage_ tools tem enum para action', () => {
    const manageAccounts = toolDefinitions.find(t => t.name === 'whm_cpanel_manage_hosting_accounts');
    expect(manageAccounts.inputSchema.properties.action.enum).toEqual(['create', 'suspend', 'unsuspend', 'delete']);
  });
});

describe('F10: Descricoes mencionam Retorna Markdown', () => {
  test('TODAS as 16 tools mencionam Markdown na descricao', () => {
    toolDefinitions.forEach(tool => {
      expect(tool.description.toLowerCase()).toContain('markdown');
    });
  });
});

describe('F11: Protocol version', () => {
  test('initialize retorna protocolVersion 2025-11-25', async () => {
    const handler = new MCPHandler();
    const result = await handler.handleRequest({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} });
    expect(result.result.protocolVersion).toBe('2025-11-25');
    expect(result.result.serverInfo.version).toBe('2.0.0');
    expect(result.result.capabilities.resources).toBeDefined();
    expect(result.result.instructions).toBeDefined();
    expect(result.result.instructions.length).toBeGreaterThan(100);
    expect(result.result.instructions.length).toBeLessThan(2000);
  });
});

describe('F06: TOOL_ALIASES backward compatibility', () => {
  test('aliases redirecionam tools antigas para consolidadas', async () => {
    const handler = new MCPHandler();
    // Chamar tool antiga deve resolver para a nova (mas falhar pois whmService=null)
    const result = await handler.handleRequest({
      jsonrpc: '2.0', method: 'tools/call', id: 1,
      params: { name: 'whm_cpanel_list_accounts', arguments: {} }
    });
    // Deve ter tentado executar (e falhar com WHM service not configured, nao tool not found)
    const text = result.result?.content?.[0]?.text || result.error?.message || '';
    expect(text).not.toContain('Tool not found');
  });
});

describe('F07: Resources', () => {
  test('resources/list retorna 2+ resources com URIs whm://', async () => {
    const handler = new MCPHandler();
    const result = await handler.handleRequest({ jsonrpc: '2.0', method: 'resources/list', id: 1, params: {} });
    expect(result.result.resources.length).toBeGreaterThanOrEqual(2);
    result.result.resources.forEach(r => {
      expect(r.uri).toMatch(/^whm:\/\//);
      expect(r.mimeType).toBe('text/markdown');
    });
  });
});
