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
 * - Em caso de falha parcial, continuar com best-effort e MARCAR a lacuna.
 *
 * LEI DE NAO-MASCARAMENTO:
 * Uma fonte que falhou nunca pode ser renderizada como resultado legitimo.
 * `bestEffort` devolve um fallback vazio para o relatorio nao morrer inteiro,
 * mas toda falha e registrada e vira uma secao "FONTES INDISPONIVEIS" no fim do
 * relatorio. Sem isso, `listAccounts` falhando imprimia "Total: 0 contas" e um
 * modelo fraco afirmava ao cliente que nao havia contas.
 */

const { AsyncLocalStorage } = require('async_hooks');
const { humanizeBytes, formatStartDate, serviceState } = require('./formatters/whm-formatters');

/**
 * Coletor de falhas com escopo POR RELATORIO.
 * AsyncLocalStorage (e nao uma variavel de modulo) porque duas requisicoes
 * concorrentes intercalam await e misturariam as falhas uma da outra.
 */
const failureStore = new AsyncLocalStorage();

/**
 * Registra uma fonte que nao pode ser lida.
 * @param {string} source - Nome tecnico da fonte (ex: listAccounts)
 * @param {Error|string} error - Erro capturado
 */
function recordSourceFailure(source, error) {
  const store = failureStore.getStore();
  if (!store) return;
  const message = error?.message || String(error);
  if (!store.failures.some(f => f.source === source && f.message === message)) {
    store.failures.push({ source, message });
  }
}

/**
 * Renderiza o bloco de fontes indisponiveis. Retorna '' quando tudo foi lido.
 */
function renderSourceFailures() {
  const store = failureStore.getStore();
  const failures = store?.failures || [];
  if (!failures.length) return '';

  const lines = [
    '',
    '---',
    '',
    '## FONTES INDISPONIVEIS — LEIA ANTES DE CONCLUIR',
    '',
    'As fontes abaixo NAO puderam ser lidas nesta execucao:',
    ''
  ];
  failures.forEach(f => lines.push(`- \`${f.source}\`: ${f.message}`));
  lines.push('');
  lines.push('**Numeros e listas que dependem dessas fontes aparecem vazios ou zerados por FALTA DE LEITURA, nao por ausencia real do dado.**');
  lines.push('Nao afirme "nao ha X" nem "esta tudo ok" para essas secoes. Diga ao usuario que a coleta falhou e cite o motivo acima.');
  return lines.join('\n');
}

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

/**
 * Executa a promise tolerando falha, mas REGISTRANDO-A.
 * O fallback existe para o relatorio continuar; a falha nunca some.
 *
 * @param {Promise} promise - Chamada ao WHM/SSH
 * @param {any} fallback - Valor neutro quando falha
 * @param {string} [source] - Rotulo da fonte para o bloco de indisponibilidade
 */
