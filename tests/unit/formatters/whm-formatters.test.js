/**
 * Tests for whm-formatters.js
 * SPEC-WHM-ENHANCE-001 / F01
 */
const {
  formatAccountsList, formatAccountDetail, formatAccountDomains,
  formatServerStatus, formatServicesStatus,
  formatDomainsList, formatDomainDetail,
  formatDnsZonesList, formatDnsRecordsList, formatDnsRecordDetail, formatMxRecordsList,
  formatDnssecInfo,
  formatSystemLoad, formatLogLines,
  formatFilesList, formatFileContent,
  formatOperationResult,
} = require('../../../src/lib/formatters/whm-formatters');

const mockAccounts = {
  items: [
    { user: 'user1', domain: 'test1.com', email: 'a@b.com', plan: 'default', diskused: '500M', suspended: false },
    { user: 'user2', domain: 'test2.com', email: 'c@d.com', plan: 'business', diskused: '1G', suspended: true, suspendreason: 'Teste' }
  ],
  count: 2, total: 2, limit: 25, offset: 0
};

describe('formatAccountsList()', () => {
  test('formata tabela Markdown com accounts', () => {
    const result = formatAccountsList(mockAccounts);
    expect(result).toContain('| Username | Dominio | Email | Plano | Disco | Status |');
    expect(result).toContain('user1');
    expect(result).toContain('Suspensa');
    expect(result).toContain('**2 resultados**');
  });
  test('retorna mensagem amigavel para lista vazia', () => {
    const result = formatAccountsList({ items: [], count: 0, total: 0, limit: 25, offset: 0 });
    expect(result).toBe('Nenhuma conta encontrada.');
  });
});

describe('formatAccountDetail()', () => {
  test('formata detalhe com heading e tabela campo/valor', () => {
    const result = formatAccountDetail({ user: 'test', domain: 'test.com', email: 'a@b.com', plan: 'default', ip: '1.2.3.4' });
    expect(result).toContain('# Conta: test');
    expect(result).toContain('| Username | test |');
    expect(result).toContain('| Dominio | test.com |');
  });
  test('retorna mensagem para null', () => {
    expect(formatAccountDetail(null)).toBe('Conta nao encontrada.');
  });
});

describe('formatDnsRecordsList()', () => {
  test('formata tabela DNS com records', () => {
    const data = {
      items: [
        { name: 'www', type: 'A', address: '1.2.3.4', ttl: 14400, line: 1 },
        { name: 'mail', type: 'MX', exchange: 'mail.test.com', ttl: 14400, line: 2 }
      ],
      count: 2, total: 2, limit: 25, offset: 0
    };
    const result = formatDnsRecordsList(data);
    expect(result).toContain('| Nome | Tipo | Valor | TTL | Linha |');
    expect(result).toContain('www');
    expect(result).toContain('1.2.3.4');
  });
  test('retorna mensagem para lista vazia', () => {
    const result = formatDnsRecordsList({ items: [], count: 0, total: 0, limit: 25, offset: 0 });
    expect(result).toBe('Nenhum registro DNS encontrado.');
  });
});

describe('formatSystemLoad()', () => {
  test('formata metricas de carga', () => {
    const result = formatSystemLoad({ load1: '1.5', load5: '2.0', load15: '1.8', memTotal: '16G', memFree: '8G' });
    expect(result).toContain('# Carga do Sistema');
    expect(result).toContain('1.5');
  });
  test('retorna mensagem para null', () => {
    expect(formatSystemLoad(null)).toBe('Metricas de carga nao disponiveis.');
  });
});

describe('formatLogLines()', () => {
  test('formata linhas de log como tabela', () => {
    const result = formatLogLines(['line 1', 'line 2', 'line 3']);
    expect(result).toContain('**3 linhas de log**');
    expect(result).toContain('line 1');
  });
  test('trata string como split por newlines', () => {
    const result = formatLogLines('line1\nline2\nline3');
    expect(result).toContain('**3 linhas de log**');
  });
});

describe('formatFileContent()', () => {
  test('formata conteudo de arquivo', () => {
    const result = formatFileContent({ content: '<?php echo "hello"; ?>', path: 'public_html/index.php' });
    expect(result).toContain('# Conteudo: public_html/index.php');
    expect(result).toContain('<?php');
  });
  test('trunca arquivos grandes', () => {
    const big = 'x'.repeat(10000);
    const result = formatFileContent({ content: big, path: 'big.txt' });
    expect(result).toContain('truncado');
  });
});

describe('formatOperationResult()', () => {
  test('retorna mensagem de sucesso', () => {
    expect(formatOperationResult(null, 'delete')).toContain('delete');
    expect(formatOperationResult(null, 'delete')).toContain('sucesso');
  });
  test('retorna message se presente', () => {
    expect(formatOperationResult({ message: 'OK done' }, 'test')).toBe('OK done');
  });
  test('retorna string direto', () => {
    expect(formatOperationResult('tudo certo', 'test')).toBe('tudo certo');
  });
});

describe('formatServicesStatus()', () => {
  test('formata lista de servicos', () => {
    const result = formatServicesStatus([
      { name: 'httpd', running: true, monitored: true },
      { name: 'mysql', running: false, monitored: true }
    ]);
    expect(result).toContain('httpd');
    expect(result).toContain('Ativo');
    expect(result).toContain('Parado');
  });
});

describe('formatMxRecordsList()', () => {
  test('formata MX records', () => {
    const result = formatMxRecordsList([
      { domain: 'test.com', exchange: 'mail.test.com', preference: 10 }
    ]);
    expect(result).toContain('mail.test.com');
    expect(result).toContain('10');
  });
  test('retorna mensagem para vazio', () => {
    expect(formatMxRecordsList([])).toBe('Nenhum registro MX encontrado.');
  });
});
