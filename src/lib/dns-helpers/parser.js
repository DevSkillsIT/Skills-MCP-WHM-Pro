/**
 * Parser DNS - Processa respostas da WHM API
 *
 * FUNÇÕES:
 * - parseZoneRecords(rawData): Parseia resposta bruta da WHM
 * - extractRecordsByType(records, type): Filtra por tipo
 * - extractRecordsByName(records, name): Filtra por nome
 * - groupRecordsByLevel(records, baseDomain): Agrupa por nível de subdomínio
 */

const logger = require('../logger');

/**
 * Parseia registros DNS da zona a partir de dados brutos da WHM
 * @param {object} zoneData - Dados brutos da zona DNS
 * @returns {Array} Array de registros parseados
 */
function parseZoneRecords(zoneData) {
  const records = [];

  if (!zoneData || !zoneData.record) {
    return records;
  }

  const rawRecords = Array.isArray(zoneData.record) ? zoneData.record : [zoneData.record];

  for (const record of rawRecords) {
    try {
      const parsed = {
        line: record.line,
        type: record.type,
        name: record.name,
        ttl: record.ttl,
        value: getRecordValue(record)
      };

      // Adicionar campos específicos por tipo
      if (record.type === 'MX') {
        parsed.priority = record.preference || record.priority || 10;
      }

      if (record.type === 'SRV') {
        parsed.priority = record.priority || 0;
        parsed.weight = record.weight || 0;
        parsed.port = record.port || 0;
      }

      records.push(parsed);
    } catch (error) {
      logger.warn(`Failed to parse DNS record at line ${record.line}: ${error.message}`);
    }
  }

  return records;
}

/**
 * Obtém valor do registro baseado no tipo
 * @param {object} record - Registro DNS bruto
 * @returns {string} Valor do registro
 */
function getRecordValue(record) {
  switch (record.type) {
    case 'A':
    case 'AAAA':
      return record.address || '';
    case 'CNAME':
      return record.cname || '';
    case 'MX':
      return record.exchange || '';
    case 'TXT':
      return record.txtdata || '';
    case 'NS':
      return record.nsdname || '';
    case 'PTR':
      return record.ptrdname || '';
    case 'SOA':
      return `${record.mname || ''} ${record.rname || ''} ${record.serial || ''} ${record.refresh || ''} ${record.retry || ''} ${record.expire || ''} ${record.minimum || ''}`;
    case 'SRV':
      return record.target || '';
    case 'CAA':
      return `${record.flags || 0} ${record.tag || ''} "${record.value || ''}"`;
    default:
      return record.data || record.record || '';
  }
}

/**
 * Filtra registros por tipo
 * @param {Array} records - Array de registros
 * @param {string|Array} type - Tipo(s) de registro a buscar
 * @returns {Array} Registros filtrados
 */
function extractRecordsByType(records, type) {
  if (!records || !Array.isArray(records)) {
    return [];
  }

  const types = Array.isArray(type) ? type : [type];
  const normalizedTypes = types.map(t => t.toUpperCase());

  return records.filter(record => normalizedTypes.includes(record.type));
}

/**
 * Filtra registros por nome (suporta modos: exact, contains, startsWith)
 * @param {Array} records - Array de registros
 * @param {string} name - Nome a buscar
 * @param {string} matchMode - Modo de correspondência ('exact', 'contains', 'startsWith')
 * @returns {Array} Registros filtrados
 */
function extractRecordsByName(records, name, matchMode = 'exact') {
  if (!records || !Array.isArray(records)) {
    return [];
  }

  if (!name) {
    return records;
  }

  const normalizedName = name.toLowerCase();

  return records.filter(record => {
    const recordName = (record.name || '').toLowerCase();

    switch (matchMode) {
      case 'exact':
        return recordName === normalizedName || recordName === `${normalizedName}.`;
      case 'contains':
        return recordName.includes(normalizedName);
      case 'startsWith':
        return recordName.startsWith(normalizedName);
      default:
        return recordName === normalizedName;
    }
  });
}

/**
 * Agrupa registros por nível de subdomínio
 * @param {Array} records - Array de registros
 * @param {string} baseDomain - Domínio base (ex: skillsit.com.br)
 * @returns {object} Registros agrupados por nível
 */
function groupRecordsByLevel(records, baseDomain) {
  const levels = {
    base: [],      // skillsit.com.br ou @
    level1: [],    // www.skillsit.com.br (1 ponto no subdomínio)
    level2: [],    // app.tools.skillsit.com.br (2 pontos)
    level3plus: [] // deep.nested.app.tools.skillsit.com.br (3+ pontos)
  };

  if (!records || !Array.isArray(records)) {
    return levels;
  }

  const normalizedBase = baseDomain.toLowerCase().replace(/\.$/, '');

  for (const record of records) {
    const recordName = (record.name || '').toLowerCase().replace(/\.$/, '');

    // Registro base (@, domínio raiz ou exatamente o baseDomain)
    if (recordName === '@' || recordName === '' || recordName === normalizedBase) {
      levels.base.push(record);
      continue;
    }

    // Extrair subdomínio
    let subdomain = recordName;
    if (recordName.endsWith(normalizedBase)) {
      subdomain = recordName.replace(`.${normalizedBase}`, '').replace(normalizedBase, '');
    }

    // Contar pontos no subdomínio
    const dots = (subdomain.match(/\./g) || []).length;

    if (dots === 0) {
      levels.level1.push(record);
    } else if (dots === 1) {
      levels.level2.push(record);
    } else {
      levels.level3plus.push(record);
    }
  }

  return levels;
}

/**
 * Conta registros por tipo
 * @param {Array} records - Array de registros
 * @returns {object} Contagem por tipo
 */
function countRecordsByType(records) {
  if (!records || !Array.isArray(records)) {
    return {};
  }

  const counts = {};

  for (const record of records) {
    const type = record.type || 'UNKNOWN';
    counts[type] = (counts[type] || 0) + 1;
  }

  return counts;
}

module.exports = {
  parseZoneRecords,
  extractRecordsByType,
  extractRecordsByName,
  groupRecordsByLevel,
  countRecordsByType
};
