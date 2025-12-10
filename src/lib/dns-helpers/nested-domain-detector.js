/**
 * Detector de Domínios Aninhados - CRÍTICO!
 *
 * ALGORITMO:
 * 1. Agrupar registros por nível de subdomínio
 * 2. Contar pontos no subdomínio
 * 3. Analisar padrões de aninhamento e retornar estatísticas
 *
 * CONTEXTO:
 * No WHM/cPanel, cada domínio registrado em uma conta cria automaticamente um subdomínio.
 * Exemplo: Conta skillsit.com.br + registra cliente.com.br = cria cliente.skillsit.com.br
 * Isso é COMUM e precisa ser detectado e tratado preventivamente.
 */

const { groupRecordsByLevel } = require('./parser');
const { VALIDATION_RULES } = require('../dns-constants/validation-rules');

/**
 * Detecta domínios aninhados em uma zona DNS
 * @param {Array} zoneRecords - Registros da zona DNS
 * @param {string} baseDomain - Domínio base
 * @returns {object} Análise de aninhamento
 */
function detectNestedDomains(zoneRecords, baseDomain) {
  // 1. Agrupar registros por nível de subdomínio
  const levels = groupRecordsByLevel(zoneRecords, baseDomain);

  // 2. Calcular totais
  const totalRecords = zoneRecords.length;
  const baseCount = levels.base.length;
  const level1Count = levels.level1.length;
  const level2Count = levels.level2.length;
  const level3PlusCount = levels.level3plus.length;

  // 3. Determinar se há aninhamento significativo
  const hasNested = level1Count > VALIDATION_RULES.RESPONSE.NESTED_DOMAIN_THRESHOLD;

  // 4. Gerar warning se necessário
  let warning = null;
  let recommendation = null;

  if (level1Count > VALIDATION_RULES.RESPONSE.WARNING_THRESHOLD) {
    warning = `⚠️ Zona com muitos subdomínios (${level1Count} registros de nível 1) - use filtros ou dns_search_record!`;
    recommendation = 'Use dns_search_record para buscar registros específicos ou dns_get_zone com filtros';
  } else if (totalRecords > VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT) {
    warning = `⚠️ Zona grande com ${totalRecords} registros - considere usar filtros`;
    recommendation = 'Use parâmetros max_records, record_type ou name_filter para limitar resultados';
  }

  // 5. Extrair exemplos de cada nível
  const examples = {
    level1: levels.level1.slice(0, 3).map(r => r.name),
    level2: levels.level2.slice(0, 3).map(r => r.name),
    level3plus: levels.level3plus.slice(0, 3).map(r => r.name)
  };

  // 6. Retornar análise completa
  return {
    zone: baseDomain,
    hasNested,
    totalRecords,
    byLevel: {
      base: baseCount,
      level1: level1Count,
      level2: level2Count,
      level3plus: level3PlusCount
    },
    warning,
    examples,
    recommendation
  };
}

/**
 * Verifica se uma zona requer otimização
 * @param {object} analysis - Análise de aninhamento
 * @returns {boolean} true se zona precisa de otimização
 */
function requiresOptimization(analysis) {
  return analysis.totalRecords > VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT ||
         analysis.byLevel.level1 > VALIDATION_RULES.RESPONSE.WARNING_THRESHOLD;
}

/**
 * Gera sugestões de otimização baseadas na análise
 * @param {object} analysis - Análise de aninhamento
 * @returns {Array} Lista de sugestões
 */
function generateOptimizationSuggestions(analysis) {
  const suggestions = [];

  if (analysis.byLevel.level1 > VALIDATION_RULES.RESPONSE.WARNING_THRESHOLD) {
    suggestions.push({
      severity: 'high',
      message: `Zona possui ${analysis.byLevel.level1} subdomínios de nível 1`,
      action: 'Use dns_search_record para buscar registros específicos em vez de obter toda a zona',
      example: `dns_search_record({ zone: "${analysis.zone}", name: "prometheus", type: ["A", "AAAA"] })`
    });
  }

  if (analysis.totalRecords > VALIDATION_RULES.RESPONSE.MAX_RECORDS_DEFAULT) {
    suggestions.push({
      severity: 'medium',
      message: `Zona contém ${analysis.totalRecords} registros no total`,
      action: 'Use filtros em dns_get_zone para limitar quantidade de registros retornados',
      example: `dns_get_zone({ zone: "${analysis.zone}", record_type: "A", max_records: 100 })`
    });
  }

  if (analysis.byLevel.level2 > 50) {
    suggestions.push({
      severity: 'low',
      message: `Zona possui ${analysis.byLevel.level2} subdomínios de nível 2`,
      action: 'Considere organizar subdomínios em zonas separadas para melhor gerenciamento'
    });
  }

  return suggestions;
}

/**
 * Detecta padrões comuns de domínios aninhados automáticos do cPanel
 * @param {Array} zoneRecords - Registros da zona
 * @param {string} baseDomain - Domínio base
 * @returns {object} Análise de padrões cPanel
 */
function detectCPanelAutoSubdomains(zoneRecords, baseDomain) {
  const autoSubdomains = [];
  const normalizedBase = baseDomain.toLowerCase().replace(/\.$/, '');

  // Padrões comuns de subdomínios automáticos do cPanel
  const cpanelPatterns = [
    'cpanel',
    'webmail',
    'webdisk',
    'mail',
    'ftp',
    'autodiscover',
    'autoconfig'
  ];

  for (const record of zoneRecords) {
    const recordName = (record.name || '').toLowerCase().replace(/\.$/, '');

    // Verificar se é subdomínio do base
    if (recordName.endsWith(normalizedBase)) {
      const subdomain = recordName.replace(`.${normalizedBase}`, '').replace(normalizedBase, '');

      // Verificar se corresponde a padrões cPanel
      const matchesCPanel = cpanelPatterns.some(pattern =>
        subdomain === pattern || subdomain.startsWith(`${pattern}.`)
      );

      if (matchesCPanel) {
        autoSubdomains.push({
          name: record.name,
          type: record.type,
          value: record.value,
          pattern: cpanelPatterns.find(p => subdomain === p || subdomain.startsWith(`${p}.`))
        });
      }
    }
  }

  return {
    found: autoSubdomains.length > 0,
    count: autoSubdomains.length,
    subdomains: autoSubdomains
  };
}

module.exports = {
  detectNestedDomains,
  requiresOptimization,
  generateOptimizationSuggestions,
  detectCPanelAutoSubdomains
};
