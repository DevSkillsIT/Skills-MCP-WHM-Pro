/**
 * Response Optimizer - Tests
 * Testes unitários para otimização de respostas DNS
 */

const {
  limitRecords,
  addPaginationInfo,
  estimateTokenSize,
  optimizeForLargeZones,
  createZoneSummary,
  compressRecords
} = require('../../src/lib/dns-helpers/response-optimizer');

describe('Response Optimizer', () => {
  describe('limitRecords', () => {
    it('deve limitar quantidade de registros', () => {
      const records = Array.from({ length: 250 }, (_, i) => ({
        type: 'A',
        name: `record${i}`,
        value: `192.168.1.${i % 256}`
      }));

      const result = limitRecords(records, 100);

      expect(result.records).toHaveLength(100);
      expect(result.limited).toBe(true);
      expect(result.originalCount).toBe(250);
      expect(result.returnedCount).toBe(100);
      expect(result.warning).toContain('⚠️');
    });

    it('deve retornar todos registros se menor que limite', () => {
      const records = [
        { type: 'A', name: 'test1', value: '192.168.1.1' },
        { type: 'A', name: 'test2', value: '192.168.1.2' }
      ];

      const result = limitRecords(records, 100);

      expect(result.records).toHaveLength(2);
      expect(result.limited).toBe(false);
      expect(result.warning).toBeNull();
    });

    it('deve tratar input nulo gracefully', () => {
      const result = limitRecords(null);

      expect(result.records).toEqual([]);
      expect(result.limited).toBe(false);
      expect(result.originalCount).toBe(0);
      expect(result.returnedCount).toBe(0);
    });

    it('deve tratar array vazio', () => {
      const result = limitRecords([]);

      expect(result.records).toEqual([]);
      expect(result.limited).toBe(false);
    });

    it('deve usar limite máximo absoluto', () => {
      const records = Array.from({ length: 3000 }, (_, i) => ({
        type: 'A',
        name: `r${i}`,
        value: '1.1.1.1'
      }));

      const result = limitRecords(records, 10000); // Tentando passar do limite

      expect(result.records.length).toBeLessThanOrEqual(2000); // MAX_RECORDS_ABSOLUTE
      expect(result.limited).toBe(true);
    });
  });

  describe('addPaginationInfo', () => {
    it('deve paginar corretamente', () => {
      const records = Array.from({ length: 250 }, (_, i) => ({
        type: 'A',
        name: `record${i}`,
        value: `192.168.1.${i % 256}`
      }));

      const result = addPaginationInfo(records, 2, 100);

      expect(result.records).toHaveLength(100);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrevious).toBe(true);
      expect(result.pagination.startIndex).toBe(101);
      expect(result.pagination.endIndex).toBe(200);
    });

    it('deve retornar página vazia se além do total', () => {
      const records = [{ type: 'A', name: 'test', value: '192.168.1.1' }];

      const result = addPaginationInfo(records, 5, 100);

      expect(result.records).toHaveLength(0);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrevious).toBe(true);
    });

    it('deve usar página 1 por padrão', () => {
      const records = [
        { type: 'A', name: 'test1', value: '192.168.1.1' },
        { type: 'A', name: 'test2', value: '192.168.1.2' }
      ];

      const result = addPaginationInfo(records);

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.perPage).toBe(100);
      expect(result.records).toHaveLength(2);
    });

    it('deve tratar input nulo', () => {
      const result = addPaginationInfo(null);

      expect(result.records).toEqual([]);
      expect(result.pagination.totalRecords).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('estimateTokenSize', () => {
    it('deve estimar tokens para objeto simples', () => {
      const data = { type: 'A', name: 'test', value: '192.168.1.1' };

      const tokens = estimateTokenSize(data);

      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(30);
    });

    it('deve retornar 0 para dados nulos', () => {
      const tokens = estimateTokenSize(null);

      expect(tokens).toBe(0);
    });

    it('deve retornar 0 para undefined', () => {
      const tokens = estimateTokenSize(undefined);

      expect(tokens).toBe(0);
    });

    it('deve estimar tokens para array', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({
        type: 'A',
        name: `record${i}`,
        value: `192.168.1.${i}`
      }));

      const tokens = estimateTokenSize(data);

      expect(tokens).toBeGreaterThan(100);
    });
  });

  describe('optimizeForLargeZones', () => {
    it('deve aplicar estratégia none para zona pequena', () => {
      const records = Array.from({ length: 50 }, (_, i) => ({
        type: 'A',
        name: `record${i}`,
        value: `192.168.1.${i}`
      }));

      const result = optimizeForLargeZones(records);

      expect(result.strategy).toBe('none');
      expect(result.records).toHaveLength(50);
      expect(result.optimizedCount).toBe(50);
    });

    it('deve aplicar estratégia simple_limit para zona média', () => {
      const records = Array.from({ length: 200 }, (_, i) => ({
        type: 'A',
        name: `record${i}`,
        value: `192.168.1.${i % 256}`
      }));

      const result = optimizeForLargeZones(records);

      expect(result.strategy).toBe('simple_limit');
      expect(result.records).toHaveLength(200);
    });

    it('deve aplicar estratégia aggressive_limit para zona grande', () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({
        type: 'A',
        name: `record${i}`,
        value: `192.168.1.${i % 256}`
      }));

      const result = optimizeForLargeZones(records);

      expect(result.strategy).toBe('aggressive_limit');
      expect(result.limited).toBe(true);
      expect(result.records.length).toBeLessThan(1000);
      expect(result.recommendation).toBeTruthy();
    });

    it('deve tratar input nulo', () => {
      const result = optimizeForLargeZones(null);

      expect(result.records).toEqual([]);
      expect(result.strategy).toBe('none');
      expect(result.originalCount).toBe(0);
    });
  });

  describe('createZoneSummary', () => {
    it('deve criar resumo com contadores por tipo', () => {
      const records = [
        { type: 'A', name: 'www', value: '192.168.1.1' },
        { type: 'A', name: 'mail', value: '192.168.1.2' },
        { type: 'CNAME', name: 'blog', value: 'www' },
        { type: 'MX', name: '@', value: 'mail.example.com', priority: 10 }
      ];

      const summary = createZoneSummary(records, 'example.com');

      expect(summary.zone).toBe('example.com');
      expect(summary.totalRecords).toBe(4);
      expect(summary.byType.A).toBe(2);
      expect(summary.byType.CNAME).toBe(1);
      expect(summary.byType.MX).toBe(1);
      expect(summary.estimatedTokens).toBeGreaterThan(0);
    });

    it('deve tratar tipo UNKNOWN para registros sem type', () => {
      const records = [
        { name: 'test', value: 'data' } // Sem type
      ];

      const summary = createZoneSummary(records, 'example.com');

      expect(summary.byType.UNKNOWN).toBe(1);
    });

    it('deve retornar resumo vazio para input nulo', () => {
      const summary = createZoneSummary(null, 'example.com');

      expect(summary.zone).toBe('example.com');
      expect(summary.totalRecords).toBe(0);
      expect(summary.byType).toEqual({});
    });

    it('deve incluir recomendação para zona grande', () => {
      const records = Array.from({ length: 600 }, (_, i) => ({
        type: 'A',
        name: `record${i}`,
        value: '1.1.1.1'
      }));

      const summary = createZoneSummary(records, 'example.com');

      expect(summary.recommendation).toContain('Zona grande');
    });
  });

  describe('compressRecords', () => {
    it('deve remover campos desnecessários', () => {
      const records = [
        {
          type: 'A',
          name: 'www',
          value: '192.168.1.1',
          line: 5,
          ttl: 14400,
          class: 'IN',
          metadata: { created: '2025-01-01' }
        }
      ];

      const compressed = compressRecords(records);

      expect(compressed[0]).toEqual({
        type: 'A',
        name: 'www',
        value: '192.168.1.1',
        line: 5
      });
      expect(compressed[0].class).toBeUndefined();
      expect(compressed[0].metadata).toBeUndefined();
    });

    it('deve incluir priority para registros MX', () => {
      const records = [
        {
          type: 'MX',
          name: '@',
          value: 'mail.example.com',
          priority: 10,
          line: 1
        }
      ];

      const compressed = compressRecords(records);

      expect(compressed[0].priority).toBe(10);
    });

    it('deve incluir ttl se diferente do default', () => {
      const records = [
        {
          type: 'A',
          name: 'test',
          value: '1.1.1.1',
          ttl: 3600, // Diferente do default 14400
          line: 1
        }
      ];

      const compressed = compressRecords(records);

      expect(compressed[0].ttl).toBe(3600);
    });

    it('deve omitir ttl se igual ao default', () => {
      const records = [
        {
          type: 'A',
          name: 'test',
          value: '1.1.1.1',
          ttl: 14400, // Default
          line: 1
        }
      ];

      const compressed = compressRecords(records);

      expect(compressed[0].ttl).toBeUndefined();
    });

    it('deve opcionalmente omitir números de linha', () => {
      const records = [
        {
          type: 'A',
          name: 'test',
          value: '1.1.1.1',
          line: 5
        }
      ];

      const compressed = compressRecords(records, false);

      expect(compressed[0].line).toBeUndefined();
    });

    it('deve tratar array vazio', () => {
      const compressed = compressRecords([]);

      expect(compressed).toEqual([]);
    });

    it('deve tratar input nulo', () => {
      const compressed = compressRecords(null);

      expect(compressed).toEqual([]);
    });
  });
});
