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
}

module.exports = WHMService;
module.exports.WHMError = WHMError;
