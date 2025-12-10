/**
 * Validadores DNS - Previne erros e sanitiza input
 *
 * FUNÇÕES:
 * - validateRecordType(type): Valida e normaliza tipo DNS (A, AAAA, CNAME, etc)
 * - validateDomainName(domain): Valida formato de domínio
 * - validateTTL(ttl): Valida TTL (60-604800)
 * - validateIPv4(ip): Valida endereço IPv4
 * - validateIPv6(ip): Valida endereço IPv6
 * - sanitizeDNSInput(input): Remove caracteres perigosos
 */

const { VALIDATION_RULES } = require('../dns-constants/validation-rules');
const { ERROR_MESSAGES } = require('../dns-constants/error-messages');

/**
 * Tipos de registro DNS válidos
 */
const VALID_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'];

/**
 * Valida e normaliza tipo de registro DNS
 * @param {string} type - Tipo de registro
 * @returns {string} Tipo normalizado (maiúsculo)
 * @throws {Error} Se tipo for inválido
 */
function validateRecordType(type) {
  if (!type || typeof type !== 'string') {
    throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_RECORD_TYPE.replace('{type}', type || 'undefined'));
  }

  const normalized = type.toUpperCase().trim();

  if (!VALID_RECORD_TYPES.includes(normalized)) {
    throw new Error(
      ERROR_MESSAGES.VALIDATION.INVALID_RECORD_TYPE
        .replace('{type}', type)
        .replace('Tipos válidos: A, AAAA, CNAME, MX, TXT, NS, PTR, SOA, SRV, CAA',
                 `Tipos válidos: ${VALID_RECORD_TYPES.join(', ')}`)
    );
  }

  return normalized;
}

/**
 * Valida formato de domínio
 * @param {string} domain - Nome do domínio
 * @returns {string} Domínio normalizado (lowercase)
 * @throws {Error} Se domínio for inválido
 */
function validateDomainName(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_DOMAIN.replace('{domain}', domain || 'undefined'));
  }

  const normalized = domain.toLowerCase().trim();

  // Verificar comprimento
  if (normalized.length < VALIDATION_RULES.DOMAIN.MIN_LENGTH ||
      normalized.length > VALIDATION_RULES.DOMAIN.MAX_LENGTH) {
    throw new Error(
      `Domínio muito curto ou longo: ${domain}. Comprimento deve estar entre ${VALIDATION_RULES.DOMAIN.MIN_LENGTH} e ${VALIDATION_RULES.DOMAIN.MAX_LENGTH} caracteres`
    );
  }

  // Verificar formato
  if (!VALIDATION_RULES.DOMAIN.PATTERN.test(normalized)) {
    throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_DOMAIN.replace('{domain}', domain));
  }

  return normalized;
}

/**
 * Valida TTL (Time To Live)
 * @param {number} ttl - Valor TTL em segundos
 * @returns {number} TTL validado
 * @throws {Error} Se TTL for inválido
 */
function validateTTL(ttl) {
  // Se não fornecido, usar default
  if (ttl === null || ttl === undefined) {
    return VALIDATION_RULES.TTL.DEFAULT;
  }

  const ttlNum = parseInt(ttl, 10);

  if (isNaN(ttlNum)) {
    throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_TTL.replace('{ttl}', ttl));
  }

  if (ttlNum < VALIDATION_RULES.TTL.MIN || ttlNum > VALIDATION_RULES.TTL.MAX) {
    throw new Error(
      ERROR_MESSAGES.VALIDATION.INVALID_TTL
        .replace('{ttl}', ttl)
        .replace('60 e 604800', `${VALIDATION_RULES.TTL.MIN} e ${VALIDATION_RULES.TTL.MAX}`)
    );
  }

  return ttlNum;
}

/**
 * Valida endereço IPv4
 * @param {string} ip - Endereço IP
 * @returns {boolean} true se válido
 */
function validateIPv4(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  const ipv4Pattern = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Pattern.test(ip.trim());
}

/**
 * Valida endereço IPv6
 * @param {string} ip - Endereço IP
 * @returns {boolean} true se válido
 */
function validateIPv6(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // Regex simplificado para IPv6 (cobre a maioria dos casos)
  const ipv6Pattern = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::([fF]{4}(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  return ipv6Pattern.test(ip.trim());
}

/**
 * Sanitiza input DNS removendo caracteres perigosos
 * @param {string} input - Input a sanitizar
 * @returns {string} Input sanitizado
 */
function sanitizeDNSInput(input) {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // Remover caracteres perigosos para DNS
  // Permitir: letras, números, hífens, pontos, underscores
  return input.trim().replace(/[^a-zA-Z0-9.\-_]/g, '');
}

/**
 * Valida prioridade MX
 * @param {number} priority - Prioridade MX
 * @returns {number} Prioridade validada
 * @throws {Error} Se prioridade for inválida
 */
function validateMXPriority(priority) {
  // Se não fornecido, usar default
  if (priority === null || priority === undefined) {
    return VALIDATION_RULES.MX.PRIORITY_DEFAULT;
  }

  const priorityNum = parseInt(priority, 10);

  if (isNaN(priorityNum)) {
    throw new Error(`Prioridade MX inválida: ${priority}. Deve ser um número`);
  }

  if (priorityNum < VALIDATION_RULES.MX.PRIORITY_MIN || priorityNum > VALIDATION_RULES.MX.PRIORITY_MAX) {
    throw new Error(
      `Prioridade MX fora do intervalo: ${priority}. Valor deve estar entre ${VALIDATION_RULES.MX.PRIORITY_MIN} e ${VALIDATION_RULES.MX.PRIORITY_MAX}`
    );
  }

  return priorityNum;
}

module.exports = {
  validateRecordType,
  validateDomainName,
  validateTTL,
  validateIPv4,
  validateIPv6,
  sanitizeDNSInput,
  validateMXPriority,
  VALID_RECORD_TYPES
};
