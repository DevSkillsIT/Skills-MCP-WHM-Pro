/**
 * Regressao: o deadline do servidor era igual ao timeout do cliente (30s), entao
 * o cliente sempre desistia primeiro. A excecao de timeout do httpx tem
 * mensagem VAZIA, e o modelo recebia literalmente {"error": ""} — sem causa e
 * sem instrucao do que fazer.
 */

const {
  withRequestDeadline,
  REQUEST_DEADLINE_MS,
  CLIENT_TIMEOUT_MS,
  DeadlineError,
  TimeoutError
} = require('../../src/lib/timeout');

describe('Deadline de requisicao', () => {
  it('e estritamente menor que o timeout do cliente', () => {
    // Invariante central: o servidor precisa PERDER a corrida de proposito.
    expect(REQUEST_DEADLINE_MS).toBeLessThan(CLIENT_TIMEOUT_MS);
    expect(REQUEST_DEADLINE_MS).toBeGreaterThan(0);
  });

  it('devolve o resultado quando a operacao cabe no prazo', async () => {
    const out = await withRequestDeadline(async () => 'pronto', 'tools/call', 'whm_cpanel_x');
    expect(out).toBe('pronto');
  });

  it('propaga o erro original quando a operacao falha antes do prazo', async () => {
    await expect(
      withRequestDeadline(async () => { throw new Error('falha real'); }, 'tools/call', 'whm_cpanel_x')
    ).rejects.toThrow('falha real');
  });

  it('DeadlineError produz erro JSON-RPC com mensagem NAO vazia', () => {
    const err = new DeadlineError('tools/call', 'whm_cpanel_generate_report', 25000);
    const rpc = err.toJsonRpcError();

    expect(rpc.message).toBeTruthy();
    expect(rpc.message.length).toBeGreaterThan(20);
    expect(rpc.code).toBe(-32000);
  });

  it('diz ao modelo que os parametros estavam corretos', () => {
    // Sem isto, o modelo conclui que errou a sintaxe e fica tentando variacoes.
    const rpc = new DeadlineError('resources/read', 'whm://server/status', 25000).toJsonRpcError();

    expect(rpc.data.parametros_estavam_corretos).toBe(true);
    expect(rpc.message).toMatch(/CORRETA/);
    expect(rpc.data.o_que_nao_adianta).toMatch(/Repetir a mesma chamada/);
    expect(rpc.data.o_que_fazer).toBeTruthy();
  });

  it('dispara DeadlineError quando a operacao passa do prazo', async () => {
    process.env.MCP_REQUEST_DEADLINE_MS = '50';
    jest.resetModules();
    const { withRequestDeadline: comPrazoCurto } = require('../../src/lib/timeout');

    await expect(
      comPrazoCurto(() => new Promise(r => setTimeout(r, 500)), 'tools/call', 'whm_cpanel_lento')
    ).rejects.toMatchObject({ name: 'DeadlineError' });

    delete process.env.MCP_REQUEST_DEADLINE_MS;
    jest.resetModules();
  });
});

describe('Mensagens de TimeoutError sao acionaveis para o modelo', () => {
  it('nao instrui o modelo a repetir a chamada identica', () => {
    const rpc = new TimeoutError('whm_cpanel_search_server_status', 30000).toJsonRpcError();
    expect(rpc.data.suggestion).toMatch(/Repetir a MESMA chamada agora tende a estourar/);
  });

  it('sugere reduzir escopo em operacoes DNS', () => {
    const rpc = new TimeoutError('whm_cpanel_list_dns_zones', 45000).toJsonRpcError();
    expect(rpc.data.suggestion).toMatch(/zona especifica/);
  });
});
