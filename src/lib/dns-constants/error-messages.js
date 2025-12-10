/**
 * ERROR_MESSAGES - Mensagens de erro em português-BR
 *
 * CATEGORIAS:
 * - VALIDATION: Erros de validação de entrada
 * - API: Erros da WHM API
 * - TIMEOUT: Timeouts de operação
 * - NOT_FOUND: Recursos não encontrados
 * - PERMISSION: Erros de permissão
 * - CONFLICT: Conflitos de operação
 */

const ERROR_MESSAGES = {
  VALIDATION: {
    INVALID_RECORD_TYPE: 'Tipo de registro DNS inválido: {type}. Tipos válidos: A, AAAA, CNAME, MX, TXT, NS, PTR, SOA, SRV, CAA',
    INVALID_DOMAIN: 'Domínio inválido: {domain}. Formato esperado: exemplo.com',
    INVALID_TTL: 'TTL inválido: {ttl}. Valor deve estar entre 60 e 604800 segundos',
    INVALID_IPV4: 'Endereço IPv4 inválido: {ip}. Formato esperado: 192.168.1.1',
    INVALID_IPV6: 'Endereço IPv6 inválido: {ip}. Formato esperado: 2001:db8::1',
    INVALID_MX_PRIORITY: 'Prioridade MX inválida: {priority}. Valor deve estar entre 0 e 65535',
    INVALID_PORT: 'Porta inválida: {port}. Valor deve estar entre 1 e 65535',
    MISSING_REQUIRED_FIELD: 'Campo obrigatório ausente: {field}',
    INVALID_MATCH_MODE: 'Modo de correspondência inválido: {mode}. Valores válidos: exact, contains, startsWith',
    DOMAIN_TOO_SHORT: 'Domínio muito curto: {domain}. Mínimo {min} caracteres',
    DOMAIN_TOO_LONG: 'Domínio muito longo: {domain}. Máximo {max} caracteres'
  },

  API: {
    CONNECTION_FAILED: 'Falha ao conectar com WHM API: {error}',
    AUTHENTICATION_FAILED: 'Falha na autenticação WHM: {error}',
    REQUEST_FAILED: 'Requisição WHM falhou: {error}',
    INVALID_RESPONSE: 'Resposta inválida da WHM API: {error}',
    RATE_LIMIT_EXCEEDED: 'Limite de taxa excedido. Aguarde {seconds} segundos',
    API_ERROR: 'Erro da WHM API: {message}',
    MALFORMED_REQUEST: 'Requisição malformada: {error}',
    SERVICE_UNAVAILABLE: 'Serviço WHM temporariamente indisponível',
    NETWORK_ERROR: 'Erro de rede ao comunicar com WHM: {error}'
  },

  TIMEOUT: {
    OPERATION_TIMEOUT: 'Operação {operation} excedeu timeout de {timeout}ms',
    DNS_OPERATION_TIMEOUT: 'Operação DNS excedeu timeout configurado',
    ZONE_FETCH_TIMEOUT: 'Timeout ao buscar zona DNS {zone}',
    RECORD_UPDATE_TIMEOUT: 'Timeout ao atualizar registro DNS'
  },

  NOT_FOUND: {
    ZONE_NOT_FOUND: 'Zona DNS não encontrada: {zone}',
    RECORD_NOT_FOUND: 'Registro DNS não encontrado na linha {line}',
    DOMAIN_NOT_FOUND: 'Domínio não encontrado: {domain}',
    ACCOUNT_NOT_FOUND: 'Conta não encontrada: {username}',
    SERVICE_NOT_FOUND: 'Serviço não encontrado: {service}',
    ENDPOINT_NOT_FOUND: 'Endpoint não encontrado: {endpoint}'
  },

  PERMISSION: {
    INSUFFICIENT_PERMISSIONS: 'Permissões insuficientes para executar operação: {operation}',
    UNAUTHORIZED_ACCESS: 'Acesso não autorizado ao recurso: {resource}',
    FORBIDDEN_OPERATION: 'Operação proibida: {operation}',
    SAFETY_TOKEN_REQUIRED: 'Token de segurança obrigatório para operação destrutiva: {operation}',
    SAFETY_TOKEN_INVALID: 'Token de segurança inválido ou expirado',
    REASON_REQUIRED: 'Motivo obrigatório para operação: {operation}. Mínimo {minLength} caracteres'
  },

  CONFLICT: {
    RECORD_CONFLICT: 'Conflito: Conteúdo do registro mudou desde a última leitura',
    ZONE_LOCKED: 'Zona DNS está bloqueada por outra operação',
    DOMAIN_ALREADY_EXISTS: 'Domínio já existe: {domain}',
    RECORD_ALREADY_EXISTS: 'Registro já existe: {name} {type}',
    CONCURRENT_MODIFICATION: 'Modificação concorrente detectada. Re-leia a zona e tente novamente',
    CNAME_CONFLICT: 'CNAME não pode coexistir com outros registros no mesmo nome'
  },

  CACHE: {
    CACHE_MISS: 'Cache miss para chave: {key}',
    CACHE_EXPIRED: 'Entrada de cache expirada: {key}',
    CACHE_INVALIDATED: 'Cache invalidado: {pattern}',
    CACHE_ERROR: 'Erro ao acessar cache: {error}'
  },

  ZONE: {
    ZONE_TOO_LARGE: 'Zona muito grande: {totalRecords} registros. Use filtros para refinar busca',
    NESTED_DOMAINS_DETECTED: 'Domínios aninhados detectados: {count} subdomínios',
    INVALID_ZONE_SYNTAX: 'Sintaxe de zona inválida: {error}',
    MISSING_SOA: 'Zona não possui registro SOA',
    ZONE_VALIDATION_FAILED: 'Validação de zona falhou: {error}'
  },

  OPTIMIZATION: {
    RESPONSE_TOO_LARGE: 'Resposta muito grande: {tokens} tokens estimados. Use filtros ou dns_search_record',
    RECORDS_LIMITED: 'Registros limitados a {limit}. Total disponível: {total}',
    PAGINATION_REQUIRED: 'Paginação obrigatória para {total} registros'
  },

  BACKUP: {
    BACKUP_FAILED: 'Falha ao criar backup da zona: {error}',
    RESTORE_FAILED: 'Falha ao restaurar zona do backup: {error}',
    BACKUP_NOT_FOUND: 'Backup não encontrado: {path}',
    BACKUP_CORRUPTED: 'Arquivo de backup corrompido: {path}'
  }
};

