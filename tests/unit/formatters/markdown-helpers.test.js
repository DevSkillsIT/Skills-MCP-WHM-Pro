/**
 * Tests for markdown-helpers.js
 * SPEC-WHM-ENHANCE-001 / F01, F03
 */
const { esc, truncate, pageInfo, checkResponseSize, maskPassword, paginate, formatEmptyResult } = require('../../../src/lib/formatters/markdown-helpers');

describe('esc()', () => {
  test('escapa pipes em strings', () => {
    expect(esc('foo|bar')).toBe('foo\\|bar');
  });
  test('retorna vazio para null', () => {
    expect(esc(null)).toBe('');
  });
  test('retorna vazio para undefined', () => {
    expect(esc(undefined)).toBe('');
  });
  test('converte numeros para string', () => {
    expect(esc(42)).toBe('42');
  });
});

describe('truncate()', () => {
  test('nao trunca textos curtos', () => {
    expect(truncate('short', 300)).toBe('short');
  });
  test('trunca textos longos com ...', () => {
    const long = 'a'.repeat(400);
    const result = truncate(long, 300);
    expect(result.length).toBe(303);
    expect(result.endsWith('...')).toBe(true);
  });
  test('retorna vazio para null', () => {
    expect(truncate(null)).toBe('');
  });
  test('escapa pipes no resultado', () => {
    expect(truncate('foo|bar', 300)).toBe('foo\\|bar');
  });
});

describe('pageInfo()', () => {
  test('mostra "Mostrando todos" quando count === total', () => {
    expect(pageInfo(5, 25, 0, 5)).toContain('Mostrando todos');
  });
  test('mostra paginacao quando total > count', () => {
    const result = pageInfo(25, 25, 0, 100);
    expect(result).toContain('Pagina 1/4');
    expect(result).toContain('total: 100');
  });
  test('calcula pagina corretamente', () => {
    const result = pageInfo(25, 25, 50, 100);
    expect(result).toContain('Pagina 3/4');
  });
});

describe('checkResponseSize()', () => {
  test('nao excede para textos pequenos', () => {
    const result = checkResponseSize('hello');
    expect(result.exceeded).toBe(false);
  });
  test('excede para textos grandes', () => {
    const big = 'x'.repeat(500 * 1024);
    const result = checkResponseSize(big);
    expect(result.exceeded).toBe(true);
    expect(result.message).toContain('excede');
  });
});

describe('maskPassword()', () => {
  test('mascara senhas', () => {
    expect(maskPassword('secret123')).toBe('****');
  });
  test('retorna N/A para vazio', () => {
    expect(maskPassword('')).toBe('N/A');
    expect(maskPassword(null)).toBe('N/A');
  });
});

describe('paginate()', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));

  test('retorna default 25 items', () => {
    const result = paginate(items);
    expect(result.items.length).toBe(25);
    expect(result.count).toBe(25);
    expect(result.total).toBe(100);
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(0);
  });

  test('respeita limit customizado', () => {
    const result = paginate(items, 10);
    expect(result.items.length).toBe(10);
    expect(result.limit).toBe(10);
  });

  test('cap em max 50', () => {
    const result = paginate(items, 200);
    expect(result.items.length).toBe(50);
    expect(result.limit).toBe(50);
  });

  test('respeita offset', () => {
    const result = paginate(items, 10, 90);
    expect(result.items.length).toBe(10);
    expect(result.items[0].id).toBe(90);
  });

  test('trata null/undefined como array vazio', () => {
    const result = paginate(null);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('formatEmptyResult()', () => {
  test('formata mensagem amigavel', () => {
    expect(formatEmptyResult('conta')).toBe('Nenhum(a) conta encontrado(a).');
  });
});
