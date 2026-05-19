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
  const header = pageInfo(count, limit, offset, total, { clamped: data.clamped, requestedLimit: data.requestedLimit });
  // Sort by username for deterministic output across calls
  const sorted = [...items].sort((a, b) =>
    String(a.user || '').localeCompare(String(b.user || ''))
  );
  const formatDisk = (a) => {
    const used = a.diskused;
    const limit = a.disklimit;
    if (!used && !limit) return 'N/A';
    const u = used ? formatWhmDisk(used) : '?';
    const l = (limit && limit !== 'unlimited') ? formatWhmDisk(limit) : (limit === 'unlimited' ? 'ilimitado' : '?');
    return `${u} / ${l}`;
  };
  const rows = sorted.map(a =>
    `| ${esc(a.user)} | ${esc(a.domain)} | ${esc(a.email)} | ${esc(a.plan || a.package)} | ${esc(formatDisk(a))} | ${a.suspended ? 'Suspensa' : 'Ativa'} |`
  ).join('\n');
  return `${header}\n\n| Username | Dominio | Email | Plano | Disco Usado/Limite | Status |\n|---|---|---|---|---|---|\n${rows}`;
}

function formatWhmDisk(value) {
  if (value == null || value === '' || value === 'unlimited') return value === 'unlimited' ? 'ilimitado' : 'N/A';
  const s = String(value);
  // WHM formats: "45217M", "150000M", "10G", or raw bytes
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([KMGTP]?)B?$/i);
  if (m) {
    const num = parseFloat(m[1]);
    const unit = (m[2] || '').toUpperCase();
    if (!unit) return humanizeBytes(num); // raw bytes
    // Convert WHM unit to bytes then humanize
    const mults = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };
    return humanizeBytes(num * (mults[unit] || 1));
  }
  return s;
}

function formatAccountDetail(account) {
  if (!account) return 'Conta nao encontrada.';
  const a = account?.data || account;
  const created = formatStartDate(a.startdate || a.created);
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
    (a.password ? `| Senha | ${maskPassword(a.password)} |\n` : '') +
    `| Status | ${a.suspended ? 'Suspensa' : 'Ativa'} |` +
    (a.suspendreason && a.suspendreason !== 'not suspended' ? `\n| Motivo Suspensao | ${truncate(a.suspendreason, 200)} |` : '') +
    (created ? `\n| Criada em | ${esc(created)} |` : '');
}

function formatStartDate(value) {
  if (!value && value !== 0) return null;
  // Case A: numeric epoch
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const ts = Number(value);
    if (ts > 0) {
      const ms = ts < 1e12 ? ts * 1000 : ts;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
  }
  // Case B: WHM legacy format "YY Mon DD HH:MM" (e.g., "17 Aug 30 16:52")
  const s = String(value).trim();
  const m = s.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const yy = Number(m[1]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    const mon = m[2];
    const day = m[3].padStart(2, '0');
    const hh = m[4].padStart(2, '0');
    const mm = m[5];
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                     Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const mo = months[mon];
    if (mo) return `${year}-${mo}-${day} ${hh}:${mm}:00`;
  }
  return s;
}

function formatAccountDomains(data) {
  if (!data) return 'Nenhum dominio encontrado para esta conta.';
  const payload = data?.data || data;
  const rawList = Array.isArray(payload) ? payload : (payload?.domains || payload?.data || []);
  if (!rawList.length) return 'Nenhum dominio encontrado para esta conta.';

  const mainDomain = payload?.main_domain || payload?.maindomain;
  const subSet = new Set([].concat(payload?.sub_domains || payload?.subdomains || []));
  const parkedSet = new Set([].concat(payload?.parked_domains || []));
  const addonSet = new Set(Object.keys(payload?.addon_domains || {}));

  const classify = (name) => {
    if (!name) return 'unknown';
    if (mainDomain && name === mainDomain) return 'main';
    if (addonSet.has(name)) return 'addon';
    if (parkedSet.has(name)) return 'parked';
    if (subSet.has(name)) return 'subdomain';
    return 'subdomain';
  };

  const rows = rawList.map(d => {
    const name = typeof d === 'string' ? d : (d.domain || d.name);
    const type = (typeof d === 'object' && d.type) ? d.type : classify(name);
    return `| ${esc(name)} | ${esc(type)} |`;
  }).join('\n');
  return `**${rawList.length} dominios**\n\n| Dominio | Tipo |\n|---|---|\n${rows}`;
}

