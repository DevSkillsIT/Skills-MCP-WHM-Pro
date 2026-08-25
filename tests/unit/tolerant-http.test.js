/**
 * Regressao: o WHM injeta uma linha de log do monitor de servicos DENTRO do
 * bloco de headers HTTP. O llhttp do Node rejeita a resposta inteira com
 * HPE_INVALID_HEADER_TOKEN e descarta um corpo JSON perfeitamente valido.
 * `insecureHTTPParser: true` NAO resolve (verificado contra o servidor real).
 */

const tls = require('tls');
const fs = require('fs');
const {
  tolerantRequest,
  tolerantGetJson,
  isMalformedHeaderError,
  parseJsonBody
} = require('../../src/lib/tolerant-http');

// Linha real capturada em producao (hosting WHM, 2026-08-25)
const LINHA_MALFORMADA =
  'Apache PHP-FPM 83(php-fpm: master process (/opt/cpanel/ea-php83/root/etc/php-fpm.conf)) is running as root with PID “2462708” (process table check method)';

const CORPO = JSON.stringify({
  metadata: { result: 1, reason: 'OK', command: 'servicestatus' },
  data: { service: [{ name: 'httpd', running: 1 }, { name: 'nginx', running: 0 }] }
});

describe('isMalformedHeaderError', () => {
  it('reconhece pelo code HPE_*', () => {
    const e = new Error('Parse Error: Invalid header token');
    e.code = 'HPE_INVALID_HEADER_TOKEN';
    expect(isMalformedHeaderError(e)).toBe(true);
  });

  it('reconhece pela mensagem quando o code nao vem', () => {
    expect(isMalformedHeaderError(new Error('Parse Error: qualquer coisa'))).toBe(true);
  });

  it('nao confunde com erro comum', () => {
    const e = new Error('socket hang up');
    e.code = 'ECONNRESET';
    expect(isMalformedHeaderError(e)).toBe(false);
    expect(isMalformedHeaderError(null)).toBe(false);
  });
});

describe('parseJsonBody', () => {
  it('parseia JSON limpo', () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ a: 1 });
  });

  it('tolera lixo antes e depois do JSON', () => {
    expect(parseJsonBody('sujeira\n{"a":1}\nmais sujeira')).toEqual({ a: 1 });
  });

  it('falha explicitamente quando nao ha JSON', () => {
    expect(() => parseJsonBody('nada aqui')).toThrow(/nao contem JSON valido/);
  });
});

describe('tolerantRequest contra servidor com headers malformados', () => {
  let server;
  let porta;
  const conexoes = new Set();

  beforeAll((done) => {
    // Usa um par fixo gerado via openssl no setup do teste
    const { execSync } = require('child_process');
    const tmp = fs.mkdtempSync('/tmp/whm-tls-test-');
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout ${tmp}/key.pem -out ${tmp}/cert.pem ` +
      `-days 1 -nodes -subj "/CN=localhost" 2>/dev/null`
    );

    server = tls.createServer(
      { key: fs.readFileSync(`${tmp}/key.pem`), cert: fs.readFileSync(`${tmp}/cert.pem`) },
      (socket) => {
        conexoes.add(socket);
        socket.on('close', () => conexoes.delete(socket));
        socket.on('error', () => { /* cliente pode fechar abruptamente */ });
        socket.on('data', () => {
          // Resposta com a MESMA anomalia observada em producao
          const resposta =
            'HTTP/1.1 200 OK\r\n' +
            'Content-Type: application/json; charset="utf-8"\r\n' +
            LINHA_MALFORMADA + '\r\n' +
            'X-Frame-Options: SAMEORIGIN\r\n' +
            `Content-Length: ${Buffer.byteLength(CORPO)}\r\n` +
            '\r\n' + CORPO;
          socket.end(resposta);
        });
      }
    );

    server.listen(0, '127.0.0.1', () => {
      porta = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    // Destruir conexoes pendentes antes do close: o teste que prova a falha do
    // parser padrao deixa o socket meio-aberto e travaria o teardown.
    for (const s of conexoes) s.destroy();
    conexoes.clear();
    server.close(() => done());
  });

  it('recupera o corpo que o parser do Node descartaria', async () => {
    const res = await tolerantRequest({
      host: '127.0.0.1',
      port: porta,
      path: '/json-api/servicestatus?api.version=1',
      headers: { Authorization: 'whm root:TOKEN' },
      rejectUnauthorized: false,
      timeout: 5000
    });

    expect(res.status).toBe(200);
    expect(res.droppedHeaderLines).toBe(1);
    expect(JSON.parse(res.body).data.service).toHaveLength(2);
  });

  it('descarta a linha invalida sem interpreta-la como header', async () => {
    const res = await tolerantRequest({
      host: '127.0.0.1', port: porta, path: '/x', headers: {}, rejectUnauthorized: false, timeout: 5000
    });

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    // A linha de log nao virou chave de header
    const chaves = Object.keys(res.headers).join(' ');
    expect(chaves).not.toContain('apache php-fpm');
  });

  it('tolerantGetJson devolve o JSON pronto', async () => {
    const json = await tolerantGetJson({
      host: '127.0.0.1', port: porta, path: '/json-api/servicestatus', headers: {}, rejectUnauthorized: false, timeout: 5000
    });

    expect(json.metadata.result).toBe(1);
    expect(json.data.service[1]).toEqual({ name: 'nginx', running: 0 });
  });

  it('prova que o parser padrao do Node falha na MESMA resposta', async () => {
    const https = require('https');
    const erro = await new Promise((resolve) => {
      const req = https.request(
        {
          host: '127.0.0.1', port: porta, path: '/x', rejectUnauthorized: false,
          insecureHTTPParser: true  // nem assim passa
        },
        (res) => { res.resume(); resolve(null); }
      );
      req.on('error', resolve);
      req.end();
    });

    expect(erro).not.toBeNull();
    expect(isMalformedHeaderError(erro)).toBe(true);
  });
});
