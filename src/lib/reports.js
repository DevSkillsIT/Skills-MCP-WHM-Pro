/**
 * Reports — Geradores de relatorios WHM/cPanel com dados REAIS.
 *
 * Substitui os Analysis Prompts (que retornavam apenas templates literais).
 * Cada generate*() orquestra chamadas ao WHM API e retorna Markdown completo,
 * sem placeholders, pronto para ser exibido ao usuario final.
 *
 * Convencoes:
 * - Toda funcao recebe (ctx, args) onde ctx = { whmService, sshManager }.
 * - Retorno SEMPRE: string Markdown.
 * - Em caso de falha parcial, continuar com best-effort e marcar "N/A" + nota.
 */

const { humanizeBytes, formatStartDate } = require('./formatters/whm-formatters');

const REPORT_NAMES = [
  'whm_account_health_summary',
  'whm_resource_usage_trends',
  'whm_security_posture',
  'whm_ssl_certificate_inventory',
  'whm_backup_coverage',
  'whm_dns_zone_health',
  'whm_email_deliverability',
  'whm_account_quick_lookup',
  'whm_dns_troubleshooting',
  'whm_email_setup_guide',
  'whm_ssl_installation_guide',
  'whm_website_down_investigation',
  'whm_disk_usage_alert',
  'whm_domain_migration_checklist',
  'whm_backup_restore_guide'
];

// ============================================
// Helpers internos
// ============================================

function nowUTC() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function fmtDiskMB(value) {
  if (value == null || value === '' || value === 'unlimited') return value === 'unlimited' ? 'ilimitado' : 'N/A';
  const n = Number(String(value).replace(/M$/i, ''));
  if (!isFinite(n) || n < 0) return String(value);
  return humanizeBytes(n * 1024 * 1024);
}

function pct(used, total) {
  const u = Number(String(used || '0').replace(/M$/i, ''));
  const t = Number(String(total || '0').replace(/M$/i, ''));
  if (!t || t <= 0) return 'N/A';
  return `${((u / t) * 100).toFixed(1)}%`;
}

function safeUnwrap(result) {
  if (!result) return null;
  if (result.success !== undefined && result.data !== undefined) return result.data;
  return result;
}

async function bestEffort(promise, fallback = null) {
  try { return await promise; } catch (_) { return fallback; }
}

function extractZoneRecords(zoneData) {
  // WHM /dumpzone returns { data: { zone: [{ record: [...] }] } }
  const d = zoneData?.data || zoneData;
  if (Array.isArray(d?.zone)) {
    const rec = d.zone[0]?.record || [];
    return Array.isArray(rec) ? rec : [];
  }
  return d?.record || d?.records || [];
}

async function getServiceStatusWithFallback(ctx) {
  const { whmService, sshManager } = ctx;
  try {
    const res = await whmService.getServiceStatus();
    return res?.services || [];
  } catch (apiError) {
    if (sshManager && apiError.message?.includes('Parse Error')) {
      try {
        const sshRes = await sshManager._executeCommand('whmapi1 servicestatus --output=json');
        const parsed = JSON.parse(sshRes.output);
        return parsed?.data?.service || [];
      } catch (_) { /* fall through */ }
    }
    return [];
  }
}

function tryFindRecord(records, type, namePattern) {
  if (!Array.isArray(records)) return null;
  const re = namePattern instanceof RegExp ? namePattern : new RegExp(namePattern, 'i');
  return records.find(r => String(r.type || '').toUpperCase() === type && re.test(String(r.name || '')));
}

// ============================================
// REPORTS — GESTOR (7)
// ============================================

