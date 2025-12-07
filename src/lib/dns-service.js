/**
 * DNS Service (CC-03, CC-04)
 * Implementa:
 * - Schema DNS unificado (CC-03)
 * - Optimistic Locking (CC-04)
 * - AC06 a AC09, AC08b, AC08c, AC08d
 */

const fs = require('fs');
const path = require('path');
const WHMService = require('./whm-service');
const logger = require('./logger');
const { withTimeout, getTimeoutByType } = require('./timeout');
const { dnsOperationDuration, dnsBackupsCreated, dnsRollbacks } = require('./metrics');

// Diretorio de backups DNS
const DNS_BACKUP_DIR = '/tmp/dns-backups';
const MAX_BACKUPS_PER_ZONE = 10;

/**
 * Erro de conflito (race condition)
 */
class DNSConflictError extends Error {
  constructor(zone, line, expected, actual) {
    super('Conflict: Line content has changed');
    this.name = 'DNSConflictError';
    this.zone = zone;
    this.line = line;
    this.expected = expected;
    this.actual = actual;
    this.code = -32000;
  }

  toJsonRpcError() {
    return {
      code: this.code,
      message: this.message,
      data: {
        zone: this.zone,
        line: this.line,
        expected: this.expected,
        actual: this.actual,
        suggestion: 'Re-fetch zone with dns.get_zone and retry'
      }
    };
  }
}

/**
 * Erro de zona nao encontrada
 */
class ZoneNotFoundError extends Error {
  constructor(zone) {
    super('Zone Not Found');
    this.name = 'ZoneNotFoundError';
    this.zone = zone;
    this.code = -32000;
  }

  toJsonRpcError() {
    return {
      code: this.code,
      message: this.message,
      data: {
        zone: this.zone,
        suggestion: 'Use dns.list_zones to see available zones'
      }
    };
  }
}

class DNSService {
  constructor(whmService = null) {
    this.whm = whmService || new WHMService();
    this.ensureBackupDir();
  }

  /**
   * Garante que o diretorio de backups existe
   */
  ensureBackupDir() {
    try {
      if (!fs.existsSync(DNS_BACKUP_DIR)) {
        fs.mkdirSync(DNS_BACKUP_DIR, { recursive: true });
      }
    } catch (error) {
      logger.warn(`Could not create DNS backup directory: ${error.message}`);
    }
  }