// ============================================
// SERVER
// ============================================

function formatServerStatus(data) {
  if (!data) return 'Status do servidor nao disponivel.';
  const d = data?.data || data;
  const uptime = d.uptime || d.uptime_pretty || d.uptimePretty;
  return `# Status do Servidor WHM\n\n` +
    `| Campo | Valor |\n|---|---|\n` +
    `| Versao | ${esc(d.version || d.cpanelVersion || 'N/A')} |\n` +
    `| Hostname | ${esc(d.hostname || 'N/A')} |\n` +
    `| Load 1m | ${esc(d.loadavg?.[0] || d.load1 || d.one || 'N/A')} |\n` +
    `| Load 5m | ${esc(d.loadavg?.[1] || d.load5 || d.five || 'N/A')} |\n` +
    `| Load 15m | ${esc(d.loadavg?.[2] || d.load15 || d.fifteen || 'N/A')} |\n` +
    `| Uptime | ${esc(uptime || 'N/A')} |`;
}

function formatServerConfig(data) {
  if (!data) return 'Configuracao do servidor nao disponivel.';
  const d = data?.data || data;
  return `# Configuracao do Servidor WHM\n\n` +
    `| Campo | Valor |\n|---|---|\n` +
    `| Versao | ${esc(d.version || d.cpanelVersion || 'N/A')} |\n` +
    `| Hostname | ${esc(d.hostname || 'N/A')} |\n` +
    `| IP Principal | ${esc(d.mainip || d.main_ip || d.ip || 'N/A')} |` +
    (d.shared_ip ? `\n| IP Compartilhado | ${esc(d.shared_ip)} |` : '') +
    (d.os_release || d.os ? `\n| Sistema Operacional | ${esc(d.os_release || d.os)} |` : '') +
    (d.license ? `\n| Licenca | ${esc(d.license)} |` : '');
}

function formatServicesStatus(data) {
  if (!data) return 'Status dos servicos nao disponivel.';
  // Handle both direct array and wrapped { services: [...] } or { service: [...] }
  const services = Array.isArray(data) ? data : (data?.services || data?.service || data?.data || []);
  if (Array.isArray(services) && services.length > 0) {
    const rows = services.map(s => {
      const name = s.name || s.service || 'unknown';
      const isRunning = s.running === 1 || s.running === true || s.enabled === 1 || s.enabled === true;
      const monitored = s.monitored === 1 || s.monitored === true;
      return `| ${esc(name)} | ${isRunning ? 'Ativo' : 'Parado'} | ${monitored ? 'Sim' : 'Nao'} |`;
    }).join('\n');
    return `**${services.length} servicos**\n\n| Servico | Status | Monitorado |\n|---|---|---|\n${rows}`;
  }
  // Handle error or empty state
  if (data?.error) {
    return `Status dos servicos: ${esc(data.error)}`;
  }
  // Se retornar como objeto chave-valor
  if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data).filter(([k]) => !['timestamp', 'error', 'services', 'service', 'data', '_'].some(x => k.startsWith(x)));
    if (entries.length > 0) {
      const rows = entries.map(([name, info]) => {
        const status = typeof info === 'object' ? (info.running ? 'Ativo' : 'Parado') : String(info);
        return `| ${esc(name)} | ${esc(status)} |`;
      }).join('\n');
      return `**${entries.length} servicos**\n\n| Servico | Status |\n|---|---|\n${rows}`;
    }
  }
  return 'Status dos servicos nao disponivel.';
}

// ============================================
// DOMAINS
// ============================================

