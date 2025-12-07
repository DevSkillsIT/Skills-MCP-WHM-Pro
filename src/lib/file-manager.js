/**
 * File Manager
 * Implementa AC05, AC05b, AC05c, AC05d
 *
 * - file.list (AC05)
 * - file.read (AC05b)
 * - file.write (AC05c)
 * - file.delete (AC05d)
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { withTimeout, getTimeoutByType } = require('./timeout');

// Diretorio de backups de arquivos
const FILE_BACKUP_DIR = '/tmp/file-backups';

/**
 * Valida path para prevenir directory traversal
 *
 * Estratégia:
 * 1. Define diretório base permitido (/home/{cpanelUser})
 * 2. Resolve path absoluto do arquivo solicitado
 * 3. Verifica se path resolvido está DENTRO do base
 */
function validatePath(filePath, cpanelUser) {
  /**
   * Valida path prevenindo directory traversal.
   *
   * Estratégia:
   * 1. Define diretório base permitido (/home/{cpanelUser})
   * 2. Resolve path absoluto do arquivo solicitado
   * 3. Verifica se path resolvido está DENTRO do base
   */

  // 1. Diretório base do usuário cPanel
  const baseDir = path.resolve(`/home/${cpanelUser}`);

  // 2. Resolver path absoluto do arquivo
  const resolvedPath = path.resolve(baseDir, filePath);

  // 3. Verificar se está dentro do diretório permitido
  if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
    return {
      valid: false,
      error: 'Directory traversal not allowed',
      attempted: resolvedPath,
      allowed: baseDir
    };
  }

  // 4. Whitelist adicional de paths proibidos (defesa em profundidade)
  const forbiddenPaths = [
    '/etc/shadow',
    '/etc/passwd',
    '/root',
    '/.env',
    '/proc',
    '/sys'
  ];

  for (const forbidden of forbiddenPaths) {
    if (resolvedPath.startsWith(forbidden)) {
      return {
        valid: false,
        error: `Access to ${forbidden} is forbidden`
      };
    }
  }

  // 5. Validar nome do arquivo (sanitização)
  const fileName = path.basename(resolvedPath);
  // Permitir apenas caracteres alfanuméricos, ponto, traço, underscore
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return {
      valid: false,
      error: 'Invalid filename: only alphanumeric, dot, dash, underscore allowed'
    };
  }

  return { valid: true, path: resolvedPath };
}

