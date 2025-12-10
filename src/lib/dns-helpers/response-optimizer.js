/**
 * Response Optimizer - Limita e otimiza respostas DNS
 *
 * FUNÇÕES:
 * - limitRecords(records, maxRecords): Limita quantidade de registros
 * - addPaginationInfo(records, page, perPage): Adiciona informação de paginação
 * - estimateTokenSize(data): Estima tamanho em tokens
 * - optimizeForLargeZones(records): Estratégia de otimização para zonas grandes
 */

const { VALIDATION_RULES } = require('../dns-constants/validation-rules');
const logger = require('../logger');

/**
 * Limita quantidade de registros retornados
 * @param {Array} records - Array de registros
 * @param {number} maxRecords - Máximo de registros (default: 500, max: 2000)
 * @returns {object} Registros limitados + informação
 */
function limitRecords(records, maxRecords = VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT) {
  if (!records || !Array.isArray(records)) {
    return {
      records: [],
      limited: false,
      originalCount: 0,
      returnedCount: 0
    };
  }

  // Validar maxRecords
  const limit = Math.min(
    Math.max(1, parseInt(maxRecords, 10) || VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT),
    VALIDATION_RULES.RESPONSE.MAX_RECORDS_ABSOLUTE
  );

  const originalCount = records.length;
  const limited = originalCount > limit;
  const returnedRecords = limited ? records.slice(0, limit) : records;

  return {
    records: returnedRecords,
    limited,
    originalCount,
    returnedCount: returnedRecords.length,
    warning: limited
      ? `⚠️ Zona possui ${originalCount} registros, retornando primeiros ${limit}. Use filtros para refinar busca.`
      : null
  };
}

/**
 * Adiciona informação de paginação
 * @param {Array} records - Array de registros
 * @param {number} page - Número da página (começando em 1)
 * @param {number} perPage - Registros por página
 * @returns {object} Dados paginados
 */
function addPaginationInfo(records, page = 1, perPage = 100) {
  if (!records || !Array.isArray(records)) {
    return {
      records: [],
      pagination: {
        page: 1,
        perPage: 0,
        totalRecords: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      }
    };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const perPageNum = Math.max(1, parseInt(perPage, 10) || 100);

  const totalRecords = records.length;
  const totalPages = Math.ceil(totalRecords / perPageNum);
  const startIndex = (pageNum - 1) * perPageNum;
  const endIndex = startIndex + perPageNum;

  const paginatedRecords = records.slice(startIndex, endIndex);

  return {
    records: paginatedRecords,
    pagination: {
      page: pageNum,
      perPage: perPageNum,
      totalRecords,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrevious: pageNum > 1,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, totalRecords)
    }
  };
}

/**
 * Estima tamanho em tokens (aproximado)
 * @param {any} data - Dados a estimar
 * @returns {number} Estimativa de tokens
 */
function estimateTokenSize(data) {
  if (!data) {
    return 0;
  }

  // Converter para JSON e estimar tokens
  // Aproximação: 1 token ≈ 4 caracteres
  const jsonString = JSON.stringify(data);
  const charCount = jsonString.length;
  const estimatedTokens = Math.ceil(charCount / 4);

  return estimatedTokens;
}

/**
 * Estratégia de otimização para zonas grandes
 * @param {Array} records - Array de registros
 * @returns {object} Dados otimizados com estratégia aplicada
 */
function optimizeForLargeZones(records) {
  if (!records || !Array.isArray(records)) {
    return {
      records: [],
      strategy: 'none',
      originalCount: 0,
      optimizedCount: 0
    };
  }

  const originalCount = records.length;

  // Estratégia 1: Zona pequena (< 100 registros) - sem otimização
  if (originalCount <= 100) {
    return {
      records,
      strategy: 'none',
      originalCount,
      optimizedCount: originalCount,
      message: 'Zona pequena - sem otimização necessária'
    };
  }

  // Estratégia 2: Zona média (100-500 registros) - limitação simples
  if (originalCount <= VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT) {
    return {
      records,
      strategy: 'simple_limit',
      originalCount,
      optimizedCount: originalCount,
      message: 'Zona de tamanho médio - retornando todos os registros'
    };
  }

  // Estratégia 3: Zona grande (500+ registros) - limitação agressiva
  const limited = limitRecords(records, VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT);

  return {
    records: limited.records,
    strategy: 'aggressive_limit',
    originalCount,
    optimizedCount: limited.returnedCount,
    limited: true,
    message: limited.warning,
    recommendation: 'Use filtros (record_type, name_filter) ou dns_search_record para buscar registros específicos'
  };
}

/**
 * Cria resumo de zona otimizado (apenas estatísticas, sem registros completos)
 * @param {Array} records - Array de registros
 * @param {string} zone - Nome da zona
 * @returns {object} Resumo da zona
 */
function createZoneSummary(records, zone) {
  if (!records || !Array.isArray(records)) {
    return {
      zone,
      totalRecords: 0,
      byType: {},
      recommendation: 'Use dns_get_zone para obter registros da zona'
    };
  }

  // Contar por tipo
  const byType = {};
  for (const record of records) {
    const type = record.type || 'UNKNOWN';
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    zone,
    totalRecords: records.length,
    byType,
    estimatedTokens: estimateTokenSize(records),
    recommendation: records.length > VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT
      ? 'Zona grande - use filtros em dns_get_zone ou dns_search_record'
      : 'Use dns_get_zone para obter registros completos'
  };
}

/**
 * Comprime registros removendo campos desnecessários
 * @param {Array} records - Array de registros
 * @param {boolean} includeLineNumbers - Se deve incluir números de linha
 * @returns {Array} Registros comprimidos
 */
function compressRecords(records, includeLineNumbers = true) {
  if (!records || !Array.isArray(records)) {
    return [];
  }

  return records.map(record => {
    const compressed = {
      type: record.type,
      name: record.name,
      value: record.value
    };

    if (includeLineNumbers && record.line) {
      compressed.line = record.line;
    }

    // Adicionar campos específicos importantes
    if (record.type === 'MX' && record.priority) {
      compressed.priority = record.priority;
    }

    if (record.ttl && record.ttl !== 14400) { // Incluir apenas se diferente do default
      compressed.ttl = record.ttl;
    }

    return compressed;
  });
}

module.exports = {
  limitRecords,
  addPaginationInfo,
  estimateTokenSize,
  optimizeForLargeZones,
  createZoneSummary,
  compressRecords
};
