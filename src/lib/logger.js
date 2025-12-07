/**
 * Logger com sanitizacao de dados sensiveis (CC-05)
 * Implementa AC10: Seguranca das Credenciais
 */

const fs = require('fs');
const path = require('path');

// Padroes sensiveis para sanitizacao
const SENSITIVE_PATTERNS = [
  { pattern: /sk_whm_mcp_[a-z0-9_]+/gi, replacement: '[REDACTED:API_KEY]' },
  { pattern: /Bearer\s+[A-Za-z0-9+/=._-]+/gi, replacement: '[REDACTED:BEARER]' },
  { pattern: /whm\s+\w+:[A-Za-z0-9+/=._-]+/gi, replacement: '[REDACTED:WHM_AUTH]' },
  { pattern: /"password"\s*:\s*"[^"]*"/gi, replacement: '"password": "[REDACTED]"' },
  { pattern: /"api_token"\s*:\s*"[^"]*"/gi, replacement: '"api_token": "[REDACTED]"' },
  { pattern: /"api_key"\s*:\s*"[^"]*"/gi, replacement: '"api_key": "[REDACTED]"' },
  { pattern: /"apiToken"\s*:\s*"[^"]*"/gi, replacement: '"apiToken": "[REDACTED]"' },
  { pattern: /"x-api-key"\s*:\s*"[^"]*"/gi, replacement: '"x-api-key": "[REDACTED]"' },
  { pattern: /"Authorization"\s*:\s*"[^"]*"/gi, replacement: '"Authorization": "[REDACTED]"' },
  { pattern: /Authorization:\s*[^\s\n]+/gi, replacement: 'Authorization: [REDACTED]' }
];

// Headers que devem ser removidos dos logs
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie'
];

/**
 * Sanitiza dados para log, removendo informacoes sensiveis
 * @param {any} data - Dados a serem sanitizados
 * @returns {any} Dados sanitizados
 */
function sanitizeForLog(data) {
  if (data === null || data === undefined) {
    return data;
  }

  // Se for string, aplicar padroes de sanitizacao
  if (typeof data === 'string') {
    let sanitized = data;
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
  }

  // Se for array, sanitizar cada elemento
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForLog(item));
  }

  // Se for objeto, sanitizar recursivamente
  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Remover headers sensiveis
      if (SENSITIVE_HEADERS.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Campos conhecidos de credenciais
      if (['password', 'api_token', 'api_key', 'apiToken', 'token', 'secret'].includes(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Sanitizar valor recursivamente
      sanitized[key] = sanitizeForLog(value);
    }
    return sanitized;
  }

  return data;
}

/**
 * Sanitiza headers HTTP para log
 * @param {object} headers - Headers HTTP
 * @returns {object} Headers sanitizados
 */
function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return headers;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeForLog(value);
    }
  }
  return sanitized;
}

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // Diretorio de logs centralizado
    this.logsDir = process.env.LOG_DIR || '/opt/mcp-servers/_shared/logs';

    // Criar diretorio se nao existir
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (err) {
      // Fallback para diretorio local
      this.logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    }

    this.logFile = path.join(this.logsDir, 'mcp-whm-cpanel.log');
  }

  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  formatMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (meta) {
      const sanitizedMeta = sanitizeForLog(meta);
      formatted += ` ${JSON.stringify(sanitizedMeta)}`;
    }

    return formatted;
  }

  writeToFile(formattedMessage) {
    try {
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    } catch (error) {
      // Fallback silencioso
    }
  }

  log(level, message, meta = null) {
    if (!this.shouldLog(level)) return;

    // Sanitizar mensagem se for string
    const sanitizedMessage = sanitizeForLog(message);
    const formattedMessage = this.formatMessage(level, sanitizedMessage, meta);

    // Escrever em arquivo
    this.writeToFile(formattedMessage);

    // Saida no console (exceto em producao para info/debug)
    if (process.env.NODE_ENV !== 'production' || level === 'error' || level === 'warn') {
      switch (level) {
        case 'error':
          console.error(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'info':
          console.log(formattedMessage);
          break;
        case 'debug':
          if (process.env.NODE_ENV === 'development') {
            console.debug(formattedMessage);
          }
          break;
      }
    }
  }

  error(message, meta = null) {
    this.log('error', message, meta);
  }

  warn(message, meta = null) {
    this.log('warn', message, meta);
  }

  info(message, meta = null) {
    this.log('info', message, meta);
  }

  debug(message, meta = null) {
    this.log('debug', message, meta);
  }

  // Log de requisicao HTTP com sanitizacao
  logRequest(req) {
    const sanitizedReq = {
      method: req.method,
      path: req.path,
      headers: sanitizeHeaders(req.headers),
      body: req.body ? '[truncated]' : undefined
    };
    this.info('Incoming request', sanitizedReq);
  }

  // Log de resposta HTTP
  logResponse(req, res, duration) {
    this.info(`Response: ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  }
}

// Exportar instancia singleton e funcoes de sanitizacao
const logger = new Logger();

module.exports = logger;
module.exports.sanitizeForLog = sanitizeForLog;
module.exports.sanitizeHeaders = sanitizeHeaders;
