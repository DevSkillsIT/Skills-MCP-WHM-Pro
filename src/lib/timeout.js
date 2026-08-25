/**
 * Sistema de Timeout Hierarchical (AC17)
 * Implementa RNF01: Performance e Timeout
 *
 * Valores obrigatorios:
 * - WHM API: 30s
 * - SSH: 60s
 * - DNS operations: 45s
 * - HTTP geral: 30s
 */

const logger = require('./logger');
const { recordError } = require('./metrics');

// Configuracao de timeouts por tipo de operacao (em ms)
// Valores podem ser sobrescritos via variaveis de ambiente
const TIMEOUT_CONFIG = {
  WHM_API: parseInt(process.env.TIMEOUT_WHM_API) || 30000,      // 30 segundos (default)
  SSH: parseInt(process.env.TIMEOUT_SSH) || 60000,              // 60 segundos (default)
  DNS: parseInt(process.env.TIMEOUT_DNS) || 45000,              // 45 segundos (default)
  HTTP: parseInt(process.env.TIMEOUT_HTTP) || 30000,            // 30 segundos (default)
  FILE: parseInt(process.env.TIMEOUT_FILE) || 30000,            // 30 segundos (default)
  DEFAULT: parseInt(process.env.TIMEOUT_DEFAULT) || 30000       // 30 segundos (default)
};

/**
 * Deadline de REQUISICAO (tools/call, resources/read, prompts/get).
 *
 * Precisa ser MENOR que o timeout do cliente MCP. Com os dois em 30s o cliente
 * desistia primeiro e o modelo recebia `{"error": ""}` — a excecao de timeout do
 * httpx tem mensagem vazia, entao nao sobrava nem causa nem instrucao.
 * Perdendo a corrida de proposito, sempre entregamos um erro explicativo.
 *
 * Ao aumentar o timeout do cliente, aumente MCP_REQUEST_DEADLINE_MS junto,
 * mantendo a folga.
 */
const CLIENT_TIMEOUT_MS = parseInt(process.env.MCP_CLIENT_TIMEOUT_MS) || 30000;
const REQUEST_DEADLINE_MS = parseInt(process.env.MCP_REQUEST_DEADLINE_MS)
  || Math.max(5000, CLIENT_TIMEOUT_MS - 5000);

// Mapeamento de operacoes para tipos de timeout.
//
// ATENCAO: as chaves devem ser os nomes REAIS das tools (as consolidadas).
// O mapa anterior so continha os nomes pre-consolidacao, entao as 15 tools em
// uso caiam todas no DEFAULT: operacoes DNS nunca recebiam seus 45s e as de SSH
// nunca recebiam seus 60s. Ao renomear uma tool, atualize aqui.
const OPERATION_TIMEOUT_MAP = {
  // Tools consolidadas em uso
  'whm_cpanel_search_hosting_accounts': 'WHM_API',
  'whm_cpanel_manage_hosting_accounts': 'WHM_API',
  'whm_cpanel_search_server_status': 'WHM_API',
  'whm_cpanel_manage_server_service': 'WHM_API',
  'whm_cpanel_search_hosted_domains': 'WHM_API',
  'whm_cpanel_manage_hosted_domains': 'WHM_API',
  'whm_cpanel_manage_dnssec_settings': 'DNS',
  'whm_cpanel_search_dns_zone_records': 'DNS',
  'whm_cpanel_manage_dns_zone_records': 'DNS',
  'whm_cpanel_manage_system_services': 'SSH',
  'whm_cpanel_search_account_files': 'FILE',
  'whm_cpanel_manage_account_files': 'FILE',
  'whm_cpanel_list_server_resources': 'DEFAULT',
  'whm_cpanel_read_server_resource': 'WHM_API',
  'whm_cpanel_generate_report': 'WHM_API',

  // Nomes legados (pre-consolidacao), mantidos para chamadas internas antigas
  'whm_cpanel_list_accounts': 'WHM_API',
  'whm_cpanel_create_account': 'WHM_API',
  'whm_cpanel_suspend_account': 'WHM_API',
  'whm_cpanel_unsuspend_account': 'WHM_API',
  'whm_cpanel_delete_account': 'WHM_API',
  'whm_cpanel_get_account_summary': 'WHM_API',
  'whm_cpanel_get_server_status': 'WHM_API',
  'whm_cpanel_get_services_status': 'WHM_API',
  'whm_cpanel_restart_service': 'WHM_API',
  'whm_cpanel_list_all_domains': 'WHM_API',
  'whm_cpanel_list_account_domains': 'WHM_API',
  'whm_cpanel_get_domain_data': 'WHM_API',
  'whm_cpanel_get_domain_owner': 'WHM_API',
  'whm_cpanel_create_domain_alias': 'WHM_API',
  'whm_cpanel_create_subdomain': 'WHM_API',
  'whm_cpanel_delete_domain': 'WHM_API',
  'whm_cpanel_resolve_domain_ip': 'WHM_API',
  'whm_cpanel_list_addon_domains': 'WHM_API',
  'whm_cpanel_get_addon_domain_details': 'WHM_API',
  'whm_cpanel_get_addon_conversion_status': 'WHM_API',
  'whm_cpanel_create_addon_conversion': 'WHM_API',
  'whm_cpanel_get_addon_conversion_details': 'WHM_API',
  'whm_cpanel_list_addon_conversions': 'WHM_API',
  'whm_cpanel_check_domain_authority': 'WHM_API',
  'whm_cpanel_get_dnssec_ds_records': 'WHM_API',
  'whm_cpanel_enable_dnssec_nsec3': 'WHM_API',
  'whm_cpanel_disable_dnssec_nsec3': 'WHM_API',
  'whm_cpanel_get_nsec3_operation_status': 'WHM_API',
  'whm_cpanel_update_userdomains_cache': 'WHM_API',
  'whm_cpanel_list_dns_zones': 'DNS',
  'whm_cpanel_get_dns_zone_records': 'DNS',
  'whm_cpanel_check_dns_nested_subdomains': 'DNS',
  'whm_cpanel_search_dns_record': 'DNS',
  'whm_cpanel_create_dns_record': 'DNS',
  'whm_cpanel_update_dns_record': 'DNS',
  'whm_cpanel_delete_dns_record': 'DNS',
  'whm_cpanel_reset_dns_zone': 'DNS',
  'whm_cpanel_list_dns_mx_records': 'DNS',
  'whm_cpanel_create_dns_mx_record': 'DNS',
  'whm_cpanel_check_dns_alias_available': 'DNS',
  'whm_cpanel_restart_system_service': 'SSH',
  'whm_cpanel_get_system_load_metrics': 'SSH',
  'whm_cpanel_read_system_log_lines': 'SSH',
  'whm_cpanel_list_user_files': 'FILE',
  'whm_cpanel_read_user_file': 'FILE',
  'whm_cpanel_write_user_file': 'FILE',
  'whm_cpanel_delete_user_file': 'FILE'
};

