/**
 * Regressao: falha de fonte NUNCA pode ser renderizada como resultado legitimo.
 *
 * Origem: em 2026-08-25 o endpoint /servicestatus caiu (headers malformados do
 * WHM) e os relatorios imprimiam a secao de servicos criticos VAZIA — que se le
 * como "nenhum servico parado". Havia 8 servicos parados no servidor.
 */

const {
  generateReport,
  bestEffort,
  renderSourceFailures,
  failureStore,
  mapWithConcurrency
} = require('../../src/lib/reports');

describe('Lei de nao-mascaramento nos relatorios', () => {
  describe('bestEffort', () => {
    it('registra a falha em vez de engoli-la', async () => {
      await failureStore.run({ failures: [] }, async () => {
        const valor = await bestEffort(Promise.reject(new Error('boom')), { data: [] }, 'listAccounts');

        expect(valor).toEqual({ data: [] });
        const bloco = renderSourceFailures();
        expect(bloco).toContain('FONTES INDISPONIVEIS');
        expect(bloco).toContain('listAccounts');
        expect(bloco).toContain('boom');
      });
    });

    it('nao produz bloco algum quando tudo foi lido', async () => {
      await failureStore.run({ failures: [] }, async () => {
        await bestEffort(Promise.resolve({ ok: true }), null, 'listAccounts');
        expect(renderSourceFailures()).toBe('');
      });
    });

    it('nao duplica a mesma falha repetida', async () => {
      await failureStore.run({ failures: [] }, async () => {
        await bestEffort(Promise.reject(new Error('x')), null, 'getZone');
        await bestEffort(Promise.reject(new Error('x')), null, 'getZone');
        expect(renderSourceFailures().match(/getZone/g)).toHaveLength(1);
      });
    });

    it('isola falhas entre execucoes concorrentes', async () => {
      const a = failureStore.run({ failures: [] }, async () => {
        await bestEffort(Promise.reject(new Error('falha-A')), null, 'fonteA');
        await new Promise(r => setTimeout(r, 10));
        return renderSourceFailures();
      });
      const b = failureStore.run({ failures: [] }, async () => {
        await bestEffort(Promise.reject(new Error('falha-B')), null, 'fonteB');
        return renderSourceFailures();
      });

      const [blocoA, blocoB] = await Promise.all([a, b]);
      expect(blocoA).toContain('falha-A');
      expect(blocoA).not.toContain('falha-B');
      expect(blocoB).toContain('falha-B');
      expect(blocoB).not.toContain('falha-A');
    });
  });

  describe('whm_account_health_summary', () => {
    const ctxComFalha = {
      whmService: {
        listAccounts: () => Promise.reject(new Error('WHM fora do ar')),
        getServiceStatus: () => Promise.reject(new Error('Parse Error: Invalid header token'))
      },
      sshManager: null
    };

    it('nao afirma "0 contas" quando a listagem falhou', async () => {
      const md = await generateReport('whm_account_health_summary', ctxComFalha, {});

      expect(md).toContain('NAO MEDIDO');
      expect(md).not.toMatch(/Total:\s*\*\*0\*\*/);
      expect(md).toContain('FONTES INDISPONIVEIS');
      expect(md).toContain('listAccounts');
    });

    it('nao deixa a secao de servicos criticos vazia (leitura como "tudo ok")', async () => {
      const md = await generateReport('whm_account_health_summary', ctxComFalha, {});

      const secao = md.split('## Servicos Criticos')[1] || '';
      expect(secao).toContain('NAO MEDIDO');
      expect(secao).toContain('Nao conclua');
    });

    it('mostra os dados normalmente quando as fontes respondem', async () => {
      const ctxOk = {
        whmService: {
          listAccounts: () => Promise.resolve({ data: { acct: [
            { user: 'cliente1', domain: 'a.com', suspended: 0, diskused: '100M', disklimit: '1000M' }
          ] } }),
          getServiceStatus: () => Promise.resolve({ services: [
            { name: 'httpd', running: 1 },
            { name: 'exim', running: 0 }
          ] })
        },
        sshManager: null
      };

      const md = await generateReport('whm_account_health_summary', ctxOk, {});
      expect(md).toContain('Total: **1**');
      expect(md).toContain('- httpd: Ativo');
      expect(md).toContain('- exim: **Parado**');
      expect(md).not.toContain('FONTES INDISPONIVEIS');
    });
  });

  describe('whm_security_posture', () => {
    it('nao afirma "Nao instalado" para defesas que nao foram medidas', async () => {
      const ctx = {
        whmService: { getServiceStatus: () => Promise.reject(new Error('Parse Error')) },
        sshManager: null
      };

      const md = await generateReport('whm_security_posture', ctx, {});
      expect(md).toContain('NAO MEDIDO');
      expect(md).not.toContain('ClamAV (antivirus): Nao instalado');
      expect(md).not.toContain('cPHulk (brute-force protection): Nao instalado');
    });
  });

  describe('whm_dns_zone_health', () => {
    it('nao afirma "Total de zonas: 0" quando listZones falhou', async () => {
      const ctx = {
        whmService: { listZones: () => Promise.reject(new Error('sem resposta')) },
        sshManager: null
      };

      const md = await generateReport('whm_dns_zone_health', ctx, {});
      expect(md).toContain('NAO MEDIDO');
      expect(md).not.toMatch(/Total de zonas:\s*\*\*0\*\*/);
      expect(md).toContain('listZones');
    });

    it('marca a zona ilegivel em vez de reporta-la sem SPF/DKIM/DMARC', async () => {
      const ctx = {
        whmService: {
          listZones: () => Promise.resolve({ data: { zone: [{ domain: 'quebrada.com' }] } }),
          getZone: () => Promise.reject(new Error('zona ilegivel'))
        },
        sshManager: null
      };

      const md = await generateReport('whm_dns_zone_health', ctx, {});
      expect(md).toContain('leitura falhou');
      expect(md).not.toContain('*SPF*');
    });
  });

  describe('estado de servico: enabled NAO e running', () => {
    // Regressao: o formatador fazia `running || enabled`, entao cpgreylistd e
    // tailwatchd (enabled=1, sem `running`) apareciam como "Ativo" sem terem
    // sido medidos — e nginx/postgresql (installed=0) apareciam como "Parado".
    const { serviceState } = require('../../src/lib/formatters/whm-formatters');

    it('nao chama de Ativo um servico apenas habilitado', () => {
      const st = serviceState({ name: 'cpgreylistd', enabled: 1, installed: 1, monitored: 0 });
      expect(st.isRunning).toBeNull();
      expect(st.label).not.toBe('Ativo');
    });

    it('nao chama de Parado um servico que nem esta instalado', () => {
      const st = serviceState({ name: 'nginx', enabled: 0, installed: 0, monitored: 0 });
      expect(st.isRunning).toBeNull();
      expect(st.label).toBe('Nao instalado');
    });

    it('reporta parado apenas com medicao explicita', () => {
      expect(serviceState({ name: 'mailman', running: 0, enabled: 1, installed: 1, monitored: 1 }).isRunning).toBe(false);
      expect(serviceState({ name: 'httpd', running: 1, monitored: 1 }).isRunning).toBe(true);
    });

    it('nao conta servico nao medido como parada no health summary', async () => {
      const ctx = {
        whmService: {
          listAccounts: () => Promise.resolve({ data: { acct: [] } }),
          getServiceStatus: () => Promise.resolve({ services: [
            { name: 'httpd', running: 1, monitored: 1 },
            { name: 'cpgreylistd', enabled: 1, installed: 1, monitored: 0 },
            { name: 'nginx', enabled: 0, installed: 0, monitored: 0 }
          ] })
        },
        sshManager: null
      };

      const md = await generateReport('whm_account_health_summary', ctx, {});
      expect(md).not.toContain('servicos criticos parados');
      expect(md).toContain('- httpd: Ativo');
    });
  });

  describe('whm_resource_usage_trends: cabecalho nao pode prometer janela inexistente', () => {
    // Regressao: o titulo dizia "(janela: N dias)" e period_days era ecoado sem
    // entrar em calculo algum — period_days=7 e =90 davam corpo identico. Um
    // modelo fraco descrevia isso como "crescimento dos ultimos N dias".
    const ctx = {
      whmService: {
        listAccounts: () => Promise.resolve({ data: { acct: [
          { user: 'c1', domain: 'a.com', diskused: '100M', disklimit: '1000M', startdate_epoch: 1600000000 }
        ] } })
      },
      sshManager: null
    };

    it('nao anuncia janela de N dias no titulo', async () => {
      const md = await generateReport('whm_resource_usage_trends', ctx, { period_days: 7 });
      expect(md.split('\n')[0]).not.toMatch(/janela:\s*\d+\s*dias/);
      expect(md).toMatch(/RETRATO DO MOMENTO/);
    });

    it('avisa explicitamente que period_days nao altera os numeros', async () => {
      const md = await generateReport('whm_resource_usage_trends', ctx, { period_days: 90 });
      expect(md).toContain('NAO altera nenhum numero');
    });

    it('produz o mesmo corpo para qualquer period_days (prova de inercia)', async () => {
      const norm = t => t.split('\n').filter(l => !/Gerado:|period_days=/.test(l)).join('\n');
      const a = await generateReport('whm_resource_usage_trends', ctx, { period_days: 7 });
      const b = await generateReport('whm_resource_usage_trends', ctx, { period_days: 90 });
      expect(norm(a)).toBe(norm(b));
    });
  });

  describe('mapWithConcurrency', () => {
    it('preserva a ordem dos resultados', async () => {
      const itens = [5, 1, 4, 2, 3];
      const out = await mapWithConcurrency(itens, 2, async (n) => {
        await new Promise(r => setTimeout(r, n * 5));
        return n * 10;
      });
      expect(out).toEqual([50, 10, 40, 20, 30]);
    });

    it('respeita o limite de concorrencia', async () => {
      let ativos = 0;
      let pico = 0;
      await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
        ativos++;
        pico = Math.max(pico, ativos);
        await new Promise(r => setTimeout(r, 5));
        ativos--;
      });
      expect(pico).toBeLessThanOrEqual(3);
    });

    it('lida com lista vazia', async () => {
      expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    });
  });
});
