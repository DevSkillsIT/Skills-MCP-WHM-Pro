/**
 * Sistema de Cache DNS em Memória
 * TTL: 120 segundos (2 minutos) - OBRIGATÓRIO
 *
 * REQUISITOS:
 * - TTL fixo de 120 segundos
 * - Auto-cleanup de entradas expiradas
 * - Cache por chave (zone + tipo de operação)
 * - Invalidação manual quando necessário
 */

const logger = require('./logger');
const { VALIDATION_RULES } = require('./dns-constants/validation-rules');

/**
 * Classe de gerenciamento de cache DNS
 */
class DNSCache {
  constructor() {
    // Map para armazenar entradas do cache
    // Estrutura: { key: { value, expiresAt, createdAt } }
    this.cache = new Map();

    // Estatísticas
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
      cleanups: 0
    };

    // Iniciar cleanup automático a cada 60 segundos
    this.cleanupInterval = setInterval(
      () => this.autoCleanup(),
      VALIDATION_RULES.CACHE.CLEANUP_INTERVAL
    );

    logger.info('DNS Cache initialized', {
      ttl: VALIDATION_RULES.CACHE.TTL_SECONDS,
      maxEntries: VALIDATION_RULES.CACHE.MAX_ENTRIES,
      cleanupInterval: VALIDATION_RULES.CACHE.CLEANUP_INTERVAL
    });
  }

  /**
   * Gera chave de cache
   * @param {string} zone - Nome da zona
   * @param {string} operation - Tipo de operação (get_zone, list_zones, etc)
   * @param {object} filters - Filtros adicionais (opcional)
   * @returns {string} Chave do cache
   */
  generateKey(zone, operation, filters = null) {
    let key = `${operation}:${zone}`;

    if (filters) {
      const filterStr = JSON.stringify(filters);
      key += `:${filterStr}`;
    }

    // Limitar tamanho da chave
    if (key.length > VALIDATION_RULES.CACHE.KEY_MAX_LENGTH) {
      // Usar hash simples para chaves muito longas
      const hash = this.simpleHash(key);
      key = `${operation}:${zone}:${hash}`;
    }

    return key;
  }

  /**
   * Hash simples para chaves longas
   * @param {string} str - String a criar hash
   * @returns {string} Hash
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Obtém valor do cache
   * @param {string} key - Chave do cache
   * @returns {any|null} Valor em cache ou null se não encontrado/expirado
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      logger.debug('Cache miss', { key });
      return null;
    }

    // Verificar se expirou
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      logger.debug('Cache expired', { key, age: now - entry.createdAt });
      return null;
    }

    this.stats.hits++;
    logger.debug('Cache hit', { key, age: now - entry.createdAt });
    return entry.value;
  }

  /**
   * Armazena valor no cache
   * @param {string} key - Chave do cache
   * @param {any} value - Valor a armazenar
   * @param {number} ttl - TTL em segundos (default: 120s - OBRIGATÓRIO)
   * @returns {boolean} true se armazenado com sucesso
   */
  set(key, value, ttl = VALIDATION_RULES.CACHE.TTL_SECONDS) {
    // FORÇAR TTL de 120 segundos (conforme requisito)
    const fixedTTL = VALIDATION_RULES.CACHE.TTL_SECONDS;

    const now = Date.now();
    const expiresAt = now + (fixedTTL * 1000);

    // Verificar limite de entradas
    if (this.cache.size >= VALIDATION_RULES.CACHE.MAX_ENTRIES) {
      // Limpar entradas expiradas antes de rejeitar
      this.autoCleanup();

      // Se ainda estiver cheio, remover entrada mais antiga
      if (this.cache.size >= VALIDATION_RULES.CACHE.MAX_ENTRIES) {
        const oldestKey = this.findOldestEntry();
        if (oldestKey) {
          this.cache.delete(oldestKey);
          logger.debug('Removed oldest cache entry to make room', { key: oldestKey });
        }
      }
    }

    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: now
    });

    this.stats.sets++;
    logger.debug('Cache set', { key, ttl: fixedTTL, expiresAt: new Date(expiresAt).toISOString() });

    return true;
  }

  /**
   * Encontra entrada mais antiga do cache
   * @returns {string|null} Chave da entrada mais antiga
   */
  findOldestEntry() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Invalida entrada específica do cache
   * @param {string} key - Chave a invalidar
   * @returns {boolean} true se removido
   */
  invalidate(key) {
    const existed = this.cache.delete(key);

    if (existed) {
      this.stats.invalidations++;
      logger.debug('Cache invalidated', { key });
    }

    return existed;
  }

  /**
   * Invalida entradas que correspondem a um padrão
   * @param {string} pattern - Padrão a buscar (substring ou regex)
   * @returns {number} Número de entradas removidas
   */
  invalidatePattern(pattern) {
    let removed = 0;

    // Converter pattern em regex se não for
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.stats.invalidations += removed;
    logger.debug('Cache pattern invalidated', { pattern: pattern.toString(), removed });

    return removed;
  }

  /**
   * Limpa todo o cache
   * @returns {number} Número de entradas removidas
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();

    this.stats.invalidations += size;
    logger.info('Cache cleared', { removed: size });

    return size;
  }

  /**
   * Cleanup automático de entradas expiradas
   * @returns {number} Número de entradas removidas
   */
  autoCleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.stats.cleanups++;
      logger.debug('Cache auto-cleanup', { removed, remaining: this.cache.size });
    }

    return removed;
  }

  /**
   * Obtém estatísticas do cache
   * @returns {object} Estatísticas
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;

    return {
      size: this.cache.size,
      maxSize: VALIDATION_RULES.CACHE.MAX_ENTRIES,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      sets: this.stats.sets,
      invalidations: this.stats.invalidations,
      cleanups: this.stats.cleanups,
      ttl: VALIDATION_RULES.CACHE.TTL_SECONDS
    };
  }

  /**
   * Retorna tamanho atual do cache
   * @returns {number} Número de entradas
   */
  size() {
    return this.cache.size;
  }

  /**
   * Verifica se chave existe no cache (e não expirou)
   * @param {string} key - Chave a verificar
   * @returns {boolean} true se existe e não expirou
   */
  has(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Verificar expiração
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Destroi instância do cache (cleanup de recursos)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.clear();
    logger.info('DNS Cache destroyed');
  }
}

// Exportar instância singleton
const dnsCache = new DNSCache();

module.exports = dnsCache;
module.exports.DNSCache = DNSCache;
