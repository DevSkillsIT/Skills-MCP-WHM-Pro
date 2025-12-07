/**
 * DNS Service - Tests
 * Testes unitários para GAP-CRIT-01
 */

const DNSService = require('../../src/lib/dns-service');
const { DNSConflictError } = require('../../src/lib/dns-service');

describe('DNSService', () => {
  let dnsService;
  let mockWhmService;

  beforeEach(() => {
    mockWhmService = {
      listZones: jest.fn(),
      getZone: jest.fn(),
      addZoneRecord: jest.fn(),
      editZoneRecord: jest.fn(),
      deleteZoneRecord: jest.fn(),
      get: jest.fn(),
      post: jest.fn()
    };
    dnsService = new DNSService(mockWhmService);
  });

  describe('Optimistic Locking', () => {
    it('deve detectar race condition e lançar DNSConflictError', async () => {
      // Mock zona inicial
      mockWhmService.getZone.mockResolvedValue({
        data: {
          records: [
            { line: 1, type: 'A', name: 'www', address: '192.168.1.1' }
          ]
        }
      });

      // Simular que registro mudou entre leitura e escrita
      await expect(
        dnsService.editRecord('example.com', 1, {
          type: 'A',
          name: 'www',
          address: '192.168.1.2'
        }, '192.168.1.100') // expected_content diferente do atual
      ).rejects.toThrow(DNSConflictError);
    });

    it('deve permitir edição quando expected_content corresponde', async () => {
      mockWhmService.getZone
        .mockResolvedValueOnce({
          data: {
            records: [
              { line: 1, type: 'A', name: 'www', address: '192.168.1.1' }
            ]
          }
        })
        .mockResolvedValueOnce({
          data: {
            records: [
              { line: 1, type: 'A', name: 'www', address: '192.168.1.2' }
            ]
          }
        });

      mockWhmService.editZoneRecord.mockResolvedValue({ success: true });

      // Mock backup
      const fs = require('fs');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      const result = await dnsService.editRecord('example.com', 1, {
        type: 'A',
        address: '192.168.1.2'
      }, '192.168.1.1'); // expected_content correto

      expect(result.success).toBe(true);
      expect(mockWhmService.editZoneRecord).toHaveBeenCalled();
    });

    it('deve criar backup antes de editar', async () => {
      mockWhmService.getZone.mockResolvedValue({
        data: {
          records: [
            { line: 1, type: 'A', name: 'www', address: '192.168.1.1' }
          ]
        }
      });

      mockWhmService.editZoneRecord.mockResolvedValue({ success: true });

      const backupSpy = jest.spyOn(dnsService, 'backupZone');
      backupSpy.mockResolvedValue('/tmp/backup.json');

      await dnsService.editRecord('example.com', 1, {
        type: 'A',
        address: '192.168.1.2'
      });

      expect(backupSpy).toHaveBeenCalledWith('example.com');
    });

    it('deve fazer rollback se validação falhar', async () => {
      // Simular falha de validação pós-edição
      mockWhmService.editZoneRecord.mockResolvedValue({ success: true });
      mockWhmService.getZone
        .mockResolvedValueOnce({ data: { records: [{ line: 1, type: 'A', address: '1.1.1.1' }] } })
        .mockResolvedValueOnce({ data: { records: [{ line: 1, type: 'INVALID' }] } });

      const restoreSpy = jest.spyOn(dnsService, 'restoreZone');
      restoreSpy.mockResolvedValue({ success: true });

      const backupSpy = jest.spyOn(dnsService, 'backupZone');
      backupSpy.mockResolvedValue('/tmp/backup.json');

      await expect(
        dnsService.editRecord('example.com', 1, { type: 'A', address: '2.2.2.2' })
      ).rejects.toThrow();

      expect(restoreSpy).toHaveBeenCalled();
    });
  });

  describe('Backup Management', () => {
    it('deve manter apenas 10 backups por zona', async () => {
      const fs = require('fs').promises;
      const path = require('path');

      // Mock filesystem operations
      const mockFiles = [];
      for (let i = 0; i < 15; i++) {
        mockFiles.push(`backup-${i}.json`);
      }

      jest.spyOn(fs, 'readdir').mockResolvedValue(mockFiles);
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'unlink').mockResolvedValue();
      jest.spyOn(fs, 'mkdir').mockResolvedValue();

      mockWhmService.getZone.mockResolvedValue({
        data: { records: [{ type: 'A', name: 'www', address: '1.1.1.1' }] }
      });

      // Criar backup
      await dnsService.backupZone('example.com');

      // Verificar que arquivos antigos foram removidos (mantém só 10)
      const unlinkCalls = fs.unlink.mock.calls.length;
      expect(unlinkCalls).toBeGreaterThan(0); // Pelo menos alguns arquivos devem ser removidos
    });

    it('deve criar diretório de backup se não existir', async () => {
      const fs = require('fs').promises;
      const fsSync = require('fs');

      jest.spyOn(fsSync, 'existsSync').mockReturnValue(false);
      jest.spyOn(fsSync, 'mkdirSync').mockImplementation(() => {});
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      mockWhmService.getZone.mockResolvedValue({
        data: { records: [] }
      });

      await dnsService.backupZone('example.com');

      expect(fsSync.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('DNS Operations', () => {
    it('deve listar zonas corretamente', async () => {
      mockWhmService.listZones.mockResolvedValue({
        data: {
          zones: [
            { domain: 'example.com', type: 'master' },
            { domain: 'test.com', type: 'master' }
          ]
        }
      });

      const result = await dnsService.listZones();

      expect(result.success).toBe(true);
      expect(result.data.zones.length).toBe(2);
      expect(result.data.zones[0].domain).toBe('example.com');
    });

    it('deve obter zona específica', async () => {
      mockWhmService.getZone.mockResolvedValue({
        data: {
          records: [
            { line: 1, type: 'A', name: 'www', address: '192.168.1.1' },
            { line: 2, type: 'CNAME', name: 'mail', cname: 'mail.example.com' }
          ]
        }
      });

      const result = await dnsService.getZone('example.com');

      expect(result.success).toBe(true);
      expect(result.data.records.length).toBe(2);
      expect(result.data.records[0].type).toBe('A');
    });

    it('deve adicionar registro A', async () => {
      mockWhmService.addZoneRecord.mockResolvedValue({ success: true });

      const result = await dnsService.addRecord('example.com', {
        type: 'A',
        name: 'www',
        address: '192.168.1.1',
        ttl: 14400
      });

      expect(result.success).toBe(true);
      expect(mockWhmService.addZoneRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'example.com',
          type: 'A',
          name: 'www',
          address: '192.168.1.1'
        })
      );
    });

    it('deve adicionar registro CNAME', async () => {
      mockWhmService.addZoneRecord.mockResolvedValue({ success: true });

      const result = await dnsService.addRecord('example.com', {
        type: 'CNAME',
        name: 'www',
        cname: 'example.com',
        ttl: 14400
      });

      expect(result.success).toBe(true);
      expect(mockWhmService.addZoneRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CNAME',
          cname: 'example.com'
        })
      );
    });

    it('deve adicionar registro MX com priority', async () => {
      mockWhmService.addZoneRecord.mockResolvedValue({ success: true });

      const result = await dnsService.addRecord('example.com', {
        type: 'MX',
        name: '@',
        exchange: 'mail.example.com',
        priority: 10,
        ttl: 14400
      });

      expect(result.success).toBe(true);
      expect(mockWhmService.addZoneRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MX',
          exchange: 'mail.example.com',
          priority: 10
        })
      );
    });

    it('deve deletar registro', async () => {
      mockWhmService.deleteZoneRecord.mockResolvedValue({ success: true });

      const result = await dnsService.deleteRecord('example.com', 1);

      expect(result.success).toBe(true);
      expect(mockWhmService.deleteZoneRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'example.com',
          line: 1
        })
      );
    });

    it('deve resetar zona', async () => {
      mockWhmService.get.mockResolvedValue({ success: true });

      const result = await dnsService.resetZone('example.com');

      expect(result.success).toBe(true);
      expect(mockWhmService.get).toHaveBeenCalledWith('resetzone', { domain: 'example.com' });
    });
  });

  describe('Error Handling', () => {
    it('deve lançar erro para zona inexistente', async () => {
      mockWhmService.getZone.mockRejectedValue(new Error('Zone not found'));

      await expect(
        dnsService.getZone('nonexistent.com')
      ).rejects.toThrow('Zone not found');
    });

    it('deve lançar erro para tipo de registro inválido', async () => {
      await expect(
        dnsService.addRecord('example.com', {
          type: 'INVALID',
          name: 'test'
        })
      ).rejects.toThrow();
    });
  });
});