async function generateAccountHealthSummary(ctx, args) {
  const { whmService } = ctx;
  const filterSuspended = args?.filter_suspended === true || args?.filter_suspended === 'true';

  const acctsRaw = await bestEffort(whmService.listAccounts(), { data: { acct: [] } });
  const accounts = acctsRaw?.data?.acct || acctsRaw?.acct || [];
  const filtered = filterSuspended ? accounts.filter(a => a.suspended) : accounts;

  const active = accounts.filter(a => !a.suspended).length;
  const suspended = accounts.filter(a => a.suspended).length;

  const allServices = await getServiceStatusWithFallback(ctx);
  const stopped = allServices.filter(s => !(s.running === 1 || s.running === true));
  const criticalStopped = stopped.filter(s => ['httpd', 'mysql', 'mariadb', 'exim', 'named', 'cpsrvd'].includes(s.name || s.service));

  const overQuota = accounts.filter(a => {
    const u = Number(String(a.diskused || '0').replace(/M$/, ''));
    const t = Number(String(a.disklimit || '0').replace(/M$/, ''));
    return t > 0 && u / t >= 0.9;
  });

  const lines = [];
  lines.push(`# Saude das Contas — Resumo Executivo${filterSuspended ? ' (apenas suspensas)' : ''}`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  lines.push(`## Status de Contas`);
  lines.push(`- Total: **${accounts.length}**`);
  lines.push(`- Ativas: **${active}**`);
  lines.push(`- Suspensas: **${suspended}**`);
  lines.push(`- Acima de 90% de quota: **${overQuota.length}**\n`);

  if (overQuota.length) {
    lines.push(`### Contas com quota >= 90%`);
    overQuota.slice(0, 10).forEach(a => {
      lines.push(`- \`${a.user}\` (${a.domain}) — ${fmtDiskMB(a.diskused)} / ${fmtDiskMB(a.disklimit)} (${pct(a.diskused, a.disklimit)})`);
    });
    lines.push('');
  }

  lines.push(`## Servicos Criticos`);
  const criticalServices = ['httpd', 'mysql', 'mariadb', 'exim', 'named', 'cpsrvd', 'sshd', 'lfd'];
  criticalServices.forEach(svc => {
    const found = allServices.find(s => (s.name || s.service) === svc);
    if (found) {
      const ok = found.running === 1 || found.running === true;
      lines.push(`- ${svc}: ${ok ? 'Ativo' : '**PARADO**'}`);
    }
  });
  if (criticalStopped.length) {
    lines.push(`\n**Atencao:** ${criticalStopped.length} servicos criticos parados — investigar com manage_system_services restart_service`);
  }

  if (filterSuspended && filtered.length) {
    lines.push(`\n## Contas Suspensas (${filtered.length})`);
    filtered.slice(0, 20).forEach(a => {
      lines.push(`- \`${a.user}\` — ${a.domain} — motivo: ${a.suspendreason || 'nao informado'}`);
    });
  }
  return lines.join('\n');
}

async function generateResourceUsageTrends(ctx, args) {
  const { whmService, sshManager } = ctx;
  const periodDays = args?.period_days || 7;

  const acctsRaw = await bestEffort(whmService.listAccounts(), { data: { acct: [] } });
  const accounts = acctsRaw?.data?.acct || acctsRaw?.acct || [];

  let serverLoad = null;
  if (sshManager) serverLoad = safeUnwrap(await bestEffort(sshManager.getSystemLoad()));

  const totalUsedMB = accounts.reduce((sum, a) => sum + (Number(String(a.diskused || '0').replace(/M$/, '')) || 0), 0);
  const totalLimitMB = accounts.reduce((sum, a) => {
    const v = String(a.disklimit || '0');
    if (v === 'unlimited') return sum;
    return sum + (Number(v.replace(/M$/, '')) || 0);
  }, 0);

  // Projection: usage rate inferred from (current_usage / days_since_account_creation)
  // Honest heuristic — assumes linear growth from day 1; works as a *long-term average*.
  const nowSec = Math.floor(Date.now() / 1000);
  const accountsWithProjection = accounts.map(a => {
    const usedMB = Number(String(a.diskused || '0').replace(/M$/, '')) || 0;
    const limitStr = String(a.disklimit || '');
    const limitMB = limitStr === 'unlimited' ? null : (Number(limitStr.replace(/M$/, '')) || 0);
    const startEpoch = Number(a.startdate_epoch || a.created_epoch || 0) ||
                       (a.unix_start_time ? Number(a.unix_start_time) : 0);
    let daysAlive = null;
    if (startEpoch > 0) daysAlive = Math.max(1, Math.floor((nowSec - startEpoch) / 86400));
    // Fallback: try parsing legacy "YY Mon DD HH:MM" via formatStartDate to a Date
    if (!daysAlive && a.startdate) {
      const parsed = formatStartDate(a.startdate);
      if (parsed && /^\d{4}-/.test(parsed)) {
        const dt = new Date(parsed.replace(' UTC', '') + 'Z');
        if (!isNaN(dt.getTime())) daysAlive = Math.max(1, Math.floor((Date.now() - dt.getTime()) / 86400000));
      }
    }
    const ratePerDayMB = daysAlive ? usedMB / daysAlive : null;
    let daysTo90 = null;
    if (limitMB && ratePerDayMB && ratePerDayMB > 0) {
      const threshold = limitMB * 0.9;
      if (usedMB < threshold) daysTo90 = Math.floor((threshold - usedMB) / ratePerDayMB);
      else daysTo90 = 0;
    }
    return { user: a.user, domain: a.domain, usedMB, limitMB, daysAlive, ratePerDayMB, daysTo90 };
  });

  const top5Disk = [...accountsWithProjection].sort((a, b) => b.usedMB - a.usedMB).slice(0, 5);

  // Server-level projection
  let serverEtaText = null;
  if (serverLoad?.disk?.used && serverLoad?.disk?.total && serverLoad?.disk?.usage) {
    const parseGB = (s) => {
      const m = String(s || '').match(/^([\d.]+)\s*([KMGT])/i);
      if (!m) return null;
      const n = parseFloat(m[1]);
      const u = m[2].toUpperCase();
      return u === 'T' ? n * 1024 : u === 'G' ? n : u === 'M' ? n / 1024 : u === 'K' ? n / (1024 * 1024) : null;
    };
    const usedGB = parseGB(serverLoad.disk.used);
    const totalGB = parseGB(serverLoad.disk.total);
    // Aggregate rate = sum of per-account rates (proxy for server-wide growth)
    const totalRateGBPerDay = accountsWithProjection
      .filter(a => a.ratePerDayMB != null)
      .reduce((sum, a) => sum + (a.ratePerDayMB / 1024), 0);
    if (usedGB && totalGB && totalRateGBPerDay > 0) {
      const threshold = totalGB * 0.9;
      const daysTo90 = Math.max(0, Math.floor((threshold - usedGB) / totalRateGBPerDay));
      serverEtaText = `${daysTo90} dias ate 90% (~${(totalRateGBPerDay * 1024).toFixed(0)} MB/dia agregado)`;
    }
  }

  const lines = [];
  lines.push(`# Tendencias de Uso de Recursos (janela: ${periodDays} dias)`);
  lines.push(`_Gerado: ${nowUTC()}_`);
  lines.push(`_Nota: WHM nao armazena historico nativo. Projecoes usam (uso_atual / dias_desde_criacao) como taxa media; sao estimativa de longo prazo, nao mede crescimento da semana._\n`);

  lines.push(`## Disco`);
  lines.push(`- Uso total alocado pelas contas: **${humanizeBytes(totalUsedMB * 1024 * 1024)}** / **${humanizeBytes(totalLimitMB * 1024 * 1024)}** (planos somados)`);
  if (serverLoad?.disk) {
    lines.push(`- Disco do servidor (partition /): **${serverLoad.disk.used} / ${serverLoad.disk.total} (${serverLoad.disk.usage})**`);
  }
  if (serverEtaText) lines.push(`- **ETA esgotamento do servidor**: ${serverEtaText}`);
  lines.push('');

  lines.push(`## Top 5 contas por consumo (com projecao)`);
  lines.push(`| Conta | Uso | Quota | Idade | Taxa media | ETA 90% |`);
  lines.push(`|---|---|---|---|---|---|`);
  top5Disk.forEach(a => {
    const usoFmt = humanizeBytes(a.usedMB * 1024 * 1024);
    const quotaFmt = a.limitMB ? humanizeBytes(a.limitMB * 1024 * 1024) : 'ilimitado';
    const idadeFmt = a.daysAlive ? `${a.daysAlive}d` : 'N/A';
    const taxaFmt = a.ratePerDayMB != null ? `${a.ratePerDayMB.toFixed(2)} MB/dia` : 'N/A';
    let etaFmt = 'N/A';
    if (a.daysTo90 != null) etaFmt = a.daysTo90 === 0 ? '**JA EXCEDEU**' : `${a.daysTo90}d`;
    if (a.limitMB == null) etaFmt = 'sem limite';
    lines.push(`| \`${a.user}\` | ${usoFmt} | ${quotaFmt} | ${idadeFmt} | ${taxaFmt} | ${etaFmt} |`);
  });
  lines.push('');

  // Highlight at-risk accounts
  const atRisk = accountsWithProjection.filter(a => a.daysTo90 != null && a.daysTo90 > 0 && a.daysTo90 <= 90);
  if (atRisk.length > 0) {
    lines.push(`## Contas em risco (ETA 90% <= 90 dias)`);
    atRisk.sort((a, b) => a.daysTo90 - b.daysTo90).forEach(a => {
      lines.push(`- \`${a.user}\` (${a.domain}) — ETA: **${a.daysTo90} dias** | atual ${humanizeBytes(a.usedMB * 1024 * 1024)}/${humanizeBytes(a.limitMB * 1024 * 1024)}`);
    });
    lines.push('');
  }

  lines.push(`## CPU/Memoria`);
  if (serverLoad) {
    lines.push(`- Load avg (1/5/15m): ${serverLoad.loadavg?.[0] ?? 'N/A'} / ${serverLoad.loadavg?.[1] ?? 'N/A'} / ${serverLoad.loadavg?.[2] ?? 'N/A'}`);
    lines.push(`- CPU Cores: ${serverLoad.cpuCount ?? 'N/A'}`);
    if (serverLoad.memory) {
      const m = serverLoad.memory;
      const pctMem = m.total > 0 ? ((m.used / m.total) * 100).toFixed(1) : '?';
      lines.push(`- Memoria: ${m.used}/${m.total} MB usados (${pctMem}%, ${m.free} MB livres)`);
    }
    lines.push(`- Uptime: ${serverLoad.uptime || 'N/A'}`);
  } else {
    lines.push(`- SSH indisponivel; metricas de CPU/RAM nao coletadas nesta rodada`);
  }
  lines.push('');

  lines.push(`## Banda`);
  lines.push(`- WHM nao expoe historico de banda para todas as contas via API publica.`);
  lines.push(`- Para historico real: consultar Bandwidth no WHM UI (Account Information > View Bandwidth Usage).`);
  lines.push('');

  lines.push(`## Limitacoes da projecao`);
  lines.push(`- A taxa media e calculada como \`uso_atual / dias_desde_criacao\` — uniforme ao longo da vida da conta.`);
  lines.push(`- Crescimento real e raramente linear; sites em fase ativa de uploads/backups crescem muito mais rapido.`);
  lines.push(`- Para projecao real semana-a-semana, precisaria armazenar snapshots historicos (cron + storage local), o que nao esta no escopo do WHM nativo.`);
  return lines.join('\n');
}

async function generateSecurityPosture(ctx, args) {
  const { whmService } = ctx;
  const checkType = args?.check_type || 'all';

  const allServices = await getServiceStatusWithFallback(ctx);
  const findSvc = name => allServices.find(s => (s.name || s.service) === name);

  const lfd = findSvc('lfd');
  const ssh = findSvc('sshd');
  const clamd = findSvc('clamd');
  const cphulkd = findSvc('cphulkd');

  const lines = [];
  lines.push(`# Postura de Seguranca`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  lines.push(`## Firewall e Detecção de Intrusao`);
  lines.push(`- CSF/LFD: ${lfd ? (lfd.running ? 'Ativo' : '**INATIVO**') : 'Nao instalado / nao reportado'}`);
  lines.push(`- cPHulk (brute-force protection): ${cphulkd ? (cphulkd.running ? 'Ativo' : '**INATIVO**') : 'Nao instalado'}`);
  lines.push(`- SSH daemon: ${ssh ? (ssh.running ? 'Ativo' : '**INATIVO**') : 'Nao reportado'}`);
  lines.push(`- ClamAV (antivirus): ${clamd ? (clamd.running ? 'Ativo' : '**INATIVO**') : 'Nao instalado'}`);
  lines.push('');

  lines.push(`## Patches e Atualizações`);
  lines.push(`- Verificacao via API WHM publica nao disponivel; use \`yum updateinfo\` ou \`apt list --upgradable\` via manage_system_services read_logs ou SSH.`);
  lines.push('');

  if (checkType === 'all' || checkType === 'ssl') {
    lines.push(`## SSL/AutoSSL`);
    lines.push(`- Inventario detalhado: use \`whm_cpanel_generate_report\` com name=whm_ssl_certificate_inventory.`);
    lines.push('');
  }

  lines.push(`## Acoes recomendadas`);
  if (!lfd?.running) lines.push(`- **Critico**: ativar/instalar CSF/LFD`);
  if (!cphulkd?.running) lines.push(`- **Alta**: ativar cPHulk em "Security Center" > "cPHulk Brute Force Protection"`);
  if (!clamd?.running) lines.push(`- **Media**: avaliar instalar ClamAV via WHM > "EasyApache" ou \`yum install clamav\``);
  lines.push(`- Revisar configuracao TLS minima: TLS 1.2+ obrigatorio, desativar SSLv3/TLS 1.0/1.1`);
  return lines.join('\n');
}

async function generateSSLInventory(ctx, args) {
  const { sshManager } = ctx;

  const lines = [];
  lines.push(`# Inventario de Certificados SSL`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  let vhosts = null;
  if (sshManager) {
    const sshRes = await bestEffort(sshManager._executeCommand('whmapi1 --output=json fetch_ssl_vhosts 2>/dev/null'));
    if (sshRes?.output) {
      try { vhosts = JSON.parse(sshRes.output)?.data?.vhosts; } catch (_) { /* ignore */ }
    }
  }

  if (!vhosts || !Array.isArray(vhosts)) {
    lines.push(`Inventario SSL indisponivel: nao foi possivel chamar \`whmapi1 fetch_ssl_vhosts\` via SSH.`);
    lines.push(`- Verifique em WHM > SSL/TLS > Manage SSL Hosts`);
    return lines.join('\n');
  }

  const now = Math.floor(Date.now() / 1000);
  const D30 = 30 * 86400;
  const D90 = 90 * 86400;

  const enriched = vhosts.map(v => {
    const notAfter = Number(v.crt?.not_after || 0);
    const issuer = v.crt?.['issuer.organizationName'] || v.crt?.issuer?.organizationName || 'desconhecido';
    const isAutoSSL = /let'?s encrypt|cpanel/i.test(issuer);
    const validation = v.crt?.validation_type || 'unknown';
    return {
      servername: v.servername,
      user: v.user,
      domains: v.domains || [],
      certDomains: v.crt?.domains || [],
      issuer,
      isAutoSSL,
      validation,
      notAfter,
      daysLeft: notAfter ? Math.floor((notAfter - now) / 86400) : null,
      isWildcard: (v.crt?.domains || []).some(d => d.startsWith('*.'))
    };
  });

  const expired = enriched.filter(c => c.daysLeft != null && c.daysLeft < 0);
  const critical = enriched.filter(c => c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= 30);
  const warning = enriched.filter(c => c.daysLeft != null && c.daysLeft > 30 && c.daysLeft <= 90);
  const autoSSLCount = enriched.filter(c => c.isAutoSSL).length;
  const wildcardCount = enriched.filter(c => c.isWildcard).length;

  lines.push(`## Resumo`);
  lines.push(`- Vhosts SSL ativos: **${enriched.length}**`);
  lines.push(`- Via AutoSSL/Let's Encrypt: **${autoSSLCount}**`);
  lines.push(`- Wildcards: **${wildcardCount}**`);
  lines.push(`- **Expirados**: ${expired.length}`);
  lines.push(`- **Expirando em <= 30 dias**: ${critical.length}`);
  lines.push(`- Expirando em 31-90 dias: ${warning.length}\n`);

  if (expired.length > 0) {
    lines.push(`## EXPIRADOS (acao imediata)`);
    expired.slice(0, 20).forEach(c => {
      lines.push(`- \`${c.servername}\` (user: ${c.user}) — venceu ha ${Math.abs(c.daysLeft)}d em ${new Date(c.notAfter * 1000).toISOString().slice(0, 10)}`);
    });
    lines.push('');
  }

  if (critical.length > 0) {
    lines.push(`## A expirar em <= 30 dias`);
    critical.slice(0, 30).forEach(c => {
      lines.push(`- \`${c.servername}\` (user: ${c.user}) — **${c.daysLeft}d** | emissor: ${c.issuer}`);
    });
    lines.push('');
  }

  // Group by user for ownership summary
  const byUser = {};
  enriched.forEach(c => {
    byUser[c.user] = byUser[c.user] || { total: 0, autossl: 0, wildcard: 0, expired: 0 };
    byUser[c.user].total++;
    if (c.isAutoSSL) byUser[c.user].autossl++;
    if (c.isWildcard) byUser[c.user].wildcard++;
    if (c.daysLeft != null && c.daysLeft < 0) byUser[c.user].expired++;
  });
  lines.push(`## Distribuicao por conta`);
  lines.push(`| Usuario | Total | AutoSSL | Wildcard | Expirados |`);
  lines.push(`|---|---|---|---|---|`);
  Object.entries(byUser).sort((a, b) => b[1].total - a[1].total).forEach(([u, s]) => {
    lines.push(`| \`${u}\` | ${s.total} | ${s.autossl} | ${s.wildcard} | ${s.expired || '-'} |`);
  });
  return lines.join('\n');
}

async function generateBackupCoverage(ctx, args) {
  const { whmService, sshManager } = ctx;

  const acctsRaw = await bestEffort(whmService.listAccounts(), { data: { acct: [] } });
  const accounts = acctsRaw?.data?.acct || acctsRaw?.acct || [];

  const lines = [];
  lines.push(`# Cobertura de Backups`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  lines.push(`## Contas`);
  lines.push(`- Total: **${accounts.length}**\n`);

  // Try JetBackup5 first (modern WHM standard)
  let jobsData = null;
  let backupsForAccounts = null;
  if (sshManager) {
    const jobsRes = await bestEffort(sshManager._executeCommand('jetbackup5api -F listBackupJobs -O json 2>/dev/null'));
    if (jobsRes?.output) {
      try { jobsData = JSON.parse(jobsRes.output); } catch (_) { /* ignore */ }
    }
    const backupsRes = await bestEffort(sshManager._executeCommand('jetbackup5api -F listBackupForAccounts -O json -D "type=1" 2>/dev/null'));
    if (backupsRes?.output) {
      try { backupsForAccounts = JSON.parse(backupsRes.output); } catch (_) { /* ignore */ }
    }
  }

  if (jobsData?.success && jobsData?.data?.jobs?.length > 0) {
    lines.push(`## JetBackup5: Jobs configurados (${jobsData.data.jobs.length})`);
    jobsData.data.jobs.forEach(job => {
      lines.push(`\n### \`${job.name}\``);
      lines.push(`- Status: ${job.disabled ? '**DESATIVADO**' : 'Ativo'}`);
      lines.push(`- Job ID: ${job._id}`);
      const dests = job.destination_details || [];
      lines.push(`- Destinos: ${dests.length}`);
      dests.forEach(d => {
        const usage = d.disk_usage;
        let usageStr = 'N/A';
        if (usage && typeof usage === 'object') {
          const usedGB = (usage.usage / (1024 ** 3)).toFixed(1);
          const totalGB = (usage.total / (1024 ** 3)).toFixed(1);
          const freeGB = (usage.free / (1024 ** 3)).toFixed(1);
          const pctUsed = ((usage.usage / usage.total) * 100).toFixed(1);
          usageStr = `${usedGB}GB / ${totalGB}GB usado (${pctUsed}%, livre: ${freeGB}GB)`;
        }
        lines.push(`  - **${d.name}** (${d.type_name}): ${usageStr}`);
        if (d.options?.path) lines.push(`    - Caminho: \`${d.options.path}\``);
        if (d.options?.bucket) lines.push(`    - Bucket: \`${d.options.bucket}\``);
        if (d.options?.region) lines.push(`    - Region: ${d.options.region}`);
        if (d.disabled) lines.push(`    - **DESTINO DESATIVADO**`);
      });
    });
    lines.push('');
  } else {
    lines.push(`## JetBackup5 indisponivel ou sem jobs configurados.`);
    lines.push(`- Verifique \`jetbackup5api -F listBackupJobs\` ou WHM > JetBackup\n`);
  }

  // Backup coverage per account
  if (backupsForAccounts?.success && backupsForAccounts?.data?.backups) {
    const covered = backupsForAccounts.data.backups || [];
    const coveredUsers = new Set(covered.map(b => b.account?.username || b.username));
    const uncovered = accounts.filter(a => !coveredUsers.has(a.user));
    lines.push(`## Cobertura por conta (type=1: contas)`);
    lines.push(`- Cobertas pelo JetBackup: **${coveredUsers.size}** / ${accounts.length}`);
    if (uncovered.length > 0) {
      lines.push(`- Sem backup recente:`);
      uncovered.forEach(a => lines.push(`  - \`${a.user}\` (${a.domain})`));
    }
    lines.push('');
  }

  // Fallback: check /backup legacy + jetbackup local dir
  if (sshManager) {
    const fallbackRes = await bestEffort(sshManager._executeCommand('ls -lah /home/backups_local_jetbackup 2>/dev/null | head -20; echo "==="; ls /backup 2>/dev/null'));
    if (fallbackRes?.output && !jobsData) {
      lines.push(`## Inspecao manual de diretorios`);
      lines.push('```');
      lines.push(fallbackRes.output.slice(0, 2000));
      lines.push('```');
    }
  }

  lines.push(`## Recomendacoes`);
  lines.push(`- Confirmar que ao menos 1 destino remoto esta ativo (proteger contra falha de hardware)`);
  lines.push(`- Validar retencao: 7 daily / 4 weekly / 6 monthly e o padrao saudavel`);
  lines.push(`- Testar restore mensalmente: WHM > JetBackup > Account Backups > Restore`);
  return lines.join('\n');
}

async function generateDnsZoneHealth(ctx, args) {
  const { whmService } = ctx;

  const zonesRaw = await bestEffort(whmService.listZones(), null);
  const zones = zonesRaw?.data?.zone || zonesRaw?.zone || [];
  const sample = zones.slice(0, 10);

  const lines = [];
  lines.push(`# Saude das Zonas DNS`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  lines.push(`## Resumo`);
  lines.push(`- Total de zonas: **${zones.length}**\n`);

  if (sample.length === 0) return lines.join('\n');

  lines.push(`## Analise de ${sample.length} zonas (amostra)`);
  for (const zone of sample) {
    const zoneName = zone.domain || zone.zone || zone;
    const zoneData = await bestEffort(whmService.getZone(zoneName), null);
    const records = extractZoneRecords(zoneData);

    const hasA = records.some(r => String(r.type).toUpperCase() === 'A');
    const hasMX = records.some(r => String(r.type).toUpperCase() === 'MX');
    const hasSPF = records.some(r => String(r.type).toUpperCase() === 'TXT' && /v=spf1/i.test(r.txtdata || r.data || ''));
    const hasDKIM = records.some(r => String(r.type).toUpperCase() === 'TXT' && /v=DKIM1/i.test(r.txtdata || r.data || ''));
    const hasDMARC = records.some(r => /^_dmarc\./i.test(r.name || ''));

    const checks = [
      hasA ? 'A' : '*A*',
      hasMX ? 'MX' : '*MX*',
      hasSPF ? 'SPF' : '*SPF*',
      hasDKIM ? 'DKIM' : '*DKIM*',
      hasDMARC ? 'DMARC' : '*DMARC*'
    ];
    lines.push(`- \`${zoneName}\` — ${checks.join(' / ')} (registros: ${records.length})`);
  }
  if (zones.length > sample.length) lines.push(`\n_Amostra de 10 de ${zones.length} zonas. Itens em itálico = ausentes._`);
  return lines.join('\n');
}

async function generateEmailDeliverability(ctx, args) {
  const { whmService } = ctx;
  const domain = args?.domain || args?.zone;

  const lines = [];
  lines.push(`# Entregabilidade de Email`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  if (!domain) {
    lines.push(`Forneca \`domain\` como argumento para analise especifica.`);
    lines.push(`Exemplo: \`{ "name": "whm_email_deliverability", "arguments": { "domain": "dominio.com.br" } }\``);
    return lines.join('\n');
  }

  const zoneData = await bestEffort(whmService.getZone(domain), null);
  const records = extractZoneRecords(zoneData);

  const mxRecords = records.filter(r => String(r.type).toUpperCase() === 'MX');
  const txtRecords = records.filter(r => String(r.type).toUpperCase() === 'TXT');
  const spfRec = txtRecords.find(r => /v=spf1/i.test(r.txtdata || r.data || ''));
  const dkimRec = txtRecords.find(r => /v=DKIM1/i.test(r.txtdata || r.data || ''));
  const dmarcRec = records.find(r => /^_dmarc\./i.test(r.name || ''));

  lines.push(`## Dominio: \`${domain}\`\n`);
  lines.push(`### Registros MX`);
  if (mxRecords.length === 0) lines.push(`- **Nenhum MX configurado** — email NAO sera entregue`);
  else mxRecords.forEach(r => lines.push(`- ${r.exchange || r.data} (prioridade ${r.preference ?? r.priority ?? '?'})`));
  lines.push('');

  lines.push(`### SPF`);
  if (spfRec) lines.push(`- Configurado: \`${spfRec.txtdata || spfRec.data}\``);
  else lines.push(`- **Ausente** — risco alto de bounces. Adicione registro TXT com v=spf1`);
  lines.push('');

  lines.push(`### DKIM`);
  if (dkimRec) lines.push(`- Configurado em \`${dkimRec.name}\``);
  else lines.push(`- **Ausente** — habilite via WHM > Email > Email Deliverability`);
  lines.push('');

  lines.push(`### DMARC`);
  if (dmarcRec) lines.push(`- Configurado em \`${dmarcRec.name}\`: \`${dmarcRec.txtdata || dmarcRec.data}\``);
  else lines.push(`- **Ausente** — recomendado para protecao contra spoofing`);
  return lines.join('\n');
}

// ============================================
// REPORTS — ANALISTA (8)
// ============================================

async function generateAccountQuickLookup(ctx, args) {
  const { whmService } = ctx;
  const searchTerm = args?.search_term || args?.query || args?.account_name || args?.username || args?.identifier;

  const lines = [];
  lines.push(`# Busca Rapida de Conta`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  if (!searchTerm) {
    lines.push(`Forneca \`search_term\`, \`username\` ou \`identifier\` como argumento.`);
    return lines.join('\n');
  }

  // Try direct username match first
  let acct = null;
  const directSummary = await bestEffort(whmService.getAccountSummary(searchTerm), null);
  if (directSummary?.data?.user || directSummary?.data?.domain) {
    acct = directSummary.data;
  }
  // Fallback: substring search by username/domain/owner via listAccounts
  if (!acct) {
    const all = await bestEffort(whmService.listAccounts(), { data: { acct: [] } });
    const accounts = all?.data?.acct || all?.acct || [];
    const re = new RegExp(searchTerm, 'i');
    acct = accounts.find(a => re.test(a.user || '') || re.test(a.domain || '') || re.test(a.owner || ''));
  }

  if (!acct) {
    lines.push(`Nenhuma conta encontrada para \`${searchTerm}\`.`);
    lines.push(`Use \`whm_cpanel_search_hosting_accounts\` (searchType=list) para inventario completo.`);
    return lines.join('\n');
  }

  const domains = await bestEffort(whmService.listDomains(acct.user, 100, 0), { data: [] });
  const domList = domains?.data || [];
  const counts = domList.reduce((acc, d) => { acc[d.type || 'unknown'] = (acc[d.type || 'unknown'] || 0) + 1; return acc; }, {});

  lines.push(`## Conta: \`${acct.user}\``);
  lines.push(`- Dominio principal: ${acct.domain}`);
  lines.push(`- Email contato: ${acct.email || acct.contactemail || 'N/A'}`);
  lines.push(`- Plano: ${acct.plan || acct.package || 'N/A'}`);
  lines.push(`- IP: ${acct.ip || 'N/A'}`);
  lines.push(`- Criada em: ${formatStartDate(acct.startdate || acct.created) || 'N/A'}`);
  lines.push(`- Status: ${acct.suspended ? `**Suspensa** (motivo: ${acct.suspendreason || 'nao informado'})` : 'Ativa'}\n`);

  lines.push(`## Recursos`);
  lines.push(`- Disco: ${fmtDiskMB(acct.diskused)} / ${fmtDiskMB(acct.disklimit)} (${pct(acct.diskused, acct.disklimit)})`);
  lines.push(`- Bandwidth: ${acct.bwlimit === 'unlimited' ? 'ilimitado' : (acct.bwlimit || 'N/A')}\n`);

  lines.push(`## Dominios (${domList.length})`);
  Object.entries(counts).forEach(([type, n]) => lines.push(`- ${type}: ${n}`));
  return lines.join('\n');
}

async function generateDnsTroubleshooting(ctx, args) {
  const { whmService } = ctx;
  const domain = args?.domain || args?.zone;

  const lines = [];
  lines.push(`# Troubleshoot DNS`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  if (!domain) {
    lines.push(`Forneca \`domain\` como argumento.`);
    return lines.join('\n');
  }

  const auth = await bestEffort(whmService.hasLocalAuthority(domain), null);
  const authData = auth?.data || auth;
  const isLocal = authData?.is_authoritative ?? authData?.authoritative ?? (authData?.type === 'local' || authData?.type === 'master');

  lines.push(`## Dominio: \`${domain}\``);
  lines.push(`- Autoritativo neste servidor: ${isLocal ? '**Sim**' : '**Nao**'}`);
  if (!isLocal) {
    lines.push(`\n_Como o servidor nao e autoritativo, mudancas locais nao afetam a propagacao. Verifique o registrador._`);
    return lines.join('\n');
  }

  const zoneData = await bestEffort(whmService.getZone(domain), null);
  const records = extractZoneRecords(zoneData);

  const aRec = tryFindRecord(records, 'A', new RegExp(`^${domain.replace(/\./g, '\\.')}\\.$`));
  const wwwRec = tryFindRecord(records, 'A', new RegExp(`^www\\.${domain.replace(/\./g, '\\.')}\\.$`)) ||
                 tryFindRecord(records, 'CNAME', new RegExp(`^www\\.${domain.replace(/\./g, '\\.')}\\.$`));
  const mxRecords = records.filter(r => String(r.type).toUpperCase() === 'MX');
  const nsRecords = records.filter(r => String(r.type).toUpperCase() === 'NS');

  lines.push(`\n## Apex (A)`);
  if (aRec) lines.push(`- ${aRec.address || aRec.data}`);
  else lines.push(`- **Nenhum registro A no apex** — site nao resolvera`);

  lines.push(`\n## www`);
  if (wwwRec) lines.push(`- Tipo ${wwwRec.type}: ${wwwRec.address || wwwRec.cname || wwwRec.data}`);
  else lines.push(`- **Nenhum www** — sites com prefix www nao resolverao`);

  lines.push(`\n## Nameservers (${nsRecords.length})`);
  nsRecords.forEach(r => lines.push(`- ${r.nsdname || r.data}`));

  lines.push(`\n## MX (${mxRecords.length})`);
  mxRecords.forEach(r => lines.push(`- ${r.exchange || r.data} (prioridade ${r.preference ?? r.priority ?? '?'})`));

  lines.push(`\n## Diagnostico`);
  if (!aRec) lines.push(`- **Critico**: faltam registros A — site nao acessivel`);
  if (!wwwRec) lines.push(`- **Alto**: faltam registros www — degrada experiencia`);
  if (nsRecords.length < 2) lines.push(`- **Aviso**: NS abaixo do recomendado (>= 2)`);
  if (mxRecords.length === 0) lines.push(`- **Aviso**: sem MX — email nao funcionara`);
  return lines.join('\n');
}

async function generateEmailSetupGuide(ctx, args) {
  const domain = args?.domain || args?.email_address?.split('@')?.[1] || 'seudominio.com.br';
  const email = args?.email_address || `usuario@${domain}`;
  const lines = [];
  lines.push(`# Guia de Configuracao de Email`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  lines.push(`## Conta de exemplo: \`${email}\`\n`);
  lines.push(`## IMAP (recomendado — sincroniza pastas)`);
  lines.push(`- Servidor: \`mail.${domain}\``);
  lines.push(`- Porta: **993** (SSL/TLS) ou 143 (sem SSL)`);
  lines.push(`- Autenticacao: senha normal\n`);
  lines.push(`## POP3 (legado — baixa e remove do servidor)`);
  lines.push(`- Servidor: \`mail.${domain}\``);
  lines.push(`- Porta: **995** (SSL/TLS) ou 110 (sem SSL)\n`);
  lines.push(`## SMTP (envio)`);
  lines.push(`- Servidor: \`mail.${domain}\``);
  lines.push(`- Porta: **465** (SSL/TLS) ou 587 (STARTTLS)`);
  lines.push(`- Autenticacao: SIM, com senha normal\n`);
  lines.push(`## Webmail`);
  lines.push(`- URL: \`https://${domain}/webmail\` ou \`https://${domain}:2096\``);
  lines.push(`- Roundcube: interface moderna`);
  lines.push(`- Horde: interface alternativa`);
  return lines.join('\n');
}

async function generateSslInstallationGuide(ctx, args) {
  const domain = args?.domain || 'seudominio.com.br';
  const lines = [];
  lines.push(`# Guia de Instalacao SSL/HTTPS`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  lines.push(`## Cenario A — AutoSSL (gratuito, automatico)`);
  lines.push(`1. WHM > SSL/TLS > Manage AutoSSL`);
  lines.push(`2. Ativar provedor (cPanel ou Let's Encrypt)`);
  lines.push(`3. Selecionar "Run AutoSSL For All Users"`);
  lines.push(`4. Verificar instalacao em https://${domain}\n`);
  lines.push(`## Cenario B — Certificado pago/manual`);
  lines.push(`1. Gerar CSR: WHM > SSL/TLS > Generate an SSL Certificate and Signing Request`);
  lines.push(`2. Enviar CSR ao emissor (DigiCert, Sectigo, etc.)`);
  lines.push(`3. Receber CRT + bundle`);
  lines.push(`4. WHM > Install an SSL Certificate on a Domain`);
  lines.push(`5. Colar CRT, chave privada e bundle\n`);
  lines.push(`## Forcar HTTPS (redirect)`);
  lines.push(`Editar \`.htaccess\` do domain (via search_account_files):`);
  lines.push('```');
  lines.push(`RewriteEngine On`);
  lines.push(`RewriteCond %{HTTPS} off`);
  lines.push(`RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]`);
  lines.push('```');
  return lines.join('\n');
}

async function generateWebsiteDownInvestigation(ctx, args) {
  const { whmService, sshManager } = ctx;
  const domain = args?.domain;

  const lines = [];
  lines.push(`# Investigacao: Site Fora do Ar`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  if (!domain) {
    lines.push(`Forneca \`domain\` como argumento.`);
    return lines.join('\n');
  }
  lines.push(`## Dominio: \`${domain}\`\n`);

  // 1. DNS
  const auth = await bestEffort(whmService.hasLocalAuthority(domain), null);
  const authData = auth?.data || auth;
  const isLocal = authData?.is_authoritative ?? authData?.authoritative ?? (authData?.type === 'local' || authData?.type === 'master');
  lines.push(`### 1. DNS`);
  lines.push(`- Autoritativo aqui: ${isLocal ? 'Sim' : 'Nao'}`);
  if (isLocal) {
    const zone = await bestEffort(whmService.getZone(domain), null);
    const records = extractZoneRecords(zone);
    const aRec = tryFindRecord(records, 'A', new RegExp(`^${domain.replace(/\./g, '\\.')}\\.$`));
    lines.push(`- Registro A apex: ${aRec ? (aRec.address || aRec.data) : '**AUSENTE**'}`);
  }

  // 2. Owner
  const owner = await bestEffort(whmService.getDomainOwner(domain), null);
  const ownerData = owner?.data || owner;
  const username = ownerData?.user || ownerData?.owner;
  lines.push(`\n### 2. Proprietario`);
  lines.push(`- Username cPanel: ${username || 'desconhecido'}`);
  if (username) {
    const acct = await bestEffort(whmService.getAccountSummary(username), null);
    const a = acct?.data;
    if (a) lines.push(`- Status conta: ${a.suspended ? `**Suspensa** (${a.suspendreason || 'sem motivo'})` : 'Ativa'}`);
  }

  // 3. Servicos
  const allServices = await getServiceStatusWithFallback(ctx);
  const httpd = allServices.find(s => (s.name || s.service) === 'httpd');
  const apache_php_fpm = allServices.find(s => (s.name || s.service) === 'apache_php_fpm');
  const mysql = allServices.find(s => (s.name || s.service) === 'mysql');
  lines.push(`\n### 3. Servicos do servidor`);
  lines.push(`- Apache (httpd): ${httpd ? (httpd.running ? 'Ativo' : '**PARADO**') : 'desconhecido'}`);
  lines.push(`- apache_php_fpm: ${apache_php_fpm ? (apache_php_fpm.running ? 'Ativo' : '**PARADO**') : 'desconhecido'}`);
  lines.push(`- MySQL/MariaDB: ${mysql ? (mysql.running ? 'Ativo' : '**PARADO**') : 'desconhecido'}`);

  // 4. Carga
  if (sshManager) {
    const load = safeUnwrap(await bestEffort(sshManager.getSystemLoad()));
    if (load) {
      lines.push(`\n### 4. Carga do servidor`);
      lines.push(`- Load 1m: ${load.loadavg?.[0]} | 5m: ${load.loadavg?.[1]} | 15m: ${load.loadavg?.[2]}`);
      lines.push(`- Disco /: ${load.disk?.used} / ${load.disk?.total} (${load.disk?.usage})`);
    }
  }

  lines.push(`\n## Proximos passos`);
  lines.push(`- Ler logs de Apache: \`manage_system_services\` action=read_logs log_file=\`/usr/local/apache/logs/error_log\``);
  lines.push(`- Logs especificos do dominio: \`/home/${username || 'USERNAME'}/logs/${domain}-ssl.log\``);
  return lines.join('\n');
}

async function generateDiskUsageAlert(ctx, args) {
  const { whmService, sshManager } = ctx;
  const username = args?.account_name || args?.username || args?.user;

  const lines = [];
  lines.push(`# Alerta de Uso de Disco`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  if (!username) {
    lines.push(`Forneca \`username\` ou \`account_name\` como argumento.`);
    return lines.join('\n');
  }

  const summary = await bestEffort(whmService.getAccountSummary(username), null);
  const a = summary?.data;
  if (!a) {
    lines.push(`Conta \`${username}\` nao encontrada.`);
    return lines.join('\n');
  }

  lines.push(`## Conta: \`${a.user}\` (${a.domain})`);
  lines.push(`- Uso: **${fmtDiskMB(a.diskused)} / ${fmtDiskMB(a.disklimit)} (${pct(a.diskused, a.disklimit)})**\n`);

  // Top dirs via SSH
  if (sshManager) {
    const duRes = await bestEffort(sshManager._executeCommand(`du -sh /home/${a.user}/* 2>/dev/null | sort -rh | head -15`));
    if (duRes?.output) {
      lines.push(`## Top 15 diretorios no home`);
      lines.push('```');
      lines.push(duRes.output.trim());
      lines.push('```');
    }
    const mailRes = await bestEffort(sshManager._executeCommand(`du -sh /home/${a.user}/mail/* 2>/dev/null | sort -rh | head -10`));
    if (mailRes?.output && mailRes.output.trim()) {
      lines.push(`\n## Top caixas de email`);
      lines.push('```');
      lines.push(mailRes.output.trim());
      lines.push('```');
    }
  } else {
    lines.push(`(SSH indisponivel; sem detalhamento por subdiretorio)`);
  }

  lines.push(`\n## Acoes sugeridas`);
  lines.push(`- Limpar caches: \`/home/${a.user}/.cache\`, \`/home/${a.user}/lscache\``);
  lines.push(`- Auditar backups locais: \`softaculous_backups\`, \`backupbuddy_backups\`, \`wordpress-backups\``);
  lines.push(`- Esvaziar lixeira IMAP em todas as caixas`);
  lines.push(`- Considerar upgrade de plano se uso for legitimo (atual: ${fmtDiskMB(a.disklimit)})`);
  return lines.join('\n');
}

async function generateDomainMigrationChecklist(ctx, args) {
  const domainFrom = args?.domain_from || 'origem.com';
  const domainTo = args?.domain_to || 'destino.com';
  const lines = [];
  lines.push(`# Checklist de Migracao de Dominio`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  lines.push(`## De: \`${domainFrom}\` Para: \`${domainTo}\` (ou mesmo dominio, novo servidor)\n`);
  lines.push(`### Pre-migracao`);
  lines.push(`- [ ] Inventariar dominios, subdominios, addons (search_hosted_domains)`);
  lines.push(`- [ ] Backup completo do cPanel (WHM > Backup > Backup Configuration)`);
  lines.push(`- [ ] Reduzir TTL DNS dos registros A/CNAME para 300s (24-48h antes)`);
  lines.push(`- [ ] Documentar quotas de disco e banda atuais`);
  lines.push(`- [ ] Listar bancos de dados e credenciais\n`);
  lines.push(`### Migracao`);
  lines.push(`- [ ] WHM > Transfer Tool ou backup .tar.gz manual`);
  lines.push(`- [ ] Restaurar conta no servidor destino`);
  lines.push(`- [ ] Verificar permissoes de arquivos e proprietario`);
  lines.push(`- [ ] Importar bancos de dados manualmente se necessario`);
  lines.push(`- [ ] Configurar SSL no destino (AutoSSL ou certificado proprio)\n`);
  lines.push(`### Cutover`);
  lines.push(`- [ ] Atualizar NS no registrador OU registros A/AAAA`);
  lines.push(`- [ ] Aguardar propagacao (24-72h)`);
  lines.push(`- [ ] Testar HTTP, HTTPS, FTP, IMAP, SMTP, Webmail`);
  lines.push(`- [ ] Restaurar TTL para 3600+ apos confirmacao\n`);
  lines.push(`### Pos-migracao`);
  lines.push(`- [ ] Suspender conta no servidor antigo (sem deletar)`);
  lines.push(`- [ ] Monitorar logs por 7 dias`);
  lines.push(`- [ ] Validar entregabilidade de email (SPF/DKIM/DMARC ainda apontando corretamente)`);
  return lines.join('\n');
}

async function generateBackupRestoreGuide(ctx, args) {
  const backupDate = args?.backup_date || 'mais_recente';
  const account = args?.account_name || args?.username || 'NOME_CONTA';
  const lines = [];
  lines.push(`# Guia de Restauracao de Backup`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  lines.push(`## Alvo: conta \`${account}\` | Backup: \`${backupDate}\`\n`);
  lines.push(`### Metodo 1 — WHM Restore Backup UI (recomendado)`);
  lines.push(`1. WHM > Backup > Restore Backups`);
  lines.push(`2. Selecionar conta \`${account}\``);
  lines.push(`3. Escolher data do backup`);
  lines.push(`4. Marcar componentes: Account, Home, Database, Email, SSL`);
  lines.push(`5. Iniciar restore e monitorar log\n`);
  lines.push(`### Metodo 2 — Restaurar de .tar.gz manual`);
  lines.push(`1. Localizar arquivo: \`/backup/cpbackup/daily/${account}.tar.gz\``);
  lines.push(`2. WHM > Backup > Restore a Full Backup/cpmove File`);
  lines.push(`3. Selecionar conta e arquivo`);
  lines.push(`4. Aguardar conclusao\n`);
  lines.push(`### Metodo 3 — Apenas arquivos (sem MX/DNS)`);
  lines.push(`1. Extrair \`homedir.tar.gz\` para \`/home/${account}/\``);
  lines.push(`2. Restaurar permissoes: \`chown -R ${account}:${account} /home/${account}\`\n`);
  lines.push(`### Verificacoes pos-restore`);
  lines.push(`- [ ] Site responde em HTTP/HTTPS`);
  lines.push(`- [ ] Email funciona (IMAP/SMTP)`);
  lines.push(`- [ ] Bancos de dados importados`);
  lines.push(`- [ ] Cron jobs preservados`);
  lines.push(`- [ ] SSL renovado se necessario`);
  return lines.join('\n');
}

// ============================================
// Dispatcher
// ============================================

const REPORT_REGISTRY = {
  whm_account_health_summary: generateAccountHealthSummary,
  whm_resource_usage_trends: generateResourceUsageTrends,
  whm_security_posture: generateSecurityPosture,
  whm_ssl_certificate_inventory: generateSSLInventory,
  whm_backup_coverage: generateBackupCoverage,
  whm_dns_zone_health: generateDnsZoneHealth,
  whm_email_deliverability: generateEmailDeliverability,
  whm_account_quick_lookup: generateAccountQuickLookup,
  whm_dns_troubleshooting: generateDnsTroubleshooting,
  whm_email_setup_guide: generateEmailSetupGuide,
  whm_ssl_installation_guide: generateSslInstallationGuide,
  whm_website_down_investigation: generateWebsiteDownInvestigation,
  whm_disk_usage_alert: generateDiskUsageAlert,
  whm_domain_migration_checklist: generateDomainMigrationChecklist,
  whm_backup_restore_guide: generateBackupRestoreGuide
};

async function generateReport(name, ctx, args = {}) {
  const fn = REPORT_REGISTRY[name];
  if (!fn) throw new Error(`Relatorio desconhecido: ${name}. Nomes validos: ${REPORT_NAMES.join(', ')}`);
  return await fn(ctx, args);
}

module.exports = { REPORT_NAMES, REPORT_REGISTRY, generateReport };