class FileManager {
  constructor(config = {}) {
    this.host = config.host || process.env.WHM_HOST;
    this.port = config.port || process.env.WHM_PORT || '2087';
    this.username = config.username || process.env.WHM_USERNAME || 'root';
    this.apiToken = config.apiToken || process.env.WHM_API_TOKEN;

    this.baseURL = `https://${this.host}:${this.port}`;

    // Configurar HTTPS agent
    const httpsAgentOptions = {
      rejectUnauthorized: config.verifyTLS !== false
    };

    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `whm ${this.username}:${this.apiToken}`
      },
      httpsAgent: new https.Agent(httpsAgentOptions),
      timeout: getTimeoutByType('FILE')
    });

    this.ensureBackupDir();
  }

  /**
   * Garante que o diretorio de backups existe
   */
  ensureBackupDir() {
    try {
      if (!fs.existsSync(FILE_BACKUP_DIR)) {
        fs.mkdirSync(FILE_BACKUP_DIR, { recursive: true });
      }
    } catch (error) {
      logger.warn(`Could not create file backup directory: ${error.message}`);
    }
  }

  /**
   * Cria backup de arquivo antes de modificar
   */
  async createBackup(cpanelUser, filePath, content) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = path.basename(filePath);
      const backupPath = path.join(FILE_BACKUP_DIR, `${cpanelUser}-${fileName}.${timestamp}.bak`);

      fs.writeFileSync(backupPath, content);
      logger.info(`File backup created: ${backupPath}`);

      return backupPath;
    } catch (error) {
      logger.warn(`Failed to create file backup: ${error.message}`);
      return null;
    }
  }

  /**
   * Tool: file.list (AC05)
   * Lista arquivos de um diretorio
   */
  async listDirectory(cpanelUser, dirPath = null) {
    const targetPath = dirPath || `/home/${cpanelUser}`;

    // Validar path
    const validation = validatePath(targetPath, cpanelUser);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    try {
      const params = new URLSearchParams({
        'api.version': '1',
        'cpanel_jsonapi_user': cpanelUser,
        'cpanel_jsonapi_module': 'Fileman',
        'cpanel_jsonapi_func': 'listfiles',  // Função correta (sem underscore)
        'cpanel_jsonapi_apiversion': '2',
        'dir': validation.path
      });

      const response = await withTimeout(
        () => this.api.get(`/json-api/cpanel?${params}`),
        getTimeoutByType('FILE'),
        'file.list'
      );

      const files = (response.data?.cpanelresult?.data || []).map(file => ({
        name: file.file,
        type: file.type === 'dir' ? 'directory' : 'file',
        size: parseInt(file.size) || 0,
        modified: file.mtime || null,
        permissions: file.permissions || null,
        owner: file.owner || null
      }));

      return {
        success: true,
        data: {
          path: validation.path,
          files: files,
          total: files.length
        }
      };
    } catch (error) {
      logger.error(`Error listing directory ${targetPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tool: file.read (AC05b)
   * Le conteudo de arquivo
   */
  async readFile(cpanelUser, filePath) {
    // Validar path
    const validation = validatePath(filePath, cpanelUser);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    try {
      const params = new URLSearchParams({
        'api.version': '1',
        'cpanel_jsonapi_user': cpanelUser,
        'cpanel_jsonapi_module': 'Fileman',
        'cpanel_jsonapi_func': 'get_file_content',
        'cpanel_jsonapi_apiversion': '2',
        'file': validation.path
      });

      const response = await withTimeout(
        () => this.api.get(`/json-api/cpanel?${params}`),
        getTimeoutByType('FILE'),
        'file.read'
      );

      if (response.data?.cpanelresult?.data?.[0]) {
        const content = response.data.cpanelresult.data[0].content;
        const decoded = Buffer.from(content, 'base64').toString('utf8');

        return {
          success: true,
          data: {
            content: decoded,
            encoding: 'utf8',
            size: decoded.length,
            path: validation.path
          }
        };
      }

      throw new Error('Failed to read file');
    } catch (error) {
      logger.error(`Error reading file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tool: file.write (AC05c)
   * Escreve conteudo em arquivo
   */
  async writeFile(cpanelUser, filePath, content, options = {}) {
    // Validar path
    const validation = validatePath(filePath, cpanelUser);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 2. Verificar quota do usuário
    const quota = await this.getQuotaInfo(cpanelUser);
    const contentSize = Buffer.byteLength(content, options.encoding || 'utf8');

    if (quota.used + contentSize > quota.limit) {
      throw new Error(`Quota exceeded: ${quota.used + contentSize}/${quota.limit} bytes. Cannot write file.`);
    }

    // 3. Verificar permissões cPanel
    const hasPermission = await this.checkUserPermission(cpanelUser, validation.path, 'write');
    if (!hasPermission) {
      throw new Error(`User ${cpanelUser} does not have write permission for ${filePath}`);
    }

    const { encoding = 'utf8', createDirs = false } = options;
    let backupCreated = null;

    try {
      // Tentar ler arquivo existente para backup
      try {
        const existing = await this.readFile(cpanelUser, filePath);
        backupCreated = await this.createBackup(cpanelUser, filePath, existing.data.content);
      } catch (readError) {
        // Arquivo nao existe, sem backup necessario
      }

      // Criar diretorio se necessario
      if (createDirs) {
        const dir = path.dirname(validation.path);
        await this.createDirectory(cpanelUser, dir);
      }

      // Escrever arquivo
      const params = new URLSearchParams({
        'api.version': '1',
        'cpanel_jsonapi_user': cpanelUser,
        'cpanel_jsonapi_module': 'Fileman',
        'cpanel_jsonapi_func': 'save_file_content',
        'cpanel_jsonapi_apiversion': '2',
        'file': validation.path,
        'content': Buffer.from(content).toString('base64')
      });

      const response = await withTimeout(
        () => this.api.post(`/json-api/cpanel?api.version=1`, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }),
        getTimeoutByType('FILE'),
        'file.write'
      );

      const message = backupCreated ? 'File overwritten successfully' : 'File written successfully';

      return {
        success: true,
        data: {
          message: message,
          path: validation.path,
          bytes_written: content.length,
          backup_created: backupCreated
        }
      };
    } catch (error) {
      logger.error(`Error writing file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tool: file.delete (AC05d)
   * Deleta arquivo
   */
  async deleteFile(cpanelUser, filePath, options = {}) {
    // Validar path
    const validation = validatePath(filePath, cpanelUser);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const { force = false, backup = true } = options;

    try {
      // Verificar se arquivo existe e criar backup
      let fileInfo = null;
      if (backup) {
        try {
          const existing = await this.readFile(cpanelUser, filePath);
          fileInfo = {
            size: existing.data.size,
            path: validation.path
          };
          await this.createBackup(cpanelUser, filePath, existing.data.content);
        } catch (readError) {
          if (!force) {
            throw new Error('File Not Found');
          }
        }
      }

      // Deletar arquivo
      const params = new URLSearchParams({
        'api.version': '1',
        'cpanel_jsonapi_user': cpanelUser,
        'cpanel_jsonapi_module': 'Fileman',
        'cpanel_jsonapi_func': 'fileop',
        'cpanel_jsonapi_apiversion': '2',
        'op': 'unlink',
        'sourcefiles': validation.path
      });

      const response = await withTimeout(
        () => this.api.post(`/json-api/cpanel?api.version=1`, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }),
        getTimeoutByType('FILE'),
        'file.delete'
      );

      return {
        success: true,
        data: {
          message: 'File deleted successfully',
          path: validation.path,
          size: fileInfo?.size || 0,
          deleted_at: new Date().toISOString()
        }
      };
    } catch (error) {
      if (error.message === 'File Not Found') {
        const err = new Error('File Not Found');
        err.code = -32000;
        err.data = { path: validation.path };
        throw err;
      }
      logger.error(`Error deleting file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cria diretorio
   */
  async createDirectory(cpanelUser, dirPath, permissions = '0755') {
    const validation = validatePath(dirPath, cpanelUser);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    try {
      const params = new URLSearchParams({
        'api.version': '1',
        'cpanel_jsonapi_user': cpanelUser,
        'cpanel_jsonapi_module': 'Fileman',
        'cpanel_jsonapi_func': 'mkdir',
        'cpanel_jsonapi_apiversion': '2',
        'path': validation.path,
        'permissions': permissions
      });

      const response = await this.api.post(`/json-api/cpanel?api.version=1`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      return { success: true };
    } catch (error) {
      logger.error(`Error creating directory ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper: Obter informações de quota
   */
  async getQuotaInfo(cpanelUser) {
    try {
      const params = new URLSearchParams({
        'api.version': '1',
        'cpanel_jsonapi_user': cpanelUser,
        'cpanel_jsonapi_module': 'Quota',
        'cpanel_jsonapi_func': 'getquota',
        'cpanel_jsonapi_apiversion': '2'
      });

      const response = await this.api.get(`/json-api/cpanel?${params}`);
      const data = response.data?.cpanelresult?.data?.[0] || {};

      return {
        used: parseInt(data.diskused) * 1024 * 1024 || 0, // MB -> bytes
        limit: parseInt(data.diskquota) * 1024 * 1024 || 0,
        available: (parseInt(data.diskavailable) || 0) * 1024 * 1024
      };
    } catch (error) {
      logger.warn(`Failed to get quota info for ${cpanelUser}: ${error.message}`);
      // Retornar quota "ilimitada" em caso de erro
      return {
        used: 0,
        limit: Number.MAX_SAFE_INTEGER,
        available: Number.MAX_SAFE_INTEGER
      };
    }
  }

  /**
   * Helper: Verificar permissões do usuário
   */
  async checkUserPermission(cpanelUser, filePath, operation) {
    // Implementar verificação via cPanel API
    // Por ora, retornar true para paths dentro de /home/{user}
    const allowed = filePath.startsWith(`/home/${cpanelUser}`);

    if (!allowed) {
      logger.warn(`Permission denied: ${cpanelUser} tried to ${operation} ${filePath}`);
    }

    return allowed;
  }
}

module.exports = FileManager;
module.exports.validatePath = validatePath;