/**
 * Classe de erro de timeout
 */
class TimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`Operation timed out after ${timeoutMs / 1000}s`);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.timeoutSeconds = timeoutMs / 1000;
    this.code = -32000; // Codigo JSON-RPC para server error
  }

  toJsonRpcError() {
    return {
      code: this.code,
      message: `Operation timed out after ${this.timeoutSeconds}s`,
      data: {
        operation: this.operation,
        timeout_seconds: this.timeoutSeconds,
        suggestion: this.getSuggestion()
      }
    };
  }

  getSuggestion() {
    const type = OPERATION_TIMEOUT_MAP[this.operation] || 'DEFAULT';
    switch (type) {
      case 'WHM_API':
        return 'O servidor WHM nao respondeu a tempo. Repetir a MESMA chamada agora tende a estourar de novo. Outras tools do WHM continuam funcionando.';
      case 'SSH':
        return 'O comando via SSH nao terminou a tempo (servidor sob carga). Reduza o escopo do comando ou consulte o mesmo dado pela API WHM.';
      case 'DNS':
        return 'A zona pode ser grande demais para uma chamada. Consulte uma zona especifica em vez de todas, ou filtre por tipo de registro.';
      case 'FILE':
        return 'Arquivo grande demais para uma leitura. Peca menos linhas ou um caminho mais especifico.';
      default:
        return 'A operacao excedeu o tempo limite. Nao repita identica; reduza o escopo da consulta.';
    }
  }
}

/**
 * Erro de deadline da requisicao inteira (nivel JSON-RPC).
 * Distinto de TimeoutError: aqui o orcamento TOTAL da chamada acabou, nao o de
 * uma operacao isolada.
 */
class DeadlineError extends Error {
  constructor(method, toolName, deadlineMs) {
    super(`Requisicao excedeu o deadline de ${Math.round(deadlineMs / 1000)}s`);
    this.name = 'DeadlineError';
    this.method = method;
    this.toolName = toolName;
    this.deadlineMs = deadlineMs;
    this.code = -32000;
  }

