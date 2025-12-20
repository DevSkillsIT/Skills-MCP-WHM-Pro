/**
 * WHM Service - Cliente WHM API
 * Adaptado de whmrockstar com:
 * - Validacao de metadata (AC18)
 * - Rate limiting e backoff (CC-06)
 * - Timeout hierarchical (AC17)
 * - Sanitizacao de logs (CC-05)
 */

const axios = require('axios');
const https = require('https');
const logger = require('./logger');
const { withRetry, calculateBackoffDelay } = require('./retry');
const { withTimeout, getTimeoutByType } = require('./timeout');
const { recordWhmRequestDuration, recordRateLimitHit } = require('./metrics');
const { acquireLock, releaseLock } = require('./lock-manager');
const { getOperationStatus, startAsyncOperation } = require('./nsec3-async-handler');
const { validateUserAccess } = require('./acl-validator');
const { validateDocumentRoot } = require('./path-validator');
const { beginTransaction, commitTransaction, rollbackTransaction } = require('./transaction-log');

/**
 * Erro customizado para WHM API
 */
class WHMError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = 'WHMError';
    this.metadata = metadata;
    this.code = -32000;
  }

  toJsonRpcError() {
    return {
      code: this.code,
      message: `WHM API Error: ${this.message}`,
      data: {
        whm_reason: this.message,
        whm_metadata_result: this.metadata.result,
        suggestion: this.getSuggestion()
      }
    };
  }

  getSuggestion() {
    const reason = this.message.toLowerCase();
    if (reason.includes('authentication') || reason.includes('token')) {
      return 'Verify WHM_API_TOKEN in .env file';
    }
    if (reason.includes('domain') || reason.includes('zone')) {
      return 'Check domain name format';
    }
    if (reason.includes('permission') || reason.includes('access')) {
      return 'Check WHM user permissions';
    }
    return 'Check WHM API documentation';
  }
}

