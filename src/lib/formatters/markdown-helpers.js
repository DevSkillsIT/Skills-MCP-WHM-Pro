/**
 * Markdown Helpers — Funcoes utilitarias para formatacao Markdown
 * SPEC-WHM-ENHANCE-001 / F01
 *
 * Reutiliza logica de dns-helpers/response-optimizer.js para DNS.
 * Pattern identico ao Hudu (src/formatters/markdown.ts) e Veeam (lib/formatters/markdown-helpers.js).
 */

/**
 * Escapa caracteres pipe que quebram tabelas Markdown.
 * @param {any} value - Valor a escapar
 * @returns {string} Valor seguro para tabela Markdown
 */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\|/g, '\\|');
}

/**
 * Trunca texto para tamanho maximo com sufixo "...".
 * Aplica esc() apos truncamento.
 * @param {string} text - Texto a truncar
 * @param {number} maxLen - Tamanho maximo (default: 300)
 * @returns {string} Texto truncado e escapado
 */
function truncate(text, maxLen = 300) {
  if (!text) return '';
  const str = String(text);
  if (str.length <= maxLen) return esc(str);
  return esc(str.slice(0, maxLen)) + '...';
}

/**
 * Formata info de paginacao para primeira linha de listas Markdown.
 * WHM API retorna tudo; paginacao e client-side via slice.
 * @param {number} count - Quantidade de items na pagina
 * @param {number} limit - Limite por pagina
 * @param {number} offset - Offset atual
 * @param {number} total - Total de items
 * @returns {string} Linha de paginacao formatada
 */
function pageInfo(count, limit, offset, total) {
  const parts = [`**${count} resultados**`];
  if (total && total > count) {
    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);
    parts.push(`Pagina ${page}/${totalPages} (total: ${total}, limit: ${limit})`);
  } else {
    parts.push('Mostrando todos');
  }
  return parts.join(' | ');
}

/**
 * Verifica se tamanho da resposta excede limite.
 * @param {string} text - Texto da resposta
 * @param {number} maxBytes - Limite em bytes (default: 400KB)
 * @returns {{ exceeded: boolean, size: number, message?: string }}
 */
function checkResponseSize(text, maxBytes = 400 * 1024) {
  const size = Buffer.byteLength(text, 'utf8');
  if (size > maxBytes) {
    return {
      exceeded: true,
      size,
      message: `Resposta excede ${Math.round(maxBytes / 1024)}KB (${Math.round(size / 1024)}KB). Use filtros mais restritivos ou reduza o limit.`
    };
  }
  return { exceeded: false, size };
}

/**
 * Mascarar senhas em dados de resposta.
 * @param {any} value - Valor potencialmente sensivel
 * @returns {string} Valor mascarado ou 'N/A'
 */
function maskPassword(value) {
  if (!value) return 'N/A';
  return '****';
}

/**
 * Aplica paginacao client-side a um array.
 * WHM API nao suporta paginacao nativa — todos os resultados vem de uma vez.
 * Esta funcao faz slice do array para o range solicitado.
 *
 * REQ-F03-007: Paginacao SEMPRE aplicada na camada de formatacao.
 * REQ-F03-008: Reutiliza logica de limitRecords() do response-optimizer.js para DNS.
 *
 * @param {Array} items - Array completo de resultados
 * @param {number} limit - Maximo de items por pagina (default: 25, max: 50)
 * @param {number} offset - Indice de inicio (default: 0)
 * @returns {{ items: Array, count: number, total: number, limit: number, offset: number }}
 */
function paginate(items, limit = 25, offset = 0) {
  if (!items || !Array.isArray(items)) {
    return { items: [], count: 0, total: 0, limit: 25, offset: 0 };
  }
  const safeLimit = Math.min(Math.max(1, limit || 25), 50);
  const safeOffset = Math.max(0, offset || 0);
  const total = items.length;
  const paged = items.slice(safeOffset, safeOffset + safeLimit);
  return { items: paged, count: paged.length, total, limit: safeLimit, offset: safeOffset };
}

/**
 * Formata mensagem amigavel para listas vazias.
 * @param {string} entity - Nome da entidade (ex: 'conta', 'dominio')
 * @returns {string} Mensagem amigavel
 */
function formatEmptyResult(entity) {
  return `Nenhum(a) ${entity} encontrado(a).`;
}

module.exports = { esc, truncate, pageInfo, checkResponseSize, maskPassword, paginate, formatEmptyResult };
