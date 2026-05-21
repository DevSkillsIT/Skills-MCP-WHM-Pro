/**
 * Unit tests for zone-resolver.js
 */
const { resolveZone, normalizeDomainName, toFqdn } = require('../../src/lib/dns-helpers/zone-resolver');

const ZONES = ['exemplo.com.br', 'outroexemplo.com', 'sub.exemplo.com.br', 'terceiro.net'];

describe('normalizeDomainName()', () => {
  test('lowercases, trims, removes trailing dots', () => {
    expect(normalizeDomainName('  Teste.Exemplo.COM.  ')).toBe('teste.exemplo.com');
    expect(normalizeDomainName('exemplo.com..')).toBe('exemplo.com');
    expect(normalizeDomainName('')).toBe('');
    expect(normalizeDomainName(null)).toBe('');
  });
});

describe('toFqdn()', () => {
  test('adds trailing dot', () => {
    expect(toFqdn('teste.exemplo.com')).toBe('teste.exemplo.com.');
    expect(toFqdn('teste.exemplo.com.')).toBe('teste.exemplo.com.');
  });
});

describe('resolveZone()', () => {
  test('infers zone from FQDN when zone omitted', () => {
    const r = resolveZone('teste.outroexemplo.com', null, ZONES);
    expect(r.zone).toBe('outroexemplo.com');
    expect(r.recordName).toBe('teste.outroexemplo.com.');
    expect(r.inferred).toBe(true);
    expect(r.error).toBeNull();
  });

  test('picks longest matching zone (most specific)', () => {
    const r = resolveZone('api.sub.exemplo.com.br', null, ZONES);
    expect(r.zone).toBe('sub.exemplo.com.br');
    expect(r.recordName).toBe('api.sub.exemplo.com.br.');
  });

  test('coherent zone provided + FQDN name', () => {
    const r = resolveZone('teste.exemplo.com.br', 'exemplo.com.br', ZONES);
    expect(r.zone).toBe('exemplo.com.br');
    expect(r.inferred).toBe(false);
    expect(r.warning).toBeNull();
  });

  test('corrects wrong provided zone (cPanel account confusion)', () => {
    // user thinks zone is the main domain but record belongs to another hosted zone
    const r = resolveZone('teste.outroexemplo.com', 'exemplo.com.br', ZONES);
    expect(r.zone).toBe('outroexemplo.com');
    expect(r.inferred).toBe(true);
    expect(r.warning).toMatch(/pertence a zona "outroexemplo.com"/);
  });

  test('relative single-label name with provided zone', () => {
    const r = resolveZone('teste', 'exemplo.com.br', ZONES);
    expect(r.zone).toBe('exemplo.com.br');
    expect(r.recordName).toBe('teste.exemplo.com.br.');
    expect(r.error).toBeNull();
  });

  test('relative multi-label name with provided zone', () => {
    const r = resolveZone('api.v2', 'exemplo.com.br', ZONES);
    expect(r.zone).toBe('exemplo.com.br');
    expect(r.recordName).toBe('api.v2.exemplo.com.br.');
  });

  test('apex record (name === zone)', () => {
    const r = resolveZone('exemplo.com.br', null, ZONES);
    expect(r.zone).toBe('exemplo.com.br');
    expect(r.recordName).toBe('exemplo.com.br.');
  });

  test('error when zone cannot be inferred and none provided', () => {
    const r = resolveZone('teste.dominionaoexiste.xyz', null, ZONES);
    expect(r.zone).toBeNull();
    expect(r.error).toMatch(/Nao foi possivel determinar a zona/);
  });

  test('error when provided zone does not exist and cannot infer', () => {
    const r = resolveZone('teste.dominionaoexiste.xyz', 'naoexiste.com', ZONES);
    expect(r.zone).toBeNull();
    expect(r.error).toMatch(/nao existe no servidor/);
  });

  test('handles trailing dot in name', () => {
    const r = resolveZone('teste.exemplo.com.br.', null, ZONES);
    expect(r.zone).toBe('exemplo.com.br');
    expect(r.recordName).toBe('teste.exemplo.com.br.');
  });

  test('empty name returns error', () => {
    const r = resolveZone('', 'exemplo.com.br', ZONES);
    expect(r.error).toMatch(/obrigatorio/);
  });

  test('no available zones falls back to provided zone (FQDN coherent)', () => {
    const r = resolveZone('teste.exemplo.com.br', 'exemplo.com.br', []);
    expect(r.zone).toBe('exemplo.com.br');
    expect(r.recordName).toBe('teste.exemplo.com.br.');
  });

  test('no available zones, relative name + provided zone', () => {
    const r = resolveZone('teste', 'exemplo.com.br', []);
    expect(r.zone).toBe('exemplo.com.br');
    expect(r.recordName).toBe('teste.exemplo.com.br.');
  });
});