/**
 * Formata mensagem de erro com substituição de placeholders
 * @param {string} messageTemplate - Template da mensagem
 * @param {object} replacements - Valores para substituição
 * @returns {string} Mensagem formatada
 */
function formatErrorMessage(messageTemplate, replacements = {}) {
  if (!messageTemplate) {
    return '';
  }

  let formatted = messageTemplate;

  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{${key}}`;
    formatted = formatted.replace(new RegExp(placeholder, 'g'), value);
  }

  return formatted;
}

/**
 * Cria objeto de erro JSON-RPC
 * @param {number} code - Código de erro JSON-RPC
 * @param {string} message - Mensagem de erro
 * @param {object} data - Dados adicionais
 * @returns {object} Objeto de erro JSON-RPC
 */
function createJsonRpcError(code, message, data = null) {
  return {
    code,
    message,
    data: data || undefined
  };
}

/**
 * Códigos de erro JSON-RPC
 */
const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes (-32000 to -32099)
  VALIDATION_ERROR: -32001,
  NOT_FOUND: -32002,
  TIMEOUT: -32003,
  CONFLICT: -32004,
  PERMISSION_DENIED: -32005,
  API_ERROR: -32006,
  CACHE_ERROR: -32007,
  BACKUP_ERROR: -32008
};

module.exports = {
  ERROR_MESSAGES,
  formatErrorMessage,
  createJsonRpcError,
  JSON_RPC_ERROR_CODES
};
