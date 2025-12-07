/**
 * Metricas Prometheus (AC16)
 * Implementa CC-06: Rate Limiting e Metricas
 */

const client = require('prom-client');

// Criar registro de metricas
const register = new client.Registry();

// Adicionar metricas padrao (CPU, memoria, etc)
client.collectDefaultMetrics({ register });

/**
 * HTTP Server Metrics
 */
const httpRequestDuration = new client.Histogram({
  name: 'mcp_http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'endpoint', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

const httpRequestsTotal = new client.Counter({
  name: 'mcp_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'endpoint', 'status_code'],
  registers: [register]
});

/**
 * Tool Execution Metrics
 */
const toolExecutionDuration = new client.Histogram({
  name: 'mcp_tool_execution_duration_seconds',
  help: 'Duration of tool executions',
  labelNames: ['tool_name', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register]
});

const toolExecutionsTotal = new client.Counter({
  name: 'mcp_tool_executions_total',
  help: 'Total number of tool executions',
  labelNames: ['tool_name', 'status'],
  registers: [register]
});

/**
 * WHM API Metrics
 */
const whmApiRateLimitHits = new client.Counter({
  name: 'whm_api_rate_limit_hits_total',
  help: 'Total rate limit hits from WHM API',
  registers: [register]
});

const whmApiRequestDuration = new client.Histogram({
  name: 'whm_api_request_duration_seconds',
  help: 'Duration of WHM API requests',
  labelNames: ['endpoint', 'status_code'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register]
});

const whmApiRetries = new client.Counter({
  name: 'whm_api_retries_total',
  help: 'Total number of WHM API retries',
  labelNames: ['endpoint'],
  registers: [register]
});

/**
 * DNS Operations Metrics
 */
const dnsOperationDuration = new client.Histogram({
  name: 'dns_operation_duration_seconds',
  help: 'Duration of DNS operations',
  labelNames: ['operation', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 45],
  registers: [register]
});

const dnsBackupsCreated = new client.Counter({
  name: 'dns_backups_created_total',
  help: 'Total DNS backups created',
  labelNames: ['zone'],
  registers: [register]
});

const dnsRollbacks = new client.Counter({
  name: 'dns_rollbacks_total',
  help: 'Total DNS rollbacks performed',
  labelNames: ['zone', 'reason'],
  registers: [register]
});

/**
 * SSH Operations Metrics
 */
const sshOperationDuration = new client.Histogram({
  name: 'ssh_operation_duration_seconds',
  help: 'Duration of SSH operations',
  labelNames: ['operation', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register]
});

/**
 * Error Metrics
 */
const errorsTotal = new client.Counter({
  name: 'mcp_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code'],
  registers: [register]
});

/**
 * Middleware para medir duracao de requisicoes HTTP
 */
function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime();

  // Interceptar fim da resposta
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds + nanoseconds / 1e9;

    // Normalizar endpoint (remover parametros)
    const endpoint = req.route ? req.route.path : req.path;

    // Registrar metricas
    httpRequestDuration.observe(
      {
        method: req.method,
        endpoint: endpoint,
        status_code: res.statusCode
      },
      duration
    );

    httpRequestsTotal.inc({
      method: req.method,
      endpoint: endpoint,
      status_code: res.statusCode
    });
  });

  next();
}

/**
 * Funcao helper para medir execucao de tools
 */
function measureToolExecution(toolName, fn) {
  return async (...args) => {
    const start = process.hrtime();
    let status = 'success';

    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      status = 'error';
      throw error;
    } finally {
      const [seconds, nanoseconds] = process.hrtime(start);
      const duration = seconds + nanoseconds / 1e9;

      toolExecutionDuration.observe({ tool_name: toolName, status }, duration);
      toolExecutionsTotal.inc({ tool_name: toolName, status });
    }
  };
}

/**
 * Registrar hit de rate limit
 */
function recordRateLimitHit() {
  whmApiRateLimitHits.inc();
}

/**
 * Registrar retry de WHM API
 */
function recordWhmRetry(endpoint) {
  whmApiRetries.inc({ endpoint });
}

/**
 * Registrar duracao de requisicao WHM
 */
function recordWhmRequestDuration(endpoint, statusCode, durationSeconds) {
  whmApiRequestDuration.observe({ endpoint, status_code: statusCode }, durationSeconds);
}

/**
 * Registrar erro
 */
function recordError(type, code) {
  errorsTotal.inc({ type, code: String(code) });
}

/**
 * Obter metricas em formato Prometheus
 */
async function getMetrics() {
  return register.metrics();
}

/**
 * Obter content type das metricas
 */
function getMetricsContentType() {
  return register.contentType;
}

module.exports = {
  register,
  httpMetricsMiddleware,
  measureToolExecution,
  recordRateLimitHit,
  recordWhmRetry,
  recordWhmRequestDuration,
  recordError,
  getMetrics,
  getMetricsContentType,
  // Exportar metricas individuais para uso direto
  httpRequestDuration,
  httpRequestsTotal,
  toolExecutionDuration,
  toolExecutionsTotal,
  whmApiRateLimitHits,
  whmApiRequestDuration,
  dnsOperationDuration,
  dnsBackupsCreated,
  dnsRollbacks,
  sshOperationDuration,
  errorsTotal
};
