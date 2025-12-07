/**
 * SSH Manager Seguro (CC-02)
 * Implementa AC04: Gerenciamento SSH Seguro
 *
 * IMPORTANTE: ssh.execute foi REMOVIDO para prevenir RCE
 * Somente operacoes pre-aprovadas sao permitidas
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { withTimeout, getTimeoutByType } = require('./timeout');
const { sshOperationDuration } = require('./metrics');

// Allowlist base de servicos que podem ser reiniciados (CC-02)
const DEFAULT_ALLOWED_SERVICES = [
  'httpd',
  'apache',
  'apache2',
  'nginx',
  'litespeed',
  'php-fpm',
  'php-fpm72',
  'php-fpm73',
  'php-fpm74',
  'php-fpm80',
  'mysql',
  'mariadb',
  'postgresql',
  'named',
  'bind',
  'nsd',
  'unbound',
  'dnsadmin',
  'cpaneld',
  'cpsrvd',
  'cpdavd',
  'cphulkd',
  'queueprocd',
  'tailwatchd',
  'chkservd',
  'exim',
  'exim-26',
  'exim-altport',
  'postfix',
  'dovecot',
  'imap',
  'pop',
  'spamd',
  'mailman',
  'pure-ftpd',
  'proftpd',
  'ftpd',
  'clamd',
  'clamavd',
  'amavisd',
  'sshd',
  'ipaliases',
  'rsyslogd',
  'tomcat',
  'memcached',
  'redis'
];

// Permite extender/override via env MCP_ALLOWED_SERVICES (lista separada por virgula)
const envServices = process.env.MCP_ALLOWED_SERVICES
  ? process.env.MCP_ALLOWED_SERVICES.split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  : [];

const ALLOWED_SERVICES = Array.from(new Set([...DEFAULT_ALLOWED_SERVICES, ...envServices]));

// Whitelist de arquivos de log que podem ser lidos (CC-02)
const ALLOWED_LOG_FILES = [
  '/var/log/httpd/error_log',
  '/var/log/httpd/access_log',
  '/var/log/apache2/error.log',
  '/var/log/apache2/access.log',
  '/var/log/mysql/error.log',
  '/var/log/mysql/mysqld.log',
  '/var/log/maillog',
  '/var/log/messages',
  '/var/log/secure',
  '/var/log/exim_mainlog',
  '/var/log/exim_rejectlog',
  '/var/log/exim_paniclog',
  '/usr/local/cpanel/logs/error_log',
  '/usr/local/cpanel/logs/access_log'
];

// Padroes wildcard para logs
const ALLOWED_LOG_PATTERNS = [
  /^\/var\/log\/httpd\/.+$/,
  /^\/var\/log\/apache2\/.+$/,
  /^\/var\/log\/mysql\/.+$/,
  /^\/usr\/local\/cpanel\/logs\/.+$/,
  /^\/var\/log\/exim.+$/
];

/**
 * Verifica se servico esta na allowlist
 */
function isServiceAllowed(service) {
  return ALLOWED_SERVICES.includes((service || '').toLowerCase());
}

/**
 * Verifica se arquivo de log esta na whitelist
 */
function isLogFileAllowed(logFile) {
  // Verificar lista exata
  if (ALLOWED_LOG_FILES.includes(logFile)) {
    return true;
  }

  // Verificar padroes wildcard
  for (const pattern of ALLOWED_LOG_PATTERNS) {
    if (pattern.test(logFile)) {
      return true;
    }
  }

  return false;
}

/**
 * Erro para operacao SSH nao autorizada
 */
class SSHSecurityError extends Error {
  constructor(message, code = -32000, data = {}) {
    super(message);
    this.name = 'SSHSecurityError';
    this.code = code;
    this.data = data;
  }

  toJsonRpcError() {
    return {
      code: this.code,
      message: this.message,
      data: this.data
    };
  }
}

class SSHManager {
  constructor(config = {}) {
    this.host = config.host || process.env.SSH_HOST || process.env.WHM_HOST;
    this.port = config.port || process.env.SSH_PORT || 22;
    this.username = config.username || process.env.SSH_USERNAME || 'root';
    this.keyPath = config.keyPath || process.env.SSH_KEY_PATH;
    this.password = config.password || process.env.SSH_PASSWORD;

    this.sshClient = null;
    this.connected = false;
  }

