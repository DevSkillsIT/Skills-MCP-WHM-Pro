/**
 * VALIDATION_RULES - Regras de validação para DNS e respostas
 *
 * CATEGORIAS:
 * - TTL: Regras de Time To Live
 * - DOMAIN: Regras de domínio
 * - MX: Regras de Mail Exchange
 * - RESPONSE: Regras de resposta e otimização
 * - PORTS: Regras de portas
 * - PRIORITY: Regras de prioridade
 */

/**
 * Helper para ler valores de ambiente com fallback
 * @param {string} envVar - Nome da variável de ambiente
 * @param {any} defaultValue - Valor padrão
 * @param {string} type - Tipo de conversão (number, string)
 * @returns {any} Valor convertido
 */
function getEnvValue(envVar, defaultValue, type = 'number') {
  const value = process.env[envVar];

  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (type === 'number') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  return value;
}

const VALIDATION_RULES = {
  /**
   * Regras de TTL (Time To Live)
   */
  TTL: {
    MIN: 60,              // 1 minuto
    MAX: 604800,          // 7 dias
    DEFAULT: 14400,       // 4 horas
    RECOMMENDED_MIN: 300, // 5 minutos
    RECOMMENDED_MAX: 86400 // 24 horas
  },

  /**
   * Regras de validação de domínio
   */
  DOMAIN: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 253,
    LABEL_MAX_LENGTH: 63, // Máximo por label (entre pontos)
    PATTERN: /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    // Caracteres permitidos
    ALLOWED_CHARS: /^[a-zA-Z0-9.\-]+$/,
    // Caracteres não permitidos no início/fim de label
    INVALID_START_END: /^-|-$/,
    // TLDs mínimos comuns (para validação básica)
    COMMON_TLDS: ['com', 'net', 'org', 'br', 'co', 'io', 'dev', 'app', 'cloud']
  },

  /**
   * Regras de MX (Mail Exchange)
   */
  MX: {
    PRIORITY_MIN: 0,
    PRIORITY_MAX: 65535,
    PRIORITY_DEFAULT: 10,
    RECOMMENDED_PRIORITIES: {
      PRIMARY: 10,
      SECONDARY: 20,
      BACKUP: 30
    }
  },

  /**
   * Regras de SRV (Service Record)
   */
  SRV: {
    PRIORITY_MIN: 0,
    PRIORITY_MAX: 65535,
    PRIORITY_DEFAULT: 0,
    WEIGHT_MIN: 0,
    WEIGHT_MAX: 65535,
    WEIGHT_DEFAULT: 0,
    PORT_MIN: 1,
    PORT_MAX: 65535
  },

  /**
   * Regras de CAA (Certificate Authority Authorization)
   */
  CAA: {
    FLAGS: {
      NON_CRITICAL: 0,
      CRITICAL: 128
    },
    TAGS: ['issue', 'issuewild', 'iodef'],
    TAG_MAX_LENGTH: 15,
    VALUE_MAX_LENGTH: 255
  },

  /**
   * Regras de resposta e otimização
   */
  RESPONSE: {
    MAX_RECORDS_DEFAULT: getEnvValue('DNS_MAX_RECORDS_DEFAULT', 500),
    MAX_RECORDS_ABSOLUTE: getEnvValue('DNS_MAX_RECORDS_ABSOLUTE', 2000),
    NESTED_DOMAIN_THRESHOLD: getEnvValue('DNS_NESTED_DOMAIN_THRESHOLD', 50),
    WARNING_THRESHOLD: getEnvValue('DNS_WARNING_THRESHOLD', 100),
    PAGINATION_SIZE_DEFAULT: getEnvValue('DNS_PAGINATION_SIZE_DEFAULT', 100),
    PAGINATION_SIZE_MAX: getEnvValue('DNS_PAGINATION_SIZE_MAX', 500),
    ESTIMATED_TOKEN_THRESHOLD: getEnvValue('DNS_TOKEN_THRESHOLD', 10000),
    CACHE_TTL_SECONDS: getEnvValue('DNS_CACHE_TTL_SECONDS', 120)
  },

  /**
   * Regras de portas
   */
  PORT: {
    MIN: 1,
    MAX: 65535,
    WELL_KNOWN_MAX: 1023,
    REGISTERED_MIN: 1024,
    REGISTERED_MAX: 49151,
    DYNAMIC_MIN: 49152,
    DYNAMIC_MAX: 65535
  },

  /**
   * Regras de prioridade genérica
   */
  PRIORITY: {
    MIN: 0,
    MAX: 65535,
    DEFAULT: 10
  },

  /**
   * Regras de peso (Weight)
   */
  WEIGHT: {
    MIN: 0,
    MAX: 65535,
    DEFAULT: 0
  },

  /**
   * Regras de TXT record
   */
  TXT: {
    STRING_MAX_LENGTH: 255, // Máximo por string (podem existir múltiplas)
    TOTAL_MAX_LENGTH: 4096, // Máximo total combinado
    COMMON_PREFIXES: [
      'v=spf1',           // SPF
      'v=DKIM1',          // DKIM
      'v=DMARC1',         // DMARC
      'google-site-verification=', // Google
      'MS=',              // Microsoft
      '_acme-challenge=' // Let's Encrypt
    ]
  },

  /**
   * Regras de operação e segurança
   */
  OPERATION: {
    MAX_CONCURRENT_MODIFICATIONS: 1, // Apenas 1 modificação concorrente por zona
    BACKUP_RETENTION_COUNT: 10,      // Número de backups a manter
    CONFIRMATION_TOKEN_MIN_LENGTH: 32,
    REASON_MIN_LENGTH: 10,
    REASON_MAX_LENGTH: 500
  },

  /**
   * Regras de cache
   */
  CACHE: {
    TTL_SECONDS: getEnvValue('DNS_CACHE_TTL_SECONDS', 120),
    MAX_ENTRIES: getEnvValue('DNS_CACHE_MAX_ENTRIES', 1000),
    CLEANUP_INTERVAL: getEnvValue('DNS_CACHE_CLEANUP_INTERVAL', 60000),
    KEY_MAX_LENGTH: 256
  },

  /**
   * Regras de match mode para busca
   */
  SEARCH: {
    MATCH_MODES: ['exact', 'contains', 'startsWith'],
    DEFAULT_MATCH_MODE: 'exact',
    MAX_RESULTS: 1000
  },

  /**
   * Regras de filtros
   */
  FILTER: {
    DOMAIN_TYPES: ['addon', 'alias', 'subdomain', 'main'],
    RECORD_TYPES: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'],
    MAX_FILTER_VALUES: 50
  }
};