async function bestEffort(promise, fallback = null, source = null) {
  try {
    return await promise;
  } catch (error) {
    recordSourceFailure(source || 'fonte WHM nao identificada', error);
    return fallback;
  }
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

/**
 * Estado dos servicos com fallback em cadeia.
 *
 * Devolve `{ services, available }`. `available: false` significa que NAO houve
 * medicao — e obrigatorio distinguir isso de "medi e nao ha servico parado".
 * Antes esta funcao devolvia `[]` nos dois casos e o relatorio imprimia uma
 * secao de servicos criticos vazia, que se le como "esta tudo rodando".
 */
async function getServiceStatusWithFallback(ctx) {
  const { whmService, sshManager } = ctx;
  try {
    const res = await whmService.getServiceStatus();
    return { services: res?.services || [], available: true };
  } catch (apiError) {
    // O leitor tolerante ja cobre headers malformados; SSH e a ultima rede.
    if (sshManager) {
      try {
        const sshRes = await sshManager._executeCommand('whmapi1 servicestatus --output=json');
        const parsed = JSON.parse(sshRes.output);
        return { services: parsed?.data?.service || [], available: true, via: 'ssh' };
      } catch (sshError) {
        recordSourceFailure('servicestatus', `API: ${apiError.message}; SSH: ${sshError.message}`);
        return { services: [], available: false };
      }
    }
    recordSourceFailure('servicestatus', apiError);
    return { services: [], available: false };
  }
}

/**
 * Renderiza a secao de servicos criticos sem inventar diagnostico quando nao
 * houve leitura.
 */
function renderCriticalServices(statusResult) {
  const CRITICOS = ['httpd', 'mysql', 'mariadb', 'exim', 'named', 'cpsrvd', 'sshd', 'lfd'];
  const lines = ['## Servicos Criticos'];

  if (!statusResult.available) {
    lines.push('**NAO MEDIDO** — a leitura do estado dos servicos falhou (ver "FONTES INDISPONIVEIS" no fim).');
    lines.push('Nao conclua que os servicos estao ativos: nenhum deles foi verificado.');
    return lines;
  }

  const encontrados = CRITICOS
    .map(svc => ({ svc, found: statusResult.services.find(s => (s.name || s.service) === svc) }))
    .filter(x => x.found);

  if (!encontrados.length) {
    lines.push('Nenhum dos servicos criticos monitorados foi reportado pelo WHM nesta leitura.');
    return lines;
  }

  encontrados.forEach(({ svc, found }) => {
    const estado = serviceState(found);
    const sufixo = estado.isRunning === null ? ' (o WHM nao publica estado de execucao para este servico)' : '';
    lines.push(`- ${svc}: ${estado.label}${sufixo}`);
  });
  return lines;
}

/**
 * Executa `fn` sobre `items` com concorrencia limitada, preservando a ordem.
 * Usado para nao serializar N consultas independentes ao WHM (o que estourava
 * o deadline) nem disparar todas de uma vez contra um servidor sob carga.
 *
 * @param {Array} items
 * @param {number} limit - Maximo de chamadas simultaneas
 * @param {Function} fn - async (item, index) => resultado
 * @returns {Promise<Array>} resultados na ordem original
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  };

  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
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

  const acctsRaw = await bestEffort(whmService.listAccounts(), null, 'listAccounts');
  const accountsAvailable = acctsRaw !== null;
  const accounts = acctsRaw?.data?.acct || acctsRaw?.acct || [];
  const filtered = filterSuspended ? accounts.filter(a => a.suspended) : accounts;

  const active = accounts.filter(a => !a.suspended).length;
  const suspended = accounts.filter(a => a.suspended).length;

  const serviceStatus = await getServiceStatusWithFallback(ctx);
  const allServices = serviceStatus.services;
  // Somente servicos MEDIDOS e comprovadamente parados. "Nao monitorado" e
  // "nao instalado" nao sao parada e nao devem virar alerta.
  const stopped = allServices.filter(s => serviceState(s).isRunning === false);
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
  if (!accountsAvailable) {
    // Sem esta guarda, a falha de listAccounts virava "Total: 0" — indistinguivel
    // de um servidor legitimamente vazio.
    lines.push('**NAO MEDIDO** — a listagem de contas falhou (ver "FONTES INDISPONIVEIS" no fim).');
    lines.push('Nao afirme quantidade, nem que nao ha contas acima de quota.\n');
  } else {
    lines.push(`- Total: **${accounts.length}**`);
    lines.push(`- Ativas: **${active}**`);
    lines.push(`- Suspensas: **${suspended}**`);
    lines.push(`- Acima de 90% de quota: **${overQuota.length}**\n`);
  }

  if (overQuota.length) {
    lines.push(`### Contas com quota >= 90%`);
    overQuota.slice(0, 10).forEach(a => {
      lines.push(`- \`${a.user}\` (${a.domain}) — ${fmtDiskMB(a.diskused)} / ${fmtDiskMB(a.disklimit)} (${pct(a.diskused, a.disklimit)})`);
    });
    lines.push('');
  }

  lines.push(...renderCriticalServices(serviceStatus));
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

  const acctsRaw = await bestEffort(whmService.listAccounts(), { data: { acct: [] } }, 'listAccounts');
  const accounts = acctsRaw?.data?.acct || acctsRaw?.acct || [];

  let serverLoad = null;
  if (sshManager) serverLoad = safeUnwrap(await bestEffort(sshManager.getSystemLoad(), null, 'SSH getSystemLoad'));

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
  // O titulo NAO pode anunciar uma janela de N dias: nao existe medicao de N
  // dias. O WHM entrega apenas o retrato atual, e a taxa e derivada da vida
  // inteira da conta. Cabecalho deve nomear a cobertura REAL.
  lines.push(`# Uso de Recursos — Retrato Atual + Projecao de Longo Prazo`);
  lines.push(`_Gerado: ${nowUTC()}_`);
  lines.push(`_Nota: WHM nao armazena historico nativo. Este relatorio e um RETRATO DO MOMENTO. As projecoes usam (uso_atual / dias_desde_criacao) como taxa media da vida inteira da conta — NAO medem crescimento da ultima semana nem de qualquer janela._`);
  if (args?.period_days) {
    // O parametro era aceito e ecoado no titulo sem entrar em nenhum calculo:
    // period_days=7 e period_days=90 produziam corpo byte-a-byte identico.
    lines.push(`\n> **\`period_days=${periodDays}\` NAO altera nenhum numero abaixo.** Nao ha serie historica para recortar; o parametro e aceito por compatibilidade e ignorado. Nao descreva estes dados como "os ultimos ${periodDays} dias".`);
  }
  lines.push('');

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
  lines.push(`- **Nao ha historico observado.** Uma projecao semana-a-semana de verdade exigiria snapshots datados coletados periodicamente (cron + storage local), fora do que o WHM nativo oferece. Sem isso, qualquer "tendencia" aqui e extrapolacao de um unico ponto no tempo.`);
  lines.push(`- Ao reportar ao usuario: diga "uso atual e projecao de longo prazo", nunca "crescimento da semana" ou "tendencia dos ultimos N dias".`);
  return lines.join('\n');
}

async function generateSecurityPosture(ctx, args) {
  const { whmService } = ctx;
  const checkType = args?.check_type || 'all';

  const serviceStatus = await getServiceStatusWithFallback(ctx);
  const findSvc = name => serviceStatus.services.find(s => (s.name || s.service) === name);

  const lines = [];
  lines.push(`# Postura de Seguranca`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);

  lines.push(`## Firewall e Detecção de Intrusao`);
  if (!serviceStatus.available) {
    // Sem medicao, o texto antigo afirmava "Nao instalado" para CADA defesa —
    // um falso negativo de seguranca que um modelo repassaria como diagnostico.
    lines.push('**NAO MEDIDO** — a leitura do estado dos servicos falhou (ver "FONTES INDISPONIVEIS" no fim).');
    lines.push('Nao conclua que CSF/LFD, cPHulk, SSH ou ClamAV estao ausentes ou inativos: nenhum foi verificado.');
  } else {
    const estado = (svc, ausente) => {
      if (!svc) return ausente;
      const st = serviceState(svc);
      return st.isRunning === null ? `${st.label} (estado de execucao nao publicado pelo WHM)` : st.label;
    };
    lines.push(`- CSF/LFD: ${estado(findSvc('lfd'), 'Nao instalado / nao reportado')}`);
    lines.push(`- cPHulk (brute-force protection): ${estado(findSvc('cphulkd'), 'Nao instalado')}`);
    lines.push(`- SSH daemon: ${estado(findSvc('sshd'), 'Nao reportado')}`);
    lines.push(`- ClamAV (antivirus): ${estado(findSvc('clamd'), 'Nao instalado')}`);
  }
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
  if (serviceStatus.available) {
    // Recomendar "instalar CSF/LFD" sem ter medido seria inventar um achado de
    // seguranca: o servico pode estar rodando normalmente.
    const rodando = n => {
      const s = findSvc(n);
      if (!s) return false;
      // Sem medicao nao ha base para recomendar instalar/ativar.
      return serviceState(s).isRunning !== false;
    };
    if (!rodando('lfd')) lines.push(`- **Critico**: ativar/instalar CSF/LFD`);
    if (!rodando('cphulkd')) lines.push(`- **Alta**: ativar cPHulk em "Security Center" > "cPHulk Brute Force Protection"`);
    if (!rodando('clamd')) lines.push(`- **Media**: avaliar instalar ClamAV via WHM > "EasyApache" ou \`yum install clamav\``);
  } else {
    lines.push(`- Sem leitura dos servicos nesta execucao: NAO ha recomendacao sobre CSF/LFD, cPHulk ou ClamAV. Repita o relatorio quando a coleta voltar.`);
  }
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
    const sshRes = await bestEffort(sshManager._executeCommand('whmapi1 --output=json fetch_ssl_vhosts 2>/dev/null'), null, 'fetch_ssl_vhosts (SSH)');
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

  const acctsRaw = await bestEffort(whmService.listAccounts(), { data: { acct: [] } }, 'listAccounts');
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
    const jobsRes = await bestEffort(sshManager._executeCommand('jetbackup5api -F listBackupJobs -O json 2>/dev/null'), null, 'jetbackup5 listBackupJobs');
    if (jobsRes?.output) {
      try { jobsData = JSON.parse(jobsRes.output); } catch (_) { /* ignore */ }
    }
    const backupsRes = await bestEffort(sshManager._executeCommand('jetbackup5api -F listBackupForAccounts -O json -D "type=1" 2>/dev/null'), null, 'jetbackup5 listBackupForAccounts');
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
    const fallbackRes = await bestEffort(sshManager._executeCommand('ls -lah /home/backups_local_jetbackup 2>/dev/null | head -20; echo "==="; ls /backup 2>/dev/null'), null, 'listagem de backups em disco (SSH)');
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

  const zonesRaw = await bestEffort(whmService.listZones(), null, 'listZones');
  const zones = zonesRaw?.data?.zone || zonesRaw?.zone || [];
  const sample = zones.slice(0, 10);

  const lines = [];
  lines.push(`# Saude das Zonas DNS`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  lines.push(`## Resumo`);

  if (zonesRaw === null) {
    // "Total de zonas: 0" para uma listagem que falhou faria um modelo dizer
    // ao cliente que o servidor nao tem zonas DNS.
    lines.push('**NAO MEDIDO** — a listagem de zonas falhou (ver "FONTES INDISPONIVEIS" no fim).');
    lines.push('Nao afirme que nao existem zonas DNS neste servidor.');
    return lines.join('\n');
  }

  lines.push(`- Total de zonas: **${zones.length}**\n`);
  if (sample.length === 0) return lines.join('\n');

  // Antes: 10 chamadas getZone em SERIE. Com o WHM lento isso encostava no
  // deadline e o relatorio inteiro morria por timeout. Concorrencia limitada
  // mantem a latencia baixa sem martelar o servidor.
  const zoneResults = await mapWithConcurrency(sample, 4, async (zone) => {
    const zoneName = zone.domain || zone.zone || zone;
    const zoneData = await bestEffort(whmService.getZone(zoneName), null, `getZone(${zoneName})`);
    return { zoneName, zoneData, failed: zoneData === null };
  });

  lines.push(`## Analise de ${sample.length} zonas (amostra)`);
  for (const { zoneName, zoneData, failed } of zoneResults) {
    if (failed) {
      // Zona ilegivel nao pode virar "sem SPF/DKIM/DMARC".
      lines.push(`- \`${zoneName}\` — **leitura falhou**, checagens nao realizadas`);
      continue;
    }
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

  const zoneData = await bestEffort(whmService.getZone(domain), null, `getZone(${domain})`);
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
  const directSummary = await bestEffort(whmService.getAccountSummary(searchTerm), null, `getAccountSummary(${searchTerm})`);
  if (directSummary?.data?.user || directSummary?.data?.domain) {
    acct = directSummary.data;
  }
  // Fallback: substring search by username/domain/owner via listAccounts
  if (!acct) {
    const all = await bestEffort(whmService.listAccounts(), { data: { acct: [] } }, 'listAccounts');
    const accounts = all?.data?.acct || all?.acct || [];
    const re = new RegExp(searchTerm, 'i');
    acct = accounts.find(a => re.test(a.user || '') || re.test(a.domain || '') || re.test(a.owner || ''));
  }

  if (!acct) {
    lines.push(`Nenhuma conta encontrada para \`${searchTerm}\`.`);
    lines.push(`Use \`whm_cpanel_search_hosting_accounts\` (searchType=list) para inventario completo.`);
    return lines.join('\n');
  }

  const domains = await bestEffort(whmService.listDomains(acct.user, 100, 0), { data: [] }, `listDomains(${acct.user})`);
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

  const auth = await bestEffort(whmService.hasLocalAuthority(domain), null, `hasLocalAuthority(${domain})`);
  const authData = auth?.data || auth;
  const isLocal = authData?.is_authoritative ?? authData?.authoritative ?? (authData?.type === 'local' || authData?.type === 'master');

  lines.push(`## Dominio: \`${domain}\``);
  lines.push(`- Autoritativo neste servidor: ${isLocal ? '**Sim**' : '**Nao**'}`);
  if (!isLocal) {
    lines.push(`\n_Como o servidor nao e autoritativo, mudancas locais nao afetam a propagacao. Verifique o registrador._`);
    return lines.join('\n');
  }

  const zoneData = await bestEffort(whmService.getZone(domain), null, `getZone(${domain})`);
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
  const informado = Boolean(args?.domain || args?.email_address);
  const domain = args?.domain || args?.email_address?.split('@')?.[1] || 'seudominio.com.br';
  const email = args?.email_address || `usuario@${domain}`;
  const lines = [];
  lines.push(`# Guia de Configuracao de Email`);
  lines.push(`_Gerado: ${nowUTC()}_\n`);
  if (!informado) {
    lines.push(`> **MODELO GENERICO** — nenhum dominio foi informado, entao \`${domain}\` e um exemplo, NAO o dominio do cliente.`);
    lines.push(`> Nao apresente estes valores como a configuracao real. Chame de novo com \`arguments: { "domain": "<dominio real>" }\`.\n`);
  }
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
  if (!args?.domain) {
    lines.push(`> **MODELO GENERICO** — \`${domain}\` e exemplo, NAO o dominio do cliente. Chame com \`arguments: { "domain": "<dominio real>" }\` para personalizar.\n`);
  }
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
  const auth = await bestEffort(whmService.hasLocalAuthority(domain), null, `hasLocalAuthority(${domain})`);
  const authData = auth?.data || auth;
  const isLocal = authData?.is_authoritative ?? authData?.authoritative ?? (authData?.type === 'local' || authData?.type === 'master');
  lines.push(`### 1. DNS`);
  lines.push(`- Autoritativo aqui: ${isLocal ? 'Sim' : 'Nao'}`);
  if (isLocal) {
    const zone = await bestEffort(whmService.getZone(domain), null, `getZone(${domain})`);
    const records = extractZoneRecords(zone);
    const aRec = tryFindRecord(records, 'A', new RegExp(`^${domain.replace(/\./g, '\\.')}\\.$`));
    lines.push(`- Registro A apex: ${aRec ? (aRec.address || aRec.data) : '**AUSENTE**'}`);
  }

  // 2. Owner
  const owner = await bestEffort(whmService.getDomainOwner(domain), null, `getDomainOwner(${domain})`);
  const ownerData = owner?.data || owner;
  const username = ownerData?.user || ownerData?.owner;
  lines.push(`\n### 2. Proprietario`);
  lines.push(`- Username cPanel: ${username || 'desconhecido'}`);
  if (username) {
    const acct = await bestEffort(whmService.getAccountSummary(username), null, `getAccountSummary(${username})`);
    const a = acct?.data;
    if (a) lines.push(`- Status conta: ${a.suspended ? `**Suspensa** (${a.suspendreason || 'sem motivo'})` : 'Ativa'}`);
  }

  // 3. Servicos
  const serviceStatus = await getServiceStatusWithFallback(ctx);
  lines.push(`\n### 3. Servicos do servidor`);
  if (!serviceStatus.available) {
    // Investigacao de site fora do ar: dizer "desconhecido" para tudo sem
    // explicar levava a descartar a hipotese mais provavel (servico parado).
    lines.push('**NAO MEDIDO** — a leitura dos servicos falhou (ver "FONTES INDISPONIVEIS" no fim).');
    lines.push('Servico parado continua sendo hipotese ABERTA para este site fora do ar — verifique manualmente antes de descartar.');
  } else {
    const find = n => serviceStatus.services.find(s => (s.name || s.service) === n);
    const estado = svc => svc ? serviceState(svc).label : 'nao reportado pelo WHM';
    lines.push(`- Apache (httpd): ${estado(find('httpd'))}`);
    lines.push(`- apache_php_fpm: ${estado(find('apache_php_fpm'))}`);
    lines.push(`- MySQL/MariaDB: ${estado(find('mysql'))}`);
  }

  // 4. Carga
  if (sshManager) {
    const load = safeUnwrap(await bestEffort(sshManager.getSystemLoad(), null, 'SSH getSystemLoad'));
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

  const summary = await bestEffort(whmService.getAccountSummary(username), null, `getAccountSummary(${username})`);
  const a = summary?.data;
  if (!a) {
    lines.push(`Conta \`${username}\` nao encontrada.`);
    return lines.join('\n');
  }

  lines.push(`## Conta: \`${a.user}\` (${a.domain})`);
  lines.push(`- Uso: **${fmtDiskMB(a.diskused)} / ${fmtDiskMB(a.disklimit)} (${pct(a.diskused, a.disklimit)})**\n`);

  // Top dirs via SSH
  if (sshManager) {
    const duRes = await bestEffort(sshManager._executeCommand(`du -sh /home/${a.user}/* 2>/dev/null | sort -rh | head -15`), null, `du /home/${a.user} (SSH)`);
    if (duRes?.output) {
      lines.push(`## Top 15 diretorios no home`);
      lines.push('```');
      lines.push(duRes.output.trim());
      lines.push('```');
    }
    const mailRes = await bestEffort(sshManager._executeCommand(`du -sh /home/${a.user}/mail/* 2>/dev/null | sort -rh | head -10`), null, `du /home/${a.user}/mail (SSH)`);
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
  if (!args?.domain_from && !args?.domain_to) {
    lines.push(`> **MODELO GENERICO** — \`${domainFrom}\`/\`${domainTo}\` sao exemplos, NAO dominios do cliente. Passe \`domain_from\` e \`domain_to\` para personalizar.\n`);
  }
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
  if (!args?.account_name && !args?.username) {
    lines.push(`> **MODELO GENERICO** — \`${account}\` e um marcador, NAO uma conta existente. Passe \`account_name\` para personalizar o guia.\n`);
  }
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

  // Escopo de coleta de falhas por execucao: qualquer bestEffort/fallback que
  // falhar dentro daqui e anexado ao fim do Markdown. Centralizado para que os
  // 15 relatorios sejam cobertos sem depender de cada autor lembrar.
  return await failureStore.run({ failures: [] }, async () => {
    const markdown = await fn(ctx, args);
    return markdown + renderSourceFailures();
  });
}

module.exports = {
  REPORT_NAMES,
  REPORT_REGISTRY,
  generateReport,
  // Exportados para teste
  bestEffort,
  mapWithConcurrency,
  renderSourceFailures,
  recordSourceFailure,
  failureStore
};