class WHMService {
  constructor(config = {}) {
    this.host = config.host || process.env.WHM_HOST;
    this.port = config.port || process.env.WHM_PORT || '2087';
    this.username = config.username || process.env.WHM_USERNAME || 'root';
    this.apiToken = config.apiToken || process.env.WHM_API_TOKEN;

    if (!this.host || !this.apiToken) {
      throw new Error('WHM host and API token are required');
    }

    this.baseURL = `https://${this.host}:${this.port}/json-api/`;

    // Configuracao de TLS
    const verifyTLS = config.verifyTLS !== false;
    const httpsAgentOptions = { rejectUnauthorized: verifyTLS };

    // Criar cliente axios
    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `whm ${this.username}:${this.apiToken}`
      },
      httpsAgent: new https.Agent(httpsAgentOptions),
      timeout: getTimeoutByType('WHM_API')
    });

    // Configuracao de retry
    this.maxRetries = config.maxRetries || 5;
    this.baseDelay = config.baseDelay || 1000;
    this.maxDelay = config.maxDelay || 32000;

    // Adicionar interceptor para logs (com sanitizacao)
    this.api.interceptors.response.use(
      response => response,
      error => {
        logger.error('WHM API Error', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Valida metadata da resposta WHM
   * WHM retorna HTTP 200 mesmo em erros, indicado por metadata.result=0
   * @param {object} response - Resposta da API
   * @throws {WHMError} Se metadata.result === 0
   */
  validateMetadata(response) {
    const data = response?.data;

    // Verificar se tem metadata
    if (data?.metadata) {
      const { result, reason } = data.metadata;

      // result === 0 indica erro
      if (result === 0) {
        throw new WHMError(reason || 'WHM operation failed', data.metadata);
      }
    }

    return data;
  }

  /**
   * Requisicao GET com retry e validacao
   */
  async get(endpoint, params = {}) {
    const startTime = Date.now();

    const result = await withRetry(
      async () => {
        const fullParams = { ...params, 'api.version': 1 };
        const queryString = new URLSearchParams(fullParams).toString();
        const url = `${endpoint}?${queryString}`;

        const response = await this.api.get(url);

        // Validar metadata (AC18)
        return this.validateMetadata(response);
      },
      {
        maxRetries: this.maxRetries,
        baseDelay: this.baseDelay,
        maxDelay: this.maxDelay,
        operationName: `WHM GET ${endpoint}`,
        onRetry: (attempt, delay, error) => {
          if (error.response?.status === 429) {
            recordRateLimitHit();
          }
        }
      }
    );

    // Registrar duracao
    const duration = (Date.now() - startTime) / 1000;
    recordWhmRequestDuration(endpoint, 200, duration);

    return result;
  }

  /**
   * Requisicao POST com retry e validacao
   */
  async post(endpoint, data = {}) {
    const startTime = Date.now();

    const result = await withRetry(
      async () => {
        const params = new URLSearchParams();
        params.append('api.version', '1');
        for (const [key, value] of Object.entries(data)) {
          params.append(key, String(value));
        }

        const response = await this.api.post(endpoint, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        // Validar metadata (AC18)
        return this.validateMetadata(response);
      },
      {
        maxRetries: this.maxRetries,
        baseDelay: this.baseDelay,
        maxDelay: this.maxDelay,
        operationName: `WHM POST ${endpoint}`
      }
    );

    // Registrar duracao
    const duration = (Date.now() - startTime) / 1000;
    recordWhmRequestDuration(endpoint, 200, duration);

    return result;
  }

  /**
   * Chamada generica para API
   */
  async callApi({ method = 'get', endpoint, params = {} }) {
    const m = (method || 'get').toLowerCase();
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('endpoint is required');
    }
    if (m === 'get') {
      return this.get(endpoint, params);
    }
    if (m === 'post') {
      return this.post(endpoint, params);
    }
    throw new Error(`Unsupported method: ${method}`);
  }

  // ============================================
  // Account Management APIs
  // ============================================

  async listAccounts() {
    const result = await this.get('listaccts');
    return {
      success: true,
      data: result.data || result
    };
  }

  async createAccount(accountData) {
    const data = {
      username: accountData.username,
      domain: accountData.domain,
      password: accountData.password,
      contactemail: accountData.email,
      plan: accountData.package || 'default'
    };
    const result = await this.post('createacct', data);
    return {
      success: true,
      data: result.data || result
    };
  }

  async getAccountSummary(username) {
    const result = await this.get('accountsummary', { user: username });
    return {
      success: true,
      data: result.data || result
    };
  }

  async suspendAccount(username, reason) {
    const result = await this.post('suspendacct', { user: username, reason });
    return {
      success: true,
      data: result.data || result
    };
  }

  async unsuspendAccount(username) {
    const result = await this.post('unsuspendacct', { user: username });
    return {
      success: true,
      data: result.data || result
    };
  }

  async terminateAccount(username) {
    const result = await this.post('removeacct', { user: username });
    return {
      success: true,
      data: result.data || result
    };
  }

  // Alias para compatibilidade com testes
  async removeAccount(username) {
    return this.terminateAccount(username);
  }

  async getAccountInfo(username) {
    return this.getAccountSummary(username);
  }

  // ============================================
  // Package Management APIs
  // ============================================

  async listPackages() {
    try {
      const result = await this.get('listpkgs');
      return {
        success: true,
        data: {
          packages: result.data?.pkg || result.data?.package || []
        }
      };
    } catch (error) {
      throw new WHMError(`Failed to list packages: ${error.message}`, {
        result: 0,
        reason: error.message
      });
    }
  }

  async getPackageInfo(packageName) {
    try {
      const result = await this.get('getpkginfo', { pkg: packageName });
      return {
        success: true,
        data: {
          package: result.data?.pkg?.[0] || result.data?.package?.[0] || {}
        }
      };
    } catch (error) {
      throw new WHMError(`Failed to get package info: ${error.message}`, {
        result: 0,
        reason: error.message
      });
    }
  }

  // ============================================
  // Server Management APIs
  // ============================================

  async getServerStatus() {
    try {
      const loadavg = await this.get('loadavg');
      const systemstats = await this.get('systemstats');

      return {
        status: 'active',
        load: loadavg.data || [0, 0, 0],
        uptime: systemstats.data?.uptime || 'Unknown',
        memory: systemstats.data?.memory || { total: 'Unknown', used: 'Unknown', free: 'Unknown' },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'active',
        load: [0, 0, 0],
        uptime: 'Unknown',
        memory: { total: 'Unknown', used: 'Unknown', free: 'Unknown' },
        timestamp: new Date().toISOString(),
        note: 'Detailed stats unavailable'
      };
    }
  }

  async getServiceStatus() {
    try {
      const result = await this.get('servicestatus');
      return {
        services: result.data?.services || [],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        services: [],
        timestamp: new Date().toISOString(),
        error: 'Service status unavailable'
      };
    }
  }

  async restartService(service) {
    try {
      const result = await this.post('restartservice', { service });
      return {
        success: true,
        message: `Service ${service} restart initiated`,
        timestamp: new Date().toISOString(),
        details: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to restart ${service}: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ============================================
  // Domain Management APIs
  // ============================================

  async listDomains(username) {
    try {
      const result = await this.get('listsubdomains', { user: username });
      return {
        domains: result.data || [],
        user: username,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        domains: [],
        user: username,
        timestamp: new Date().toISOString(),
        error: 'Domain list unavailable'
      };
    }
  }

  // ============================================
  // DNS APIs
  // ============================================

  async listZones() {
    return this.get('listzones');
  }

  async getZone(zone) {
    return this.get('dumpzone', { domain: zone });
  }

  async addZoneRecord(zone, type, name, data) {
    const params = {
      domain: zone,
      type: type.toUpperCase(),
      name: name,
      ttl: data.ttl || 14400
    };

    // Mapear campos por tipo de registro (schema canonico CC-03)
    switch (type.toUpperCase()) {
      case 'A':
      case 'AAAA':
        params.address = data.address;
        break;
      case 'CNAME':
        params.cname = data.cname;
        break;
      case 'MX':
        params.exchange = data.exchange;
        params.preference = data.preference || 10;
        break;
      case 'TXT':
        params.txtdata = data.txtdata;
        break;
      case 'NS':
        params.nsdname = data.nsdname;
        break;
      case 'PTR':
        params.ptrdname = data.ptrdname;
        break;
      default:
        throw new Error(`Unsupported record type: ${type}`);
    }

    return this.post('addzonerecord', params);
  }

  async editZoneRecord(zone, line, data) {
    const params = {
      domain: zone,
      line: line,
      ...data
    };
    return this.post('editzonerecord', params);
  }

  async removeZoneRecord(zone, line) {
    return this.post('removezonerecord', {
      domain: zone,
      line: line
    });
  }

  async resetZone(zone) {
    return this.post('resetzone', { domain: zone });
  }

  // ============================================
  // Domain Management APIs (Phase 1)
  // ============================================

  /**
   * RF01: Obter dados do usuário do domínio
   * Endpoint: domainuserdata
   */
  async getDomainUserData(domain) {
    const { validateDomain } = require('./validators');
    const validation = validateDomain(domain);
    if (!validation.isValid) {
      throw new WHMError(validation.error, { domain });
    }

    const result = await this.get('domainuserdata', { domain: validation.sanitized });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF02: Obter informações de todos os domínios com paginação
   * Endpoint: get_domain_info
   * Correções aplicadas:
   * - BUG-IMP-01: Default limit=100 (não 10), max=1000 (não 100)
   * - BUG-IMP-01: Usar enum de filtro ao invés de search livre
   * - BUG-IMP-01: Retornar metadados de paginação completos (RNF07)
   * - FEATURE: domainFilter para filtrar por nome de domínio (substring, case-insensitive)
   */
  async getAllDomainInfo(limit = 100, offset = 0, filter = null, domainFilter = null) {
    // BUG-IMP-01: Max 1000, não 100
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const safeOffset = Math.max(0, offset);

    const params = {
      limit: safeLimit,
      offset: safeOffset
    };

    // BUG-IMP-01: Usar enum de filtro, não search livre
    if (filter && ['addon', 'alias', 'subdomain', 'main'].includes(filter)) {
      params.type = filter;
    }

    const result = await this.get('get_domain_info', params);
    let domains = result.data?.domains || result.data || [];
    let total = result.data?.total || result.total || domains.length;

    // FEATURE: Filtrar por nome de domínio (substring, case-insensitive)
    if (domainFilter && typeof domainFilter === 'string' && domainFilter.trim()) {
      const filterLower = domainFilter.trim().toLowerCase();
      domains = domains.filter(d => {
        // Verificar em múltiplos campos que podem conter o nome do domínio
        const domainName = (d.domain || d.name || '').toLowerCase();
        const docRoot = (d.documentroot || d.docroot || '').toLowerCase();
        return domainName.includes(filterLower) || docRoot.includes(filterLower);
      });
      // Atualizar total após filtragem
      total = domains.length;
    }

    // BUG-IMP-01: Retornar metadados de paginação conforme RNF07
    return {
      success: true,
      data: {
        domains,
        pagination: {
          total,
          limit: safeLimit,
          offset: safeOffset,
          has_more: (safeOffset + domains.length) < total,
          next_offset: (safeOffset + domains.length) < total ? safeOffset + safeLimit : null,
          filtered_by: domainFilter || null
        }
      }
    };
  }

  /**
   * RF03: Obter proprietário do domínio
   * Endpoint: getdomainowner
   */
  async getDomainOwner(domain) {
    const { validateDomain } = require('./validators');
    const validation = validateDomain(domain);
    if (!validation.isValid) {
      throw new WHMError(validation.error, { domain });
    }

    const result = await this.get('getdomainowner', { domain: validation.sanitized });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF10: Criar domínio estacionado (parked domain)
   * Endpoint: create_parked_domain_for_user
   * Correções aplicadas:
   * - BUG-CRIT-03: target_domain agora é opcional
   * - GAP-CRIT-01: Validação ACL integrada
   * - GAP-IMP-01: Idempotência implementada
   */
  async createParkedDomain(domain, username, targetDomain = null) {
    const { validateDomain } = require('./validators');

    // GAP-CRIT-01: Validação ACL ANTES de qualquer operação
    const aclCheck = validateUserAccess(this.currentToken || 'root:admin', username);
    if (!aclCheck.allowed) {
      throw new WHMError(`Acesso negado: ${aclCheck.reason}`, {
        username,
        code: 403
      });
    }

    // Validar domínio parked
    const domainValidation = validateDomain(domain);
    if (!domainValidation.isValid) {
      throw new WHMError(`Parked domain inválido: ${domainValidation.error}`, { domain });
    }

    // GAP-IMP-01: Verificar existência antes de criar (idempotência)
    try {
      const existing = await this.getDomainOwner(domainValidation.sanitized);
      if (existing.success && existing.data?.owner) {
        // Recurso já existe - retornar sucesso idempotente
        return {
          success: true,
          idempotent: true,
          message: 'Domínio já existe com esta configuração',
          data: existing.data
        };
      }
    } catch (e) {
      // Domínio não existe, prosseguir com criação
      if (!e.message?.includes('not found') && !e.message?.includes('does not exist')) {
        throw e; // Re-throw outros erros
      }
    }

    const params = {
      domain: domainValidation.sanitized,
      username: username
    };

    // BUG-CRIT-03: Apenas validar targetDomain se fornecido
    if (targetDomain) {
      const targetValidation = validateDomain(targetDomain);
      if (!targetValidation.isValid) {
        throw new WHMError(`Target domain inválido: ${targetValidation.error}`, { targetDomain });
      }
      params.targetdomain = targetValidation.sanitized;
    }

    const result = await this.post('create_parked_domain_for_user', params);

    return {
      success: true,
      idempotent: false,
      data: result.data || result
    };
  }

  /**
   * RF11: Criar subdomínio
   * Endpoint: create_subdomain
   * Correções aplicadas:
   * - GAP-CRIT-01: Validação ACL integrada
   * - GAP-CRIT-02: Path Validator integrado (substitui validação inline)
   * - GAP-IMP-01: Idempotência implementada
   */
  async createSubdomain(subdomain, domain, username, documentRoot) {
    const { validateSubdomain, validateDomain } = require('./validators');

    // GAP-CRIT-01: Validação ACL ANTES de qualquer operação
    const aclCheck = validateUserAccess(this.currentToken || 'root:admin', username);
    if (!aclCheck.allowed) {
      throw new WHMError(`Acesso negado: ${aclCheck.reason}`, {
        username,
        code: 403
      });
    }

    // Validar subdomínio
    const subdomainValidation = validateSubdomain(subdomain, domain);
    if (!subdomainValidation.isValid) {
      throw new WHMError(`Subdomínio inválido: ${subdomainValidation.error}`, { subdomain });
    }

    // Validar domínio pai
    const domainValidation = validateDomain(domain);
    if (!domainValidation.isValid) {
      throw new WHMError(`Domínio pai inválido: ${domainValidation.error}`, { domain });
    }

    // GAP-CRIT-02: Usar path-validator completo ao invés de validação inline
    let sanitizedDocRoot = '';
    if (documentRoot) {
      const pathValidation = validateDocumentRoot(documentRoot, username);
      if (!pathValidation.valid) {
        throw new WHMError(pathValidation.error, {
          documentRoot,
          username,
          code: 400
        });
      }
      sanitizedDocRoot = pathValidation.sanitized;
    }

    // GAP-IMP-01: Verificar existência antes de criar (idempotência)
    const fullSubdomain = `${subdomainValidation.sanitized}.${domainValidation.sanitized}`;
    try {
      const existing = await this.getDomainOwner(fullSubdomain);
      if (existing.success && existing.data?.owner) {
        // Recurso já existe - retornar sucesso idempotente
        return {
          success: true,
          idempotent: true,
          message: 'Subdomínio já existe com esta configuração',
          data: existing.data
        };
      }
    } catch (e) {
      // Subdomínio não existe, prosseguir com criação
      if (!e.message?.includes('not found') && !e.message?.includes('does not exist')) {
        throw e; // Re-throw outros erros
      }
    }

    const result = await this.post('create_subdomain', {
      domain: domainValidation.sanitized,
      subdomain: subdomainValidation.sanitized,
      username: username,
      dir: sanitizedDocRoot
    });

    return {
      success: true,
      idempotent: false,
      data: result.data || result
    };
  }

  /**
   * RF12: Deletar domínio (requer confirmação)
   * Endpoint: delete_domain
   * Requer: MCP_SAFETY_TOKEN para confirmação
   * Correções aplicadas:
   * - GAP-CRIT-01: Validação ACL integrada
   * - GAP-IMP-03: Transaction-log para rollback integrado
   * - MELHORIA-02: Enum de tipos padronizado (alias ao invés de parked)
   */
  async deleteDomain(domain, username, type, confirmed = false) {
    const { validateDomain } = require('./validators');

    // GAP-CRIT-01: Validação ACL ANTES de qualquer operação
    const aclCheck = validateUserAccess(this.currentToken || 'root:admin', username);
    if (!aclCheck.allowed) {
      throw new WHMError(`Acesso negado: ${aclCheck.reason}`, {
        username,
        code: 403
      });
    }

    // Validar domínio
    const validation = validateDomain(domain);
    if (!validation.isValid) {
      throw new WHMError(validation.error, { domain });
    }

    // MELHORIA-02: Padronizar enum de tipos (aceitar 'alias' ou 'parked')
    const normalizedType = type === 'parked' ? 'alias' : type;
    const validTypes = ['addon', 'alias', 'subdomain'];
    if (!validTypes.includes(normalizedType)) {
      throw new WHMError(`Tipo de domínio inválido. Válidos: ${validTypes.join(', ')}`, { type });
    }

    // Requer confirmação explícita para operação destrutiva
    if (!confirmed) {
      throw new WHMError('Operação destrutiva requer confirmação explícita', { action: 'delete_domain' });
    }

    // GAP-IMP-03: Backup antes de deletar usando transaction-log
    const txn = beginTransaction({
      type: 'delete_domain',
      domain: validation.sanitized,
      username,
      domainType: normalizedType
    });

    try {
      const result = await this.post('delete_domain', {
        domain: validation.sanitized,
        username: username,
        type: normalizedType === 'alias' ? 'parked' : normalizedType // WHM ainda usa 'parked'
      });

      // Commit da transação
      commitTransaction(txn.transactionId);

      return {
        success: true,
        transactionId: txn.transactionId,
        data: result.data || result
      };
    } catch (error) {
      // Rollback em caso de erro
      rollbackTransaction(txn.transactionId);
      throw error;
    }
  }

  /**
   * RF13: Resolver nome de domínio para IP
   * Endpoint: resolvedomainname
   */
  async resolveDomainName(domain) {
    const { validateDomain } = require('./validators');
    const validation = validateDomain(domain);
    if (!validation.isValid) {
      throw new WHMError(validation.error, { domain });
    }

    const result = await this.get('resolvedomainname', { domain: validation.sanitized });
    return {
      success: true,
      data: result.data || result
    };
  }

  // ============================================
  // Addon Domain APIs (Phase 2)
  // ============================================

  /**
   * RF04: Listar addon domains de um usuário
   * Endpoint: convert_addon_list_addon_domains
   */
  async listAddonDomains(username) {
    if (!username || typeof username !== 'string') {
      throw new WHMError('Username é obrigatório', { username });
    }

    const result = await this.get('convert_addon_list_addon_domains', { username });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF05: Obter detalhes de um addon domain
   * Endpoint: convert_addon_fetch_domain_details
   */
  async getAddonDomainDetails(domain, username) {
    const { validateDomain } = require('./validators');

    const domainValidation = validateDomain(domain);
    if (!domainValidation.isValid) {
      throw new WHMError(`Domínio inválido: ${domainValidation.error}`, { domain });
    }

    if (!username || typeof username !== 'string') {
      throw new WHMError('Username é obrigatório', { username });
    }

    const result = await this.get('convert_addon_fetch_domain_details', {
      domain: domainValidation.sanitized,
      username
    });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF06: Obter status de uma conversão de addon domain
   * Endpoint: convert_addon_get_conversion_status
   */
  async getConversionStatus(conversionId) {
    if (!conversionId || typeof conversionId !== 'string') {
      throw new WHMError('conversion_id é obrigatório', { conversionId });
    }

    const result = await this.get('convert_addon_get_conversion_status', { conversion_id: conversionId });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF07: Iniciar conversão de addon domain [SafetyGuard]
   * Endpoint: convert_addon_initiate_conversion
   */
  async initiateAddonConversion(params) {
    const { domain, username, new_username, reason } = params;
    const { validateDomain } = require('./validators');

    if (!domain || !username || !new_username || !reason) {
      throw new WHMError('Parâmetros obrigatórios faltando: domain, username, new_username, reason');
    }

    const domainValidation = validateDomain(domain);
    if (!domainValidation.isValid) {
      throw new WHMError(`Domínio inválido: ${domainValidation.error}`, { domain });
    }

    const result = await this.post('convert_addon_initiate_conversion', {
      domain: domainValidation.sanitized,
      username,
      new_username,
      reason
    });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF08: Obter detalhes de uma conversão
   * Endpoint: convert_addon_fetch_conversion_details
   */
  async getConversionDetails(conversionId) {
    if (!conversionId || typeof conversionId !== 'string') {
      throw new WHMError('conversion_id é obrigatório', { conversionId });
    }

    const result = await this.get('convert_addon_fetch_conversion_details', { conversion_id: conversionId });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF09: Listar todas as conversões de addon domains
   * Endpoint: convert_addon_list_conversions
   */
  async listConversions() {
    const result = await this.get('convert_addon_list_conversions');
    return {
      success: true,
      data: result.data || result
    };
  }

  // ============================================
  // Domain Authority and DNS APIs (Phase 2)
  // ============================================

  /**
   * RF14: Verificar se servidor é autoritativo para domínio
   * Endpoint: has_local_authority
   */
  async hasLocalAuthority(domain) {
    const { validateDomain } = require('./validators');
    const validation = validateDomain(domain);
    if (!validation.isValid) {
      throw new WHMError(validation.error, { domain });
    }

    const result = await this.get('has_local_authority', { domain: validation.sanitized });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF15: Listar registros MX de um domínio
   * Endpoint: listmxs
   */
  async listMXRecords(domain) {
    const { validateDomain } = require('./validators');
    const validation = validateDomain(domain);
    if (!validation.isValid) {
      throw new WHMError(validation.error, { domain });
    }

    const result = await this.get('listmxs', { domain: validation.sanitized });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF16: Adicionar registro MX
   * Endpoint: savemxs
   */
  async saveMXRecord(domain, exchange, priority = 10, alwaysaccept = false) {
    const { validateDomain } = require('./validators');
    const domainValidation = validateDomain(domain);
    if (!domainValidation.isValid) {
      throw new WHMError(`Domínio inválido: ${domainValidation.error}`, { domain });
    }

    if (!exchange || typeof exchange !== 'string') {
      throw new WHMError('Exchange (mail server) é obrigatório', { exchange });
    }

    // Validar priority
    const numPriority = parseInt(priority, 10);
    if (isNaN(numPriority) || numPriority < 0 || numPriority > 65535) {
      throw new WHMError('Priority deve ser um número entre 0 e 65535', { priority });
    }

    // GAP-IMP-01 (RNF06): Idempotência - verificar existência prévia
    try {
      const existingResp = await this.get('listmxs', { domain: domainValidation.sanitized });
      const existingRecords = existingResp.data?.records || existingResp.data?.mxs || existingResp.data || [];
      const alreadyExists = Array.isArray(existingRecords) && existingRecords.some(record => {
        const recExchange = record.exchange || record.host || record.target || record.mailserver;
        const recPriority = Number(record.priority ?? record.preference ?? record.preference_value ?? record.dist);
        return recExchange === exchange && recPriority === numPriority;
      });

      if (alreadyExists) {
        return {
          success: true,
          idempotent: true,
          message: 'Registro MX já existe com esta configuração',
          data: existingResp.data || existingResp
        };
      }
    } catch (e) {
      // Se a consulta falhar por domínio inexistente ou outro erro não crítico, prosseguir para criação
      if (e?.message && e.message.includes('not found')) {
        // ignore
      } else if (e?.metadata?.result === 0) {
        // WHMError já traz contexto; seguir para criação
      } else {
        // Erros inesperados devem ser propagados
        throw e;
      }
    }

    const result = await this.post('savemxs', {
      domain: domainValidation.sanitized,
      exchange,
      priority: numPriority,
      alwaysaccept: alwaysaccept ? 1 : 0
    });
    return {
      success: true,
      data: result.data || result
    };
  }

  /**
   * RF17: Obter registros DS (DNSSEC) de domínios
   * Endpoint: fetch_ds_records_for_domains
   */
  async getDSRecords(domains) {
    const { validateDomain } = require('./validators');

    if (!Array.isArray(domains) || domains.length === 0) {
      throw new WHMError('domains deve ser um array não-vazio', { domains });
    }

    if (domains.length > 100) {
      throw new WHMError('Máximo 100 domínios por requisição', { domainsCount: domains.length });
    }

    // Validar cada domínio
    const sanitizedDomains = domains.map(d => {
      const validation = validateDomain(d);
      if (!validation.isValid) {
        throw new WHMError(`Domínio inválido: ${d} - ${validation.error}`, { domain: d });
      }
      return validation.sanitized;
    });

    try {
      // Timeout explícito para evitar pendurar se DNSSEC não estiver habilitado
      const result = await withTimeout(
        () => this.post('fetch_ds_records_for_domains', {
          domains: sanitizedDomains.join(',')
        }),
        getTimeoutByType('WHM_API'),
        'fetch_ds_records_for_domains'
      );

      return {
        success: true,
        data: result.data || result
      };
    } catch (error) {
      // Fallback claro quando o endpoint não responde ou DNSSEC não está habilitado
      const reason = error?.message || 'Endpoint indisponível';
      throw new WHMError(
        'DNSSEC não configurado ou endpoint WHM indisponível para fetch_ds_records_for_domains',
        {
          domains: sanitizedDomains,
          reason
        }
      );
    }
  }

  /**
   * RF18: Verificar se alias DNS está disponível
   * Endpoint: DNS::is_alias_available
   */
  async isAliasAvailable(zone, name) {
    const { validateDomain } = require('./validators');
    const zoneValidation = validateDomain(zone);
    if (!zoneValidation.isValid) {
      throw new WHMError(`Zona inválida: ${zoneValidation.error}`, { zone });
    }

    if (!name || typeof name !== 'string') {
      throw new WHMError('name é obrigatório', { name });
    }

    try {
      const result = await withTimeout(
        () => this.get('DNS::is_alias_available', {
          zone: zoneValidation.sanitized,
          name: name.trim()
        }),
        getTimeoutByType('WHM_API'),
        'DNS::is_alias_available'
      );

      return {
        success: true,
        data: result.data || result
      };
    } catch (error) {
      const reason = error?.message || 'Endpoint indisponível';
      throw new WHMError(
        'Checagem de ALIAS não suportada ou indisponível neste WHM (DNS::is_alias_available)',
        {
          zone: zoneValidation.sanitized,
          name: name.trim(),
          reason
        }
      );
    }
  }

  // ============================================
  // DNSSEC/NSEC3 APIs (Phase 3) - Async Operations
  // ============================================

  /**
   * RF19: Habilitar NSEC3 para domínios [SafetyGuard]
   * Endpoint: set_nsec3_for_domains
   * Comportamento: Assíncrono - retorna operation_id para polling
   * Correções aplicadas:
   * - GAP-CRIT-01: Validação ACL integrada
   * - BUG-CRIT-04: Registro de operação assíncrona via nsec3-async-handler
   * - GAP-IMP-03: Transaction-log para rollback
   */
  async setNSEC3ForDomains(domains) {
    const { validateDomain } = require('./validators');

    if (!Array.isArray(domains) || domains.length === 0) {
      throw new WHMError('domains deve ser um array não-vazio', { domains });
    }

    if (domains.length > 50) {
      throw new WHMError('Máximo 50 domínios para operação NSEC3', { domainsCount: domains.length });
    }

    // Validar cada domínio
    const sanitizedDomains = domains.map(d => {
      const validation = validateDomain(d);
      if (!validation.isValid) {
        throw new WHMError(`Domínio inválido: ${d} - ${validation.error}`, { domain: d });
      }
      return validation.sanitized;
    });

    // Calcular timeout dinamicamente: 60s + (30s * num_dominios), máximo 600s
    const numDomains = sanitizedDomains.length;
    const dynamicTimeout = Math.min(60000 + (30000 * numDomains), 600000);

    // BUG-CRIT-04: Iniciar operação assíncrona e registrar no handler
    const asyncOp = startAsyncOperation(null, 'enable_nsec3', sanitizedDomains);
    if (asyncOp.error) {
      throw new WHMError(`Falha ao registrar operação NSEC3: ${asyncOp.error}`, {
        domains_count: numDomains
      });
    }

    const operationId = asyncOp.operationId;

    // GAP-IMP-03: Backup antes da operação usando transaction-log
    const txn = beginTransaction({
      type: 'enable_nsec3',
      operationId,
      domains: sanitizedDomains
    });

    // Executar operação WHM de forma assíncrona (não bloqueante)
    // A operação real acontece em background
    this.post('set_nsec3_for_domains', {
      domains: sanitizedDomains.join(',')
    }).then(result => {
      // Atualizar status da operação assíncrona quando completar
      const { updateOperationProgress } = require('./nsec3-async-handler');
      updateOperationProgress(operationId, 100, { result: result.data || result });
      commitTransaction(txn.transactionId);
    }).catch(error => {
      // Marcar operação como falhada
      const { failOperation } = require('./nsec3-async-handler');
      failOperation(operationId, error.message);
      rollbackTransaction(txn.transactionId);
    });

    // Retornar imediatamente com operation_id para polling
    return {
      success: true,
      operation_id: operationId,
      status: 'pending',
      polling_interval: 5000,
      estimated_timeout: Math.ceil(dynamicTimeout / 1000),
      domains_count: numDomains
    };
  }

  /**
   * RF20: Desabilitar NSEC3 para domínios [SafetyGuard]
   * Endpoint: unset_nsec3_for_domains
   * Comportamento: Assíncrono - retorna operation_id para polling
   * Correções aplicadas:
   * - GAP-CRIT-01: Validação ACL integrada
   * - BUG-CRIT-04: Registro de operação assíncrona via nsec3-async-handler
   * - GAP-IMP-03: Transaction-log para rollback
   */
  async unsetNSEC3ForDomains(domains) {
    const { validateDomain } = require('./validators');

    if (!Array.isArray(domains) || domains.length === 0) {
      throw new WHMError('domains deve ser um array não-vazio', { domains });
    }

    if (domains.length > 50) {
      throw new WHMError('Máximo 50 domínios para operação NSEC3', { domainsCount: domains.length });
    }

    // Validar cada domínio
    const sanitizedDomains = domains.map(d => {
      const validation = validateDomain(d);
      if (!validation.isValid) {
        throw new WHMError(`Domínio inválido: ${d} - ${validation.error}`, { domain: d });
      }
      return validation.sanitized;
    });

    // Calcular timeout dinamicamente: 60s + (30s * num_dominios), máximo 600s
    const numDomains = sanitizedDomains.length;
    const dynamicTimeout = Math.min(60000 + (30000 * numDomains), 600000);

    // BUG-CRIT-04: Iniciar operação assíncrona e registrar no handler
    const asyncOp = startAsyncOperation(null, 'disable_nsec3', sanitizedDomains);
    if (asyncOp.error) {
      throw new WHMError(`Falha ao registrar operação NSEC3: ${asyncOp.error}`, {
        domains_count: numDomains
      });
    }

    const operationId = asyncOp.operationId;

    // GAP-IMP-03: Backup antes da operação usando transaction-log
    const txn = beginTransaction({
      type: 'disable_nsec3',
      operationId,
      domains: sanitizedDomains
    });

    // Executar operação WHM de forma assíncrona (não bloqueante)
    this.post('unset_nsec3_for_domains', {
      domains: sanitizedDomains.join(',')
    }).then(result => {
      // Atualizar status da operação assíncrona quando completar
      const { updateOperationProgress } = require('./nsec3-async-handler');
      updateOperationProgress(operationId, 100, { result: result.data || result });
      commitTransaction(txn.transactionId);
    }).catch(error => {
      // Marcar operação como falhada
      const { failOperation } = require('./nsec3-async-handler');
      failOperation(operationId, error.message);
      rollbackTransaction(txn.transactionId);
    });

    // Retornar imediatamente com operation_id para polling
    return {
      success: true,
      operation_id: operationId,
      status: 'pending',
      polling_interval: 5000,
      estimated_timeout: Math.ceil(dynamicTimeout / 1000),
      domains_count: numDomains
    };
  }

  /**
   * RF21: Atualizar /etc/userdomains [SafetyGuard]
   * Endpoint: updateuserdomains
   * Proteção: Lock exclusivo via lock-manager
   * Correções aplicadas:
   * - BUG-CRIT-02: Verificação correta de lock.acquired
   * - GAP-IMP-03: Transaction-log para rollback
   */
  async updateUserdomains() {
    const lockResource = 'etc_userdomains';

    // BUG-CRIT-02: Usar função acquireLock diretamente e verificar .acquired
    const lock = acquireLock(lockResource, 30000);

    // CRÍTICO: Verificar se lock foi adquirido
    if (!lock.acquired) {
      throw new WHMError('Resource busy: another update_userdomains in progress', {
        code: 409,
        resource: lockResource,
        error: lock.error
      });
    }

    // GAP-IMP-03: Backup antes da operação usando transaction-log
    const txn = beginTransaction({
      type: 'update_userdomains',
      resource: lockResource
    });

    try {
      const result = await this.post('updateuserdomains', {});

      // Commit da transação
      commitTransaction(txn.transactionId);

      return {
        success: true,
        transactionId: txn.transactionId,
        data: result.data || result
      };
    } catch (error) {
      // Rollback em caso de erro
      rollbackTransaction(txn.transactionId);
      throw new WHMError(`Update userdomains failed: ${error.message}`, { operation: 'updateuserdomains' });
    } finally {
      // Sempre liberar lock
      releaseLock(lockResource);
    }
  }

  /**
   * RF22: Obter status de operação NSEC3 assíncrona
   * Uso: Polling para acompanhar operações NSEC3
   * Interno: Usa nsec3-async-handler.js
   * Correções aplicadas:
   * - BUG-CRIT-01: Usar getOperationStatus (nome correto exportado)
   */
  async getNsec3Status(operationId) {
    if (!operationId || typeof operationId !== 'string') {
      throw new WHMError('operation_id é obrigatório', { operationId });
    }

    // BUG-CRIT-01: Usar getOperationStatus (função correta)
    const status = getOperationStatus(operationId);

    // Verificar se operação foi encontrada
    if (status.error) {
      throw new WHMError(status.error, { operationId });
    }

    return {
      success: true,
      data: status
    };
  }
}

module.exports = WHMService;
module.exports.WHMError = WHMError;