  /**
   * Conecta ao servidor via SSH
   */
  async connect() {
    return new Promise((resolve, reject) => {
      if (this.sshClient && this.connected) {
        resolve(this.sshClient);
        return;
      }

      this.sshClient = new Client();

      const connectionConfig = {
        host: this.host,
        port: this.port,
        username: this.username,
        readyTimeout: 30000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519']
        }
      };

      // Autenticacao por chave ou senha
      if (this.keyPath && fs.existsSync(this.keyPath)) {
        connectionConfig.privateKey = fs.readFileSync(this.keyPath, 'utf8');
      } else if (this.password) {
        connectionConfig.password = this.password;
      } else {
        reject(new Error('SSH authentication required: provide SSH_KEY_PATH or SSH_PASSWORD'));
        return;
      }

      this.sshClient.on('ready', () => {
        this.connected = true;
        logger.info('SSH connection established');
        resolve(this.sshClient);
      });

      this.sshClient.on('error', (err) => {
        this.connected = false;
        logger.error(`SSH connection error: ${err.message}`);
        reject(err);
      });

      this.sshClient.on('end', () => {
        this.connected = false;
        logger.info('SSH connection ended');
      });

      this.sshClient.connect(connectionConfig);
    });
  }

  /**
   * Executa comando SSH interno (NAO EXPOSTO)
   * Usado apenas por metodos seguros internos
   */
  async _executeCommand(command) {
    const client = await this.connect();

    return withTimeout(
      () => new Promise((resolve, reject) => {
        client.exec(command, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }

          let output = '';
          let errorOutput = '';

          stream.on('close', (code, signal) => {
            resolve({ output, error: errorOutput, code });
          });

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
        });
      }),
      getTimeoutByType('SSH'),
      'ssh_command'
    );
  }

  /**
   * Desconecta SSH
   */
  disconnect() {
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
      this.connected = false;
      logger.info('SSH connection closed');
    }
  }

  // ============================================
  // TOOLS SEGURAS (CC-02)
  // ============================================

  /**
   * Tool: system.restart_service
   * Reinicia servico do sistema (apenas da allowlist)
   */
  async restartService(service) {
    const startTime = process.hrtime();

    // Validar servico contra allowlist
    if (!isServiceAllowed(service)) {
      throw new SSHSecurityError(
        'Invalid service name',
        -32602,
        {
          service: service,
          allowed_services: ALLOWED_SERVICES
        }
      );
    }

    logger.info(`Restarting service: ${service}`);

    try {
      const result = await this._executeCommand(`systemctl restart ${service}`);

      // Verificar status apos restart
      const statusResult = await this._executeCommand(`systemctl is-active ${service}`);
      const isActive = statusResult.output.trim() === 'active';

      const [seconds, nanoseconds] = process.hrtime(startTime);
      sshOperationDuration.observe(
        { operation: 'restart_service', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          service: service,
          status: isActive ? 'restarted' : 'restart_pending',
          message: isActive ? 'Service restarted successfully' : 'Restart command sent',
          output: result.output || null
        }
      };
    } catch (error) {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      sshOperationDuration.observe(
        { operation: 'restart_service', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }

  /**
   * Tool: system.get_load
   * Obtem carga do servidor (somente leitura)
   */
  async getSystemLoad() {
    const startTime = process.hrtime();

    try {
      // Coletar informacoes do sistema
      const [loadResult, uptimeResult, memResult, diskResult] = await Promise.all([
        this._executeCommand('cat /proc/loadavg'),
        this._executeCommand('uptime -p'),
        this._executeCommand("free -m | grep '^Mem:'"),
        this._executeCommand("df -h / | tail -1")
      ]);

      // Parsear load average
      const loadParts = loadResult.output.trim().split(/\s+/);
      const loadavg = [
        parseFloat(loadParts[0]) || 0,
        parseFloat(loadParts[1]) || 0,
        parseFloat(loadParts[2]) || 0
      ];

      // Parsear memoria
      const memParts = memResult.output.trim().split(/\s+/);
      const memory = {
        total: parseInt(memParts[1]) || 0,
        used: parseInt(memParts[2]) || 0,
        free: parseInt(memParts[3]) || 0,
        unit: 'MB'
      };

      // Parsear disco
      const diskParts = diskResult.output.trim().split(/\s+/);
      const disk = {
        total: diskParts[1] || 'Unknown',
        used: diskParts[2] || 'Unknown',
        available: diskParts[3] || 'Unknown',
        usage: diskParts[4] || 'Unknown'
      };

      const [seconds, nanoseconds] = process.hrtime(startTime);
      sshOperationDuration.observe(
        { operation: 'get_load', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          loadavg: loadavg,
          uptime: uptimeResult.output.trim(),
          memory: memory,
          disk: disk,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      sshOperationDuration.observe(
        { operation: 'get_load', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }

  /**
   * Tool: log.read_last_lines
   * Le ultimas linhas de arquivo de log (apenas da whitelist)
   */
  async readLogLines(logFile, lines = 50) {
    const startTime = process.hrtime();

    // Validar arquivo contra whitelist
    if (!isLogFileAllowed(logFile)) {
      throw new SSHSecurityError(
        'Unauthorized log file access',
        -32000,
        {
          requested_file: logFile,
          allowed_files: ALLOWED_LOG_FILES.slice(0, 5).concat(['...and more'])
        }
      );
    }

    // Limitar numero de linhas
    const maxLines = 1000;
    const requestedLines = Math.min(Math.max(1, lines), maxLines);

    logger.info(`Reading last ${requestedLines} lines from ${logFile}`);

    try {
      const result = await this._executeCommand(`tail -n ${requestedLines} "${logFile}" 2>/dev/null || echo "[File not found or empty]"`);

      const logLines = result.output.trim().split('\n').filter(line => line.length > 0);

      const [seconds, nanoseconds] = process.hrtime(startTime);
      sshOperationDuration.observe(
        { operation: 'read_log', status: 'success' },
        seconds + nanoseconds / 1e9
      );

      return {
        success: true,
        data: {
          logfile: logFile,
          lines: logLines,
          count: logLines.length,
          requested: requestedLines
        }
      };
    } catch (error) {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      sshOperationDuration.observe(
        { operation: 'read_log', status: 'error' },
        seconds + nanoseconds / 1e9
      );
      throw error;
    }
  }
}

module.exports = SSHManager;
module.exports.ALLOWED_SERVICES = ALLOWED_SERVICES;
module.exports.ALLOWED_LOG_FILES = ALLOWED_LOG_FILES;
module.exports.isServiceAllowed = isServiceAllowed;
module.exports.isLogFileAllowed = isLogFileAllowed;
module.exports.SSHSecurityError = SSHSecurityError;