function formatDomainsList(data) {
  const { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhum dominio encontrado.';
  const header = pageInfo(count, limit, offset, total, { clamped: data.clamped, requestedLimit: data.requestedLimit });
  const sorted = [...items].sort((a, b) =>
    String(a.domain || '').localeCompare(String(b.domain || ''))
  );
  const rows = sorted.map(d =>
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
  const header = pageInfo(count, limit, offset, total, { clamped: data.clamped, requestedLimit: data.requestedLimit });
  const rows = items.map(z =>
    `| ${esc(z.domain || z.zone)} | ${esc(z.type || 'forward')} |`
  ).join('\n');
  return `${header}\n\n| Zona | Tipo |\n|---|---|\n${rows}`;
}

function formatDnsRecordsList(data) {
  let { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhum registro DNS encontrado.';
  // Filter pseudo-records that are zone metadata, not actual DNS records
  const PSEUDO_TYPES = new Set([':RAW', '$TTL', '$ORIGIN', '$INCLUDE', '$GENERATE']);
  const realItems = items.filter(r => {
    const t = String(r.type || '').toUpperCase();
    if (PSEUDO_TYPES.has(t)) return false;
    // Also drop completely empty rows (no name, no type, no value)
    const value = r.value || r.address || r.cname || r.exchange || r.txtdata || r.record || r.data;
    if (!r.name && !r.type && !value) return false;
    return true;
  });
  const filteredCount = realItems.length;
  const dropped = items.length - filteredCount;
  if (filteredCount === 0) return 'Nenhum registro DNS valido encontrado (apenas metadados de zona).';
  const header = pageInfo(filteredCount, limit, offset, total);
  const noteSuffix = dropped > 0 ? `\n\n_Nota: ${dropped} entradas de metadado de zona (:RAW/$TTL) foram filtradas._` : '';
  const rows = realItems.map(r =>
    `| ${esc(r.name)} | ${esc(r.type)} | ${truncate(r.value || r.record || r.address || r.data || r.content || r.cname || r.exchange || r.txtdata || '', 100)} | ${esc(r.ttl || 'default')} | ${esc(r.Line || r.line || '')} |`
  ).join('\n');
  return `${header}\n\n| Nome | Tipo | Valor | TTL | Linha |\n|---|---|---|---|---|\n${rows}${noteSuffix}`;
}

function formatDnsRecordDetail(record) {
  if (!record) return 'Registro DNS nao encontrado.';
  // Avoid r.data collision with spread data from DNS record objects
  const r = (record && !record.type && record.data) ? record.data : record;
  const value = r.value || r.address || r.cname || r.exchange || r.txtdata || r.nsdname || r.ptrdname || '';
  return `# Registro DNS\n\n` +
    `| Campo | Valor |\n|---|---|\n` +
    `| Nome | ${esc(r.name)} |\n` +
    `| Tipo | ${esc(r.type)} |\n` +
    `| Valor | ${esc(value)} |\n` +
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
  const mem = d.memory || {};
  const disk = d.disk || {};
  const memTotal = d.memTotal || d.total_memory || (mem.total != null ? `${mem.total} ${mem.unit || 'MB'}` : 'N/A');
  const memFree = d.memFree || d.free_memory || (mem.free != null ? `${mem.free} ${mem.unit || 'MB'}` : 'N/A');
  const memUsed = mem.used != null ? `${mem.used} ${mem.unit || 'MB'}` : 'N/A';
  const diskUsage = d.diskUsage || d.disk_usage ||
    (disk.usage ? `${disk.used || '?'} / ${disk.total || '?'} (${disk.usage})` : 'N/A');
  return `# Carga do Sistema\n\n` +
    `| Metrica | Valor |\n|---|---|\n` +
    `| Load 1m | ${esc(d.load1 || d.loadavg?.[0] || d.one || 'N/A')} |\n` +
    `| Load 5m | ${esc(d.load5 || d.loadavg?.[1] || d.five || 'N/A')} |\n` +
    `| Load 15m | ${esc(d.load15 || d.loadavg?.[2] || d.fifteen || 'N/A')} |\n` +
    (d.uptime ? `| Uptime | ${esc(d.uptime)} |\n` : '') +
    `| CPU Cores | ${esc(d.cpuCount || d.cpu_count || 'N/A')} |\n` +
    `| Memoria Total | ${esc(memTotal)} |\n` +
    `| Memoria Usada | ${esc(memUsed)} |\n` +
    `| Memoria Livre | ${esc(memFree)} |\n` +
    `| Disco | ${esc(diskUsage)} |`;
}

function formatLogLines(data) {
  if (!data) return 'Nenhuma linha de log encontrada.';
  const d = data?.data || data;
  let raw;
  if (typeof d === 'string') {
    raw = d.split('\n').filter(l => l.trim());
  } else if (Array.isArray(d)) {
    raw = d;
  } else if (Array.isArray(d?.lines)) {
    raw = d.lines;
  } else if (Array.isArray(d?.logs)) {
    raw = d.logs;
  } else if (typeof d?.output === 'string') {
    raw = d.output.split('\n').filter(l => l.trim());
  } else {
    raw = [];
  }
  if (!raw.length) return 'Nenhuma linha de log encontrada.';
  const lines = raw.slice(0, 100);
  const rows = lines.map((line, i) =>
    `| ${i + 1} | ${truncate(typeof line === 'string' ? line : (line.message || line.line || JSON.stringify(line)), 200)} |`
  ).join('\n');
  const header = d?.logfile ? `**${lines.length} linhas de \`${esc(d.logfile)}\`**` : `**${lines.length} linhas de log**`;
  return `${header}${raw.length > 100 ? ` (truncado de ${raw.length})` : ''}\n\n| # | Conteudo |\n|---|---|\n${rows}`;
}

// ============================================
// FILES
// ============================================

function humanizeBytes(value) {
  if (value == null || value === '') return 'N/A';
  if (typeof value === 'string' && !/^\d+$/.test(value)) return value;
  const n = Number(value);
  if (!isFinite(n) || n < 0) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function humanizeEpoch(value) {
  if (value == null || value === '' || value === 'N/A') return 'N/A';
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return String(value);
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(value);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function formatFilesList(data) {
  const { items, count, total, limit, offset } = data;
  if (!items || !items.length) return 'Nenhum arquivo encontrado.';
  const header = pageInfo(count, limit, offset, total, { clamped: data.clamped, requestedLimit: data.requestedLimit });
  const rows = items.map(f => {
    const name = f.file || f.name || f.filename;
    const isDir = f.type === 'directory' || f.isDir || f.is_dir;
    const type = f.type || (isDir ? 'directory' : 'file');
    const rawSize = f.size != null ? f.size : (f.humansize || null);
    const size = isDir ? humanizeBytes(rawSize) : (rawSize != null ? humanizeBytes(rawSize) : '0 B');
    const mtimeRaw = f.mtime || f.modified;
    return `| ${esc(name)} | ${esc(type)} | ${esc(size)} | ${esc(humanizeEpoch(mtimeRaw))} |`;
  }).join('\n');
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
  if (d.message && Object.keys(d).length <= 2) return d.message;
  if (typeof d.result === 'string') return d.result;
  // Try to surface structured payload as a key/value table instead of generic success message
  if (typeof d === 'object' && d !== null) {
    const keys = Object.keys(d).filter(k => !['timestamp', 'success'].includes(k));
    if (keys.length > 0) {
      const rows = keys.map(k => {
        let v = d[k];
        if (v && typeof v === 'object') v = JSON.stringify(v);
        return `| ${esc(k)} | ${truncate(String(v ?? 'N/A'), 200)} |`;
      }).join('\n');
      const title = action ? `Resultado: ${action}` : 'Resultado';
      return `# ${title}\n\n| Campo | Valor |\n|---|---|\n${rows}`;
    }
  }
  return `Operacao "${action || 'executada'}" realizada com sucesso.`;
}

function formatResolveIp(data, domain) {
  if (!data) return 'Nao foi possivel resolver o IP do dominio.';
  const d = data?.data || data;
  const ip = d.ip || d.address || d.resolved_ip || (typeof d === 'string' ? d : null);
  const resolvedDomain = d.domain || d.name || domain || 'N/A';
  if (!ip) return `Nao foi possivel resolver IP para ${esc(resolvedDomain)}.`;
  return `# Resolucao DNS\n\n| Campo | Valor |\n|---|---|\n` +
    `| Dominio | ${esc(resolvedDomain)} |\n` +
    `| IP | ${esc(ip)} |` +
    (d.is_local !== undefined ? `\n| Hospedado Localmente | ${d.is_local ? 'Sim' : 'Nao'} |` : '');
}

function formatDomainOwner(data, domain) {
  if (!data) return 'Proprietario nao encontrado.';
  const d = data?.data || data;
  const owner = d.user || d.owner || d.cpanel_user || (typeof d === 'string' ? d : null);
  if (!owner) return `Nao foi possivel determinar o proprietario de ${esc(domain || 'dominio informado')}.`;
  return `# Proprietario do Dominio\n\n| Campo | Valor |\n|---|---|\n` +
    `| Dominio | ${esc(d.domain || domain || 'N/A')} |\n` +
    `| Username cPanel | ${esc(owner)} |` +
    (d.email ? `\n| Email | ${esc(d.email)} |` : '') +
    (d.plan || d.package ? `\n| Plano | ${esc(d.plan || d.package)} |` : '');
}

function formatDomainAuthority(data, domain) {
  if (!data) return 'Status de autoridade DNS nao disponivel.';
  const d = data?.data || data;
  const isAuthoritative = d.is_authoritative ?? d.authoritative ?? (d.type === 'master' || d.type === 'local');
  return `# Autoridade DNS\n\n| Campo | Valor |\n|---|---|\n` +
    `| Dominio | ${esc(d.domain || domain || 'N/A')} |\n` +
    `| Autoritativo neste servidor | ${isAuthoritative ? 'Sim' : 'Nao'} |` +
    (d.nameservers ? `\n| Nameservers | ${esc(Array.isArray(d.nameservers) ? d.nameservers.join(', ') : d.nameservers)} |` : '') +
    (d.zone_type || d.type ? `\n| Tipo de Zona | ${esc(d.zone_type || d.type)} |` : '');
}

function formatNestedSubdomains(data, zone) {
  if (!data) return `Nenhum subdominio aninhado em ${esc(zone || 'zona')}.`;
  const d = data?.data || data;
  const items = Array.isArray(d) ? d :
    (d.nested || d.subdomains || d.results || d.records || []);
  if (!items.length) return `Nenhum subdominio aninhado em ${esc(zone || 'zona')}.`;
  const rows = items.map(s => {
    if (typeof s === 'string') return `| ${esc(s)} | N/A |`;
    return `| ${esc(s.name || s.subdomain || s.domain)} | ${esc(s.depth || s.level || s.type || 'N/A')} |`;
  }).join('\n');
  return `**${items.length} subdominios aninhados em ${esc(zone || 'zona')}**\n\n| Subdominio | Profundidade/Tipo |\n|---|---|\n${rows}`;
}

function formatConversionsList(data) {
  if (!data) return 'Nenhuma conversao encontrada.';
  const d = data?.data || data;
  const items = Array.isArray(d) ? d : (d.conversions || d.results || d.records || []);
  if (!items.length) return 'Nenhuma conversao de addon -> conta encontrada.';
  const rows = items.map(c =>
    `| ${esc(c.conversion_id || c.id)} | ${esc(c.domain || c.source_domain)} | ${esc(c.new_user || c.target_user)} | ${esc(c.status || c.state || 'N/A')} | ${esc(humanizeEpoch(c.created_at || c.start_time))} |`
  ).join('\n');
  return `**${items.length} conversoes**\n\n| ID | Dominio | Novo Usuario | Status | Criada em |\n|---|---|---|---|---|\n${rows}`;
}

module.exports = {
  formatAccountsList, formatAccountDetail, formatAccountDomains,
  formatServerStatus, formatServerConfig, formatServicesStatus,
  formatDomainsList, formatDomainDetail,
  formatDomainOwner, formatDomainAuthority, formatResolveIp,
  formatDnsZonesList, formatDnsRecordsList, formatDnsRecordDetail, formatMxRecordsList,
  formatNestedSubdomains, formatConversionsList,
  formatDnssecInfo,
  formatSystemLoad, formatLogLines,
  formatFilesList, formatFileContent,
  formatOperationResult,
  humanizeBytes, humanizeEpoch, formatStartDate,
};
