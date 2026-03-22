/**
 * WHM Formatters — Formatadores Markdown por dominio WHM/cPanel
 * SPEC-WHM-ENHANCE-001 / F01, F04
 *
 * Cada funcao converte dados da WHM API em tabelas/detalhes Markdown.
 * Pattern identico ao Hudu (src/formatters/markdown.ts) e Veeam (lib/formatters/veeam-formatters.js).
 *
 * REQ-F04-001: Remove campos desnecessarios para o LLM.
 * REQ-F04-002: Mascara senhas com '****'.
 * REQ-F04-003: Retorna apenas campos relevantes por dominio.
 */

const { esc, truncate, pageInfo, maskPassword } = require('./markdown-helpers');

// ============================================
// ACCOUNTS
// ============================================

function formatAccountsList(data) {
  const { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhuma conta encontrada.';
  const header = pageInfo(count, limit, offset, total);
  const rows = items.map(a =>
    `| ${esc(a.user)} | ${esc(a.domain)} | ${esc(a.email)} | ${esc(a.plan || a.package)} | ${esc(a.diskused || 'N/A')} | ${a.suspended ? 'Suspensa' : 'Ativa'} |`
  ).join('\n');
  return `${header}\n\n| Username | Dominio | Email | Plano | Disco | Status |\n|---|---|---|---|---|---|\n${rows}`;
}

function formatAccountDetail(account) {
  if (!account) return 'Conta nao encontrada.';
  const a = account;
  return `# Conta: ${esc(a.user || a.domain)}\n\n` +
    `| Campo | Valor |\n|---|---|\n` +
    `| Username | ${esc(a.user)} |\n` +
    `| Dominio | ${esc(a.domain)} |\n` +
    `| Email | ${truncate(a.email || a.contactemail, 100)} |\n` +
    `| Plano | ${esc(a.plan || a.package)} |\n` +
    `| Disco Usado | ${esc(a.diskused || 'N/A')} |\n` +
    `| Disco Limite | ${esc(a.disklimit || 'unlimited')} |\n` +
    `| Bandwidth | ${esc(a.bwlimit || 'unlimited')} |\n` +
    `| IP | ${esc(a.ip)} |\n` +
    `| Senha | ${a.password ? maskPassword(a.password) : 'N/A'} |\n` +
    `| Status | ${a.suspended ? 'Suspensa' : 'Ativa'} |` +
    (a.suspendreason ? `\n| Motivo Suspensao | ${truncate(a.suspendreason, 200)} |` : '') +
    (a.startdate ? `\n| Criada em | ${esc(a.startdate)} |` : '');
}

function formatAccountDomains(data) {
  if (!data) return 'Nenhum dominio encontrado para esta conta.';
  const domains = Array.isArray(data) ? data : (data?.domains || data?.data || []);
  if (!domains.length) return 'Nenhum dominio encontrado para esta conta.';
  const rows = domains.map(d => {
    const name = typeof d === 'string' ? d : (d.domain || d.name);
    const type = typeof d === 'string' ? 'main' : (d.type || 'domain');
    return `| ${esc(name)} | ${esc(type)} |`;
  }).join('\n');
  return `**${domains.length} dominios**\n\n| Dominio | Tipo |\n|---|---|\n${rows}`;
}

// ============================================
// SERVER
// ============================================

function formatServerStatus(data) {
  if (!data) return 'Status do servidor nao disponivel.';
  const d = data?.data || data;
  return `# Status do Servidor WHM\n\n` +
    `| Campo | Valor |\n|---|---|\n` +
    `| Versao | ${esc(d.version || d.cpanelVersion || 'N/A')} |\n` +
    `| Hostname | ${esc(d.hostname || 'N/A')} |\n` +
    `| Load 1m | ${esc(d.loadavg?.[0] || d.load1 || d.one || 'N/A')} |\n` +
    `| Load 5m | ${esc(d.loadavg?.[1] || d.load5 || d.five || 'N/A')} |\n` +
    `| Load 15m | ${esc(d.loadavg?.[2] || d.load15 || d.fifteen || 'N/A')} |\n` +
    `| Uptime | ${esc(d.uptime || 'N/A')} |`;
}

function formatServicesStatus(data) {
  if (!data) return 'Status dos servicos nao disponivel.';
  const services = Array.isArray(data) ? data : (data?.data || data?.service || []);
  if (Array.isArray(services) && services.length > 0) {
    const rows = services.map(s =>
      `| ${esc(s.name || s.service)} | ${s.running || s.enabled ? 'Ativo' : 'Parado'} | ${s.monitored ? 'Sim' : 'Nao'} |`
    ).join('\n');
    return `**${services.length} servicos**\n\n| Servico | Status | Monitorado |\n|---|---|---|\n${rows}`;
  }
  // Se retornar como objeto chave-valor
  if (typeof data === 'object') {
    const entries = Object.entries(data?.data || data).filter(([k]) => !k.startsWith('_'));
    const rows = entries.map(([name, info]) => {
      const status = typeof info === 'object' ? (info.running ? 'Ativo' : 'Parado') : String(info);
      return `| ${esc(name)} | ${esc(status)} |`;
    }).join('\n');
    return `**${entries.length} servicos**\n\n| Servico | Status |\n|---|---|\n${rows}`;
  }
  return 'Status dos servicos nao disponivel.';
}

// ============================================
// DOMAINS
// ============================================

function formatDomainsList(data) {
  const { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhum dominio encontrado.';
  const header = pageInfo(count, limit, offset, total);
  const rows = items.map(d =>
    `| ${esc(d.domain)} | ${esc(d.user || d.owner)} | ${esc(d.documentroot || d.docroot || 'N/A')} | ${esc(d.type || 'main')} |`
  ).join('\n');
  return `${header}\n\n| Dominio | Proprietario | Document Root | Tipo |\n|---|---|---|---|\n${rows}`;
}

function formatDomainDetail(data) {
  if (!data) return 'Dominio nao encontrado.';
  const d = data?.data || data;
  if (typeof d === 'string') return d;
  return `# Dominio: ${esc(d.domain || d.name || 'N/A')}\n\n` +
    `| Campo | Valor |\n|---|---|\n` +
    `| Dominio | ${esc(d.domain || d.name)} |\n` +
    `| Proprietario | ${esc(d.user || d.owner)} |\n` +
    `| Tipo | ${esc(d.type)} |\n` +
    `| IP | ${esc(d.ip)} |\n` +
    `| Document Root | ${truncate(d.documentroot || d.docroot, 200)} |\n` +
    `| PHP Version | ${esc(d.php_version || d.phpversion || 'N/A')} |\n` +
    `| Status | ${esc(d.status || 'Ativo')} |`;
}

// ============================================
// DNS
// ============================================

function formatDnsZonesList(data) {
  const { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhuma zona DNS encontrada.';
  const header = pageInfo(count, limit, offset, total);
  const rows = items.map(z =>
    `| ${esc(z.domain || z.zone)} | ${esc(z.type || 'forward')} |`
  ).join('\n');
  return `${header}\n\n| Zona | Tipo |\n|---|---|\n${rows}`;
}

function formatDnsRecordsList(data) {
  const { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhum registro DNS encontrado.';
  const header = pageInfo(count, limit, offset, total);
  const rows = items.map(r =>
    `| ${esc(r.name)} | ${esc(r.type)} | ${truncate(r.record || r.address || r.data || r.content || r.cname || r.exchange || r.txtdata || '', 100)} | ${esc(r.ttl || 'default')} | ${esc(r.Line || r.line || '')} |`
  ).join('\n');
  return `${header}\n\n| Nome | Tipo | Valor | TTL | Linha |\n|---|---|---|---|---|\n${rows}`;
}

function formatDnsRecordDetail(record) {
  if (!record) return 'Registro DNS nao encontrado.';
  const r = record?.data || record;
  return `# Registro DNS\n\n` +
    `| Campo | Valor |\n|---|---|\n` +
    `| Nome | ${esc(r.name)} |\n` +
    `| Tipo | ${esc(r.type)} |\n` +
    `| Valor | ${esc(r.record || r.address || r.data || r.content || r.cname || r.exchange || r.txtdata)} |\n` +
    `| TTL | ${esc(r.ttl)} |\n` +
    `| Linha | ${esc(r.Line || r.line || 'N/A')} |`;
}

function formatMxRecordsList(records) {
  if (!records || !records.length) return 'Nenhum registro MX encontrado.';
  const rows = records.map(r =>
    `| ${esc(r.domain)} | ${esc(r.exchange)} | ${esc(r.preference || r.priority)} |`
  ).join('\n');
  return `**${records.length} registros MX**\n\n| Dominio | Exchange | Prioridade |\n|---|---|---|\n${rows}`;
}

// ============================================
// DNSSEC
// ============================================

function formatDnssecInfo(data) {
  if (!data) return 'Informacoes DNSSEC nao disponiveis.';
  const d = data?.data || data;
  if (Array.isArray(d)) {
    if (d.length === 0) return 'Nenhum DS Record encontrado.';
    const rows = d.map(r =>
      `| ${esc(r.domain)} | ${esc(r.keyTag || r.key_tag)} | ${esc(r.algorithm)} | ${truncate(r.digest || r.dsRecord, 60)} |`
    ).join('\n');
    return `**${d.length} DS Records**\n\n| Dominio | Key Tag | Algoritmo | Digest |\n|---|---|---|---|\n${rows}`;
  }
  return `# DNSSEC\n\n| Campo | Valor |\n|---|---|\n` +
    `| Status | ${esc(d.status || (d.enabled ? 'Ativo' : 'Inativo'))} |\n` +
    `| Dominio | ${esc(d.domain)} |` +
    (d.operation_id ? `\n| Operation ID | ${esc(d.operation_id)} |` : '');
}

// ============================================
// SYSTEM (SSH)
// ============================================

function formatSystemLoad(data) {
  if (!data) return 'Metricas de carga nao disponiveis.';
  const d = data?.data || data;
  return `# Carga do Sistema\n\n` +
    `| Metrica | Valor |\n|---|---|\n` +
    `| Load 1m | ${esc(d.load1 || d.loadavg?.[0] || d.one || 'N/A')} |\n` +
    `| Load 5m | ${esc(d.load5 || d.loadavg?.[1] || d.five || 'N/A')} |\n` +
    `| Load 15m | ${esc(d.load15 || d.loadavg?.[2] || d.fifteen || 'N/A')} |\n` +
    `| CPU Cores | ${esc(d.cpuCount || d.cpu_count || 'N/A')} |\n` +
    `| Memoria Total | ${esc(d.memTotal || d.total_memory || 'N/A')} |\n` +
    `| Memoria Livre | ${esc(d.memFree || d.free_memory || 'N/A')} |\n` +
    `| Disco | ${esc(d.diskUsage || d.disk_usage || 'N/A')} |`;
}

function formatLogLines(data) {
  if (!data) return 'Nenhuma linha de log encontrada.';
  const d = data?.data || data;
  const raw = typeof d === 'string' ? d.split('\n').filter(l => l.trim()) : (Array.isArray(d) ? d : [d]);
  if (!raw.length) return 'Nenhuma linha de log encontrada.';
  const lines = raw.slice(0, 100);
  const rows = lines.map((line, i) =>
    `| ${i + 1} | ${truncate(typeof line === 'string' ? line : (line.message || JSON.stringify(line)), 200)} |`
  ).join('\n');
  return `**${lines.length} linhas de log**${raw.length > 100 ? ` (truncado de ${raw.length})` : ''}\n\n| # | Conteudo |\n|---|---|\n${rows}`;
}

// ============================================
// FILES
// ============================================

function formatFilesList(data) {
  const { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhum arquivo encontrado.';
  const header = pageInfo(count, limit, offset, total);
  const rows = items.map(f =>
    `| ${esc(f.file || f.name || f.filename)} | ${esc(f.type || (f.isDir || f.is_dir ? 'dir' : 'file'))} | ${esc(f.size || f.humansize || 'N/A')} | ${esc(f.mtime || f.modified || 'N/A')} |`
  ).join('\n');
  return `${header}\n\n| Arquivo | Tipo | Tamanho | Modificado |\n|---|---|---|---|\n${rows}`;
}

function formatFileContent(data) {
  if (!data) return 'Arquivo vazio ou nao encontrado.';
  const d = data?.data || data;
  const content = typeof d === 'string' ? d : (d.content || d.data || '');
  const path = d.path || d.file || 'arquivo';
  const maxLen = 5000;
  return `# Conteudo: ${esc(path)}\n\n\`\`\`\n${content.slice(0, maxLen)}\n\`\`\`` +
    (content.length > maxLen ? `\n\n*Conteudo truncado (>${maxLen} caracteres). Arquivo completo tem ${content.length} caracteres.*` : '');
}

// ============================================
// OPERATION RESULTS (generico)
// ============================================

function formatOperationResult(data, action) {
  if (!data) return `Operacao "${action || 'executada'}" realizada com sucesso.`;
  if (typeof data === 'string') return data;
  const d = data?.data || data;
  if (typeof d === 'string') return d;
  if (d.message) return d.message;
  if (d.result) return typeof d.result === 'string' ? d.result : `Operacao "${action || 'executada'}" realizada com sucesso.`;
  return `Operacao "${action || 'executada'}" realizada com sucesso.`;
}

module.exports = {
  formatAccountsList, formatAccountDetail, formatAccountDomains,
  formatServerStatus, formatServicesStatus,
  formatDomainsList, formatDomainDetail,
  formatDnsZonesList, formatDnsRecordsList, formatDnsRecordDetail, formatMxRecordsList,
  formatDnssecInfo,
  formatSystemLoad, formatLogLines,
  formatFilesList, formatFileContent,
  formatOperationResult,
};