/**
 * Valida se um valor está dentro de um intervalo
 * @param {number} value - Valor a validar
 * @param {number} min - Valor mínimo
 * @param {number} max - Valor máximo
 * @returns {boolean} true se válido
 */
function isInRange(value, min, max) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Valida TTL
 * @param {number} ttl - Valor TTL
 * @returns {boolean} true se válido
 */
function isValidTTL(ttl) {
  return isInRange(ttl, VALIDATION_RULES.TTL.MIN, VALIDATION_RULES.TTL.MAX);
}

/**
 * Valida prioridade MX
 * @param {number} priority - Prioridade
 * @returns {boolean} true se válida
 */
function isValidMXPriority(priority) {
  return isInRange(priority, VALIDATION_RULES.MX.PRIORITY_MIN, VALIDATION_RULES.MX.PRIORITY_MAX);
}

/**
 * Valida porta
 * @param {number} port - Porta
 * @returns {boolean} true se válida
 */
function isValidPort(port) {
  return isInRange(port, VALIDATION_RULES.PORT.MIN, VALIDATION_RULES.PORT.MAX);
}

/**
 * Obtém valor padrão para um tipo de regra
 * @param {string} category - Categoria (TTL, MX, SRV, etc)
 * @param {string} field - Campo (DEFAULT, PRIORITY_DEFAULT, etc)
 * @returns {any} Valor padrão
 */
function getDefaultValue(category, field) {
  const cat = VALIDATION_RULES[category.toUpperCase()];
  return cat ? cat[field] : null;
}

/**
 * Valida match mode
 * @param {string} mode - Modo de correspondência
 * @returns {boolean} true se válido
 */
function isValidMatchMode(mode) {
  return VALIDATION_RULES.SEARCH.MATCH_MODES.includes(mode);
}

/**
 * Valida tipo de registro DNS
 * @param {string} type - Tipo de registro
 * @returns {boolean} true se válido
 */
function isValidRecordType(type) {
  return VALIDATION_RULES.FILTER.RECORD_TYPES.includes(type.toUpperCase());
}

module.exports = {
  VALIDATION_RULES,
  isInRange,
  isValidTTL,
  isValidMXPriority,
  isValidPort,
  getDefaultValue,
  isValidMatchMode,
  isValidRecordType
};
