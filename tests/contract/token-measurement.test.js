/**
 * Contract tests — Token measurement para 16 tools consolidadas
 * SPEC-WHM-ENHANCE-001 / F01, F03
 * AC-12: Reducao de tokens >= 40% (list tools)
 * AC-13: Nenhuma resposta > 400KB
 */
const { formatToolResponse } = require('../../src/lib/formatters/response-formatter');
const { paginate } = require('../../src/lib/formatters/markdown-helpers');

describe('AC-12: Token Reduction >= 40%', () => {
  test('search_accounts: Markdown 40%+ menor que JSON', () => {
    const accounts = Array.from({ length: 25 }, (_, i) => ({
      user: `user${i}`, domain: `domain${i}.com`, email: `user${i}@domain${i}.com`,
      plan: 'default', diskused: '500M', disklimit: '5000M', bwlimit: 'unlimited',
      ip: '192.168.1.1', suspended: i % 5 === 0, suspendreason: i % 5 === 0 ? 'Teste' : null
    }));
    const wrapped = { success: true, data: { accounts, total: 25 } };
    const jsonSize = JSON.stringify(wrapped, null, 2).length;
    const mdResult = formatToolResponse('whm_cpanel_search_hosting_accounts', wrapped, { searchType: 'list', limit: 25 });
    expect(mdResult.length).toBeLessThan(jsonSize * 0.6);
  });

  test('search_dns records: Markdown 40%+ menor que JSON', () => {
    const records = Array.from({ length: 50 }, (_, i) => ({
      name: `record${i}.example.com`, type: 'A', address: `192.168.1.${i}`, ttl: 14400, line: i + 1
    }));
    const wrapped = { success: true, data: { records } };
    const jsonSize = JSON.stringify(wrapped, null, 2).length;
    const mdResult = formatToolResponse('whm_cpanel_search_dns_zone_records', wrapped, { searchType: 'records', limit: 25 });
    expect(mdResult.length).toBeLessThan(jsonSize * 0.6);
  });

  test('search_domains: Markdown 40%+ menor que JSON', () => {
    const domains = Array.from({ length: 30 }, (_, i) => ({
      domain: `domain${i}.com.br`, user: `user${i}`, documentroot: `/home/user${i}/public_html`, type: 'main'
    }));
    const wrapped = { success: true, data: { domains } };
    const jsonSize = JSON.stringify(wrapped, null, 2).length;
    const mdResult = formatToolResponse('whm_cpanel_search_hosted_domains', wrapped, { searchType: 'all', limit: 25 });
    expect(mdResult.length).toBeLessThan(jsonSize * 0.6);
  });
});

describe('AC-13: Response Size < 400KB', () => {
  test('search_accounts paginado nao excede 400KB', () => {
    const accounts = Array.from({ length: 500 }, (_, i) => ({
      user: `user${i}`, domain: `domain${i}.com`, email: `e${i}@t.com`, plan: 'default', diskused: '500M', suspended: false
    }));
    const result = formatToolResponse('whm_cpanel_search_hosting_accounts', { success: true, data: { accounts } }, { searchType: 'list', limit: 50 });
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThan(400 * 1024);
  });

  test('search_dns records paginado nao excede 400KB', () => {
    const records = Array.from({ length: 500 }, (_, i) => ({
      name: `record${i}.example.com`, type: 'A', address: `10.0.${Math.floor(i/256)}.${i%256}`, ttl: 14400, line: i + 1
    }));
    const result = formatToolResponse('whm_cpanel_search_dns_zone_records', { success: true, data: { records } }, { searchType: 'records', limit: 25 });
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThan(400 * 1024);
  });

  test('paginate() cap em 50 previne explosao', () => {
    const items = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
    const paged = paginate(items, 999);
    expect(paged.items.length).toBe(50);
  });
});

describe('Detail tools formato correto', () => {
  test('manage_system get_load: Markdown estruturado', () => {
    const data = { success: true, data: { load1: '1.5', load5: '2.0', load15: '1.8', memTotal: '16G', memFree: '8G' } };
    const result = formatToolResponse('whm_cpanel_manage_system_services', data, { action: 'get_load' });
    expect(result).toContain('# Carga do Sistema');
    expect(result).toContain('| Metrica | Valor |');
    expect(result).toContain('1.5');
  });
});
