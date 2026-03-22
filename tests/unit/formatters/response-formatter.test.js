/**
 * Tests for response-formatter.js (16 tools consolidadas + 4 bridge)
 * SPEC-WHM-ENHANCE-001 / F01, F06
 */
const { formatToolResponse, TOOL_FORMATTERS } = require('../../../src/lib/formatters/response-formatter');

describe('TOOL_FORMATTERS map', () => {
  test('REQ-F01-010: contem exatamente 16 entries (12 core + 4 bridge)', () => {
    expect(Object.keys(TOOL_FORMATTERS).length).toBe(16);
  });

  test('contem todas as 12 tools core', () => {
    const core = [
      'whm_cpanel_search_hosting_accounts', 'whm_cpanel_manage_hosting_accounts',
      'whm_cpanel_search_server_status', 'whm_cpanel_manage_server_service',
      'whm_cpanel_search_hosted_domains', 'whm_cpanel_manage_hosted_domains', 'whm_cpanel_manage_dnssec_settings',
      'whm_cpanel_search_dns_zone_records', 'whm_cpanel_manage_dns_zone_records',
      'whm_cpanel_manage_system_services',
      'whm_cpanel_search_account_files', 'whm_cpanel_manage_account_files',
    ];
    core.forEach(name => expect(TOOL_FORMATTERS[name]).toBeDefined());
  });

  test('contem 4 bridge tools', () => {
    ['whm_cpanel_list_server_resources', 'whm_cpanel_read_server_resource', 'whm_cpanel_list_server_prompts', 'whm_cpanel_get_analysis_prompt'].forEach(name => {
      expect(TOOL_FORMATTERS[name]).toBeDefined();
    });
  });

  test('NAO contem tools antigas (pre-consolidacao)', () => {
    const oldNames = ['whm_cpanel_list_accounts', 'whm_cpanel_get_account_summary', 'whm_cpanel_list_all_domains'];
    oldNames.forEach(name => expect(TOOL_FORMATTERS[name]).toBeUndefined());
  });
});

describe('formatToolResponse()', () => {
  test('retorna string direto se data ja e string', () => {
    expect(formatToolResponse('any', 'hello')).toBe('hello');
  });

  test('FIX [A1]: unwrap success wrapper', () => {
    const wrapped = { success: true, data: { accounts: [{ user: 'u1', domain: 'd1.com', email: 'a@b.com', plan: 'p', diskused: '1G', suspended: false }] } };
    const result = formatToolResponse('whm_cpanel_search_hosting_accounts', wrapped, { searchType: 'list', limit: 25 });
    expect(result).toContain('| Username |');
    expect(result).not.toContain('"success"');
  });

  test('FIX [G1]: null search -> mensagem amigavel', () => {
    const result = formatToolResponse('whm_cpanel_search_dns_zone_records', null, { searchType: 'zones' });
    expect(result).toContain('Nenhuma zona');
  });

  test('null manage -> empty string', () => {
    expect(formatToolResponse('whm_cpanel_manage_server_service', null, {})).toBe('');
  });

  test('fallback JSON para tool desconhecida', () => {
    expect(formatToolResponse('unknown', { x: 1 }, {})).toContain('"x"');
  });

  test('AC-13: resposta nao excede 400KB', () => {
    const big = { accounts: Array.from({ length: 1000 }, (_, i) => ({ user: `u${i}`, domain: `d${i}.com`, email: `e${i}@t.com`, plan: 'p', diskused: '1G', suspended: false })) };
    const result = formatToolResponse('whm_cpanel_search_hosting_accounts', { success: true, data: big }, { searchType: 'list', limit: 50 });
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThan(400 * 1024);
  });
});

describe('search_accounts formatter routing', () => {
  const mockList = { accounts: [{ user: 'u1', domain: 'd.com', email: 'a@b.com', plan: 'p', diskused: '1G', suspended: false }] };

  test('searchType=list -> tabela contas', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_search_hosting_accounts'](mockList, { searchType: 'list', limit: 25 });
    expect(r).toContain('| Username |');
  });

  test('searchType=summary -> detail', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_search_hosting_accounts']({ user: 'u1', domain: 'd.com' }, { searchType: 'summary' });
    expect(r).toContain('# Conta:');
  });

  test('searchType=domains -> domains list', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_search_hosting_accounts']({ domains: ['d1.com', 'd2.com'] }, { searchType: 'domains' });
    expect(r).toContain('dominios');
  });
});

describe('search_dns formatter routing', () => {
  test('searchType=zones -> tabela zonas', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_search_dns_zone_records']({ zones: [{ domain: 'd.com', type: 'forward' }] }, { searchType: 'zones' });
    expect(r).toContain('| Zona |');
  });

  test('searchType=records -> tabela registros', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_search_dns_zone_records']({ records: [{ name: 'www', type: 'A', address: '1.2.3.4', ttl: 14400 }] }, { searchType: 'records', limit: 25 });
    expect(r).toContain('| Nome |');
  });

  test('searchType=mx_records -> MX list', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_search_dns_zone_records']([{ domain: 'd.com', exchange: 'mail.d.com', preference: 10 }], { searchType: 'mx_records' });
    expect(r).toContain('MX');
  });
});

describe('manage formatters routing', () => {
  test('manage_system get_load -> system load', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_manage_system_services']({ load1: '1.5', load5: '2.0', load15: '1.8' }, { action: 'get_load' });
    expect(r).toContain('Carga do Sistema');
  });

  test('manage_system read_logs -> log lines', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_manage_system_services'](['line1', 'line2'], { action: 'read_logs' });
    expect(r).toContain('linhas de log');
  });

  test('manage_dns create -> dns record detail', () => {
    const r = TOOL_FORMATTERS['whm_cpanel_manage_dns_zone_records']({ name: 'www', type: 'A', address: '1.2.3.4' }, { action: 'create' });
    expect(r).toContain('Registro DNS');
  });
});