  /**
   * Cria backup da zona antes de modificacao
   */
  async backupZone(zone) {
    const startTime = process.hrtime();

    try {
      const zoneData = await this.getZone(zone);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(DNS_BACKUP_DIR, `${zone}-${timestamp}.zone`);

      fs.writeFileSync(backupPath, JSON.stringify(zoneData, null, 2));

      // Limpar backups antigos
      this.cleanOldBackups(zone);

      dnsBackupsCreated.inc({ zone });
      logger.info(`DNS backup created: ${backupPath}`);

      return backupPath;
    } catch (error) {
      logger.error(`Failed to create DNS backup for ${zone}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Limpa backups antigos mantendo apenas os ultimos N
   */
  cleanOldBackups(zone) {
    try {
      const files = fs.readdirSync(DNS_BACKUP_DIR)
        .filter(f => f.startsWith(`${zone}-`) && f.endsWith('.zone'))
        .sort()
        .reverse();

      // Manter apenas os ultimos MAX_BACKUPS_PER_ZONE
      if (files.length > MAX_BACKUPS_PER_ZONE) {
        const toDelete = files.slice(MAX_BACKUPS_PER_ZONE);
        for (const file of toDelete) {
          fs.unlinkSync(path.join(DNS_BACKUP_DIR, file));
        }
        logger.debug(`Cleaned ${toDelete.length} old backups for zone ${zone}`);
      }
    } catch (error) {
      logger.warn(`Failed to clean old backups: ${error.message}`);
    }
  }

  /**
   * Restaura zona DNS a partir de backup.
   * IMPLEMENTAÇÃO REAL usando API WHM.
   */
  async restoreZone(zone, backupPath) {
    try {
      logger.info(`Restoring DNS zone from backup`, {
        zone,
        backup: backupPath
      });

      // 1. Ler conteúdo do backup
      const fsPromises = require('fs').promises;
      const backupContent = await fsPromises.readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);

      // 2. Resetar zona para estado limpo
      await this.whm.get('resetzone', { domain: zone });

      // 3. Re-adicionar cada registro do backup
      let recordsRestored = 0;
      for (const record of backupData.data.records) {
        if (record.type === 'SOA' || record.type === 'NS') {
          // Skip registros de sistema
          continue;
        }

        await this.whm.post('addzonerecord', {
          domain: zone,
          type: record.type,
          name: record.name,
          address: record.address,
          ttl: record.ttl || 14400,
          // Campos específicos por tipo
          ...this.getRecordTypeParams(record)
        });

        recordsRestored++;
      }

      logger.info(`DNS zone restored successfully`, {
        zone,
        recordsRestored
      });

      // 4. Incrementar métrica de sucesso
      dnsRollbacks.inc({ zone, success: 'true' });

      return { success: true, recordsRestored };

    } catch (error) {
      logger.error(`Failed to restore DNS zone`, {
        zone,
        backup: backupPath,
        error: error.message
      });

      dnsRollbacks.inc({ zone, success: 'false' });

      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Helper para parâmetros específicos por tipo de registro
   */
  getRecordTypeParams(record) {
    switch (record.type) {
      case 'MX':
        return { priority: record.priority || 10 };
      case 'SRV':
        return {
          priority: record.priority || 0,
          weight: record.weight || 0,
          port: record.port || 0
        };
      case 'CNAME':
        return { cname: record.cname };
      case 'TXT':
        return { txtdata: record.txtdata };
      default:
        return {};
    }
  }

  /**
   * Valida sintaxe da zona (simplificado)
   */
  validateZoneSyntax(zoneData) {
    // Validacao basica
    if (!zoneData || !zoneData.records) {
      return { valid: false, error: 'Invalid zone data' };
    }

    // Verificar se tem SOA
    const hasSOA = zoneData.records.some(r => r.type === 'SOA');
    if (!hasSOA) {
      return { valid: false, error: 'Zone missing SOA record' };
    }

    return { valid: true };
  }

  // ============================================
  // DNS Tools (AC06 a AC09)
  // ============================================

  /**
   * Tool: dns.list_zones (AC06)
   * Lista todas as zonas DNS do servidor
   */
  async listZones() {
    const startTime = process.hrtime();

    try {
      const result = await withTimeout(
        () => this.whm.listZones(),
        getTimeoutByType('DNS'),
        'dns.list_zones'
      );

      const zones = (result.data?.zone || []).map(z => ({
        zone: z.domain || z.zone,
        type: z.type || 'master'
      }));

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'list_zones', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          zones: zones,
          total: zones.length
        }
      };
    } catch (error) {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'list_zones', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }

  /**
   * Tool: dns.get_zone (AC07)
   * Obtem dump completo da zona
   */
  async getZone(zone) {
    const startTime = process.hrtime();

    try {
      const result = await withTimeout(
        () => this.whm.getZone(zone),
        getTimeoutByType('DNS'),
        'dns.get_zone'
      );

      // Verificar se zona existe
      if (!result.data?.zone?.[0]) {
        throw new ZoneNotFoundError(zone);
      }

      const zoneData = result.data.zone[0];
      const records = this.parseZoneRecords(zoneData);

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'get_zone', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          zone: zone,
          records: records
        }
      };
    } catch (error) {
      if (error instanceof ZoneNotFoundError) {
        throw error;
      }

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'get_zone', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }

  /**
   * Parseia registros da zona
   */
  parseZoneRecords(zoneData) {
    const records = [];
    const rawRecords = zoneData.record || [];

    for (const record of rawRecords) {
      const parsed = {
        line: record.line,
        type: record.type,
        name: record.name,
        ttl: record.ttl,
        value: this.getRecordValue(record)
      };

      // Adicionar priority para MX
      if (record.type === 'MX') {
        parsed.priority = record.preference || record.priority;
      }

      records.push(parsed);
    }

    return records;
  }

  /**
   * Obtem valor do registro baseado no tipo
   */
  getRecordValue(record) {
    switch (record.type) {
      case 'A':
      case 'AAAA':
        return record.address;
      case 'CNAME':
        return record.cname;
      case 'MX':
        return record.exchange;
      case 'TXT':
        return record.txtdata;
      case 'NS':
        return record.nsdname;
      case 'PTR':
        return record.ptrdname;
      case 'SOA':
        return `${record.mname} ${record.rname} ${record.serial} ${record.refresh} ${record.retry} ${record.expire} ${record.minimum}`;
      default:
        return record.data || record.record || '';
    }
  }

  /**
   * Tool: dns.add_record (AC08, AC08b)
   * Adiciona registro DNS
   */
  async addRecord(zone, type, name, data) {
    const startTime = process.hrtime();

    try {
      // Criar backup antes
      const backupPath = await this.backupZone(zone);

      // Adicionar registro
      const result = await withTimeout(
        () => this.whm.addZoneRecord(zone, type, name, data),
        getTimeoutByType('DNS'),
        'dns.add_record'
      );

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'add_record', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          message: `${type} record added successfully`,
          record: {
            type: type,
            name: `${name}.${zone}.`,
            ...data
          },
          backup_created: backupPath
        }
      };
    } catch (error) {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'add_record', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }

  /**
   * Tool: dns.edit_record (AC08c)
   * Edita registro existente com optimistic locking
   */
  async editRecord(zone, line, data, expectedContent = null) {
    const startTime = process.hrtime();

    try {
      // Verificar expected_content se fornecido (optimistic locking)
      if (expectedContent) {
        const currentZone = await this.getZone(zone);
        const currentRecord = currentZone.data.records.find(r => r.line === line);

        if (!currentRecord) {
          throw new Error(`Record at line ${line} not found`);
        }

        // Construir conteudo atual para comparacao
        const actualContent = this.buildRecordLine(currentRecord, zone);

        // Comparar conteudo
        if (actualContent !== expectedContent) {
          throw new DNSConflictError(zone, line, expectedContent, actualContent);
        }
      }

      // Criar backup antes
      const backupPath = await this.backupZone(zone);

      // Editar registro
      const result = await withTimeout(
        () => this.whm.editZoneRecord(zone, line, data),
        getTimeoutByType('DNS'),
        'dns.edit_record'
      );

      // Validar zona apos modificacao
      const updatedZone = await this.getZone(zone);
      const validation = this.validateZoneSyntax(updatedZone.data);

      if (!validation.valid) {
        // Rollback automatico
        await this.restoreZone(zone, backupPath);

        throw new Error(`DNS modification failed validation - rolled back: ${validation.error}`);
      }

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'edit_record', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          message: 'Record updated successfully',
          zone: zone,
          line: line,
          backup_created: backupPath
        }
      };
    } catch (error) {
      if (error instanceof DNSConflictError) {
        throw error;
      }

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'edit_record', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }

  /**
   * Constroi linha do registro para comparacao
   */
  buildRecordLine(record, zone) {
    const name = record.name.endsWith('.') ? record.name : `${record.name}.${zone}.`;
    return `${name} ${record.ttl} IN ${record.type} ${record.value}`;
  }

  /**
   * Tool: dns.delete_record (AC09)
   * Remove registro DNS
   */
  async deleteRecord(zone, line, expectedContent = null) {
    const startTime = process.hrtime();

    try {
      // Verificar expected_content se fornecido (optimistic locking)
      if (expectedContent) {
        const currentZone = await this.getZone(zone);
        const currentRecord = currentZone.data.records.find(r => r.line === line);

        if (!currentRecord) {
          throw new Error(`Record at line ${line} not found`);
        }

        const actualContent = this.buildRecordLine(currentRecord, zone);

        if (actualContent !== expectedContent) {
          throw new DNSConflictError(zone, line, expectedContent, actualContent);
        }
      }

      // Criar backup antes
      const backupPath = await this.backupZone(zone);

      // Deletar registro
      const result = await withTimeout(
        () => this.whm.removeZoneRecord(zone, line),
        getTimeoutByType('DNS'),
        'dns.delete_record'
      );

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'delete_record', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          message: 'Record deleted successfully',
          zone: zone,
          line: line,
          backup_created: backupPath
        }
      };
    } catch (error) {
      if (error instanceof DNSConflictError) {
        throw error;
      }

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'delete_record', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }

  /**
   * Tool: dns.reset_zone (AC08d)
   * Reseta zona para configuracao padrao
   */
  async resetZone(zone) {
    const startTime = process.hrtime();

    try {
      // Verificar se zona existe
      const currentZone = await this.getZone(zone);
      const recordsBefore = currentZone.data.records.length;

      // Criar backup antes
      const backupPath = await this.backupZone(zone);

      // Resetar zona
      const result = await withTimeout(
        () => this.whm.resetZone(zone),
        getTimeoutByType('DNS'),
        'dns.reset_zone'
      );

      // Obter zona apos reset
      const resetZone = await this.getZone(zone);
      const recordsAfter = resetZone.data.records.length;

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'reset_zone', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          message: 'Zone reset successfully',
          zone: zone,
          records_removed: recordsBefore - recordsAfter,
          records_remaining: recordsAfter,
          backup_created: backupPath
        }
      };
    } catch (error) {
      if (error instanceof ZoneNotFoundError) {
        throw error;
      }

      const [seconds, nanoseconds] = process.hrtime(startTime);
      dnsOperationDuration.observe(
        { operation: 'reset_zone', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }
}

module.exports = DNSService;
module.exports.DNSConflictError = DNSConflictError;
module.exports.ZoneNotFoundError = ZoneNotFoundError;