  toJsonRpcError() {
    return {
      code: this.code,
      message: `Tempo esgotado apos ${Math.round(this.deadlineMs / 1000)}s em ${this.toolName || this.method}. `
        + 'A chamada estava CORRETA — isto e lentidao do servidor WHM, nao erro de parametro. '
        + 'NAO repita a chamada identica nem tente outra sintaxe para os mesmos dados.',
      data: {
        method: this.method,
        tool: this.toolName,
        deadline_seconds: Math.round(this.deadlineMs / 1000),
        parametros_estavam_corretos: true,
        o_que_fazer: 'Reduza o escopo (uma conta/zona/dominio especifico em vez de todos) ou informe ao usuario que esta fonte do WHM esta lenta agora. Demais tools seguem disponiveis.',
        o_que_nao_adianta: 'Repetir a mesma chamada, trocar o nome do parametro ou tentar outra URI — o limite foi de tempo, nao de sintaxe.'
      }
    };
  }
}

/**
 * Obtem timeout para uma operacao
 * @param {string} operation - Nome da operacao
 * @returns {number} Timeout em ms
 */
function getTimeoutForOperation(operation) {
  const type = OPERATION_TIMEOUT_MAP[operation] || 'DEFAULT';
  return TIMEOUT_CONFIG[type] || TIMEOUT_CONFIG.DEFAULT;
}

/**
 * Obtem timeout por tipo
 * @param {string} type - Tipo de timeout (WHM_API, SSH, DNS, etc)
 * @returns {number} Timeout em ms
 */
function getTimeoutByType(type) {
  return TIMEOUT_CONFIG[type] || TIMEOUT_CONFIG.DEFAULT;
}

/**
 * Executa funcao com timeout
 * @param {Function} fn - Funcao async a executar
 * @param {number} timeoutMs - Timeout em ms
 * @param {string} operation - Nome da operacao para logs
 * @returns {Promise<any>} Resultado da funcao
 */
async function withTimeout(fn, timeoutMs, operation = 'operation') {
  return new Promise(async (resolve, reject) => {
    let settled = false;

    // Timer de timeout
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const error = new TimeoutError(operation, timeoutMs);
        logger.warn(`Timeout: ${operation} exceeded ${timeoutMs}ms`);
        recordError('timeout', error.code);
        reject(error);
      }
    }, timeoutMs);

    try {
      // await funciona com Promise e valores síncronos
      const result = await fn();

      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    }
  });
}

/**
 * Executa funcao com timeout baseado no tipo de operacao
 * @param {Function} fn - Funcao async a executar
 * @param {string} operation - Nome da operacao
 * @returns {Promise<any>} Resultado da funcao
 */
async function withOperationTimeout(fn, operation) {
  const timeoutMs = getTimeoutForOperation(operation);
  return withTimeout(fn, timeoutMs, operation);
}

/**
 * Executa a requisicao inteira sob deadline, garantindo que o servidor responda
 * ANTES do cliente desistir.
 *
 * @param {Function} fn - Funcao async da requisicao
 * @param {string} method - Metodo JSON-RPC (tools/call, resources/read...)
 * @param {string} [toolName] - Nome da tool/resource para a mensagem
 * @returns {Promise<any>}
 */
async function withRequestDeadline(fn, method, toolName = null) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new DeadlineError(method, toolName, REQUEST_DEADLINE_MS);
      logger.warn(`Deadline: ${toolName || method} excedeu ${REQUEST_DEADLINE_MS}ms`);
      recordError('request_deadline', error.code);
      reject(error);
    }, REQUEST_DEADLINE_MS);

    Promise.resolve()
      .then(fn)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Cria AbortController com timeout
 * @param {number} timeoutMs - Timeout em ms
 * @returns {AbortController} Controller com timeout configurado
 */
function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Adicionar metodo para limpar timeout
  controller.cleanup = () => clearTimeout(timeoutId);

  return controller;
}

/**
 * Wrapper para axios com timeout por tipo de operacao
 */
function createTimeoutAxios(axiosInstance, operationType = 'HTTP') {
  const timeout = TIMEOUT_CONFIG[operationType] || TIMEOUT_CONFIG.DEFAULT;

  return {
    async get(url, config = {}) {
      return axiosInstance.get(url, { ...config, timeout });
    },

    async post(url, data, config = {}) {
      return axiosInstance.post(url, data, { ...config, timeout });
    },

    async put(url, data, config = {}) {
      return axiosInstance.put(url, data, { ...config, timeout });
    },

    async delete(url, config = {}) {
      return axiosInstance.delete(url, config, { ...config, timeout });
    }
  };
}

module.exports = {
  TIMEOUT_CONFIG,
  OPERATION_TIMEOUT_MAP,
  REQUEST_DEADLINE_MS,
  CLIENT_TIMEOUT_MS,
  TimeoutError,
  DeadlineError,
  getTimeoutForOperation,
  getTimeoutByType,
  withTimeout,
  withOperationTimeout,
  withRequestDeadline,
  createTimeoutController,
  createTimeoutAxios
};
