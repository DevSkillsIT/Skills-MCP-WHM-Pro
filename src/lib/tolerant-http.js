/**
 * Leitor HTTP tolerante a headers malformados (fallback do parser do Node).
 *
 * MOTIVO: o WHM/cPanel injeta linhas de log do monitor de servicos DENTRO do
 * bloco de headers da resposta. Exemplo real capturado em producao no endpoint
 * /json-api/servicestatus:
 *
 *   HTTP/1.1 200 OK
 *   Content-Type: application/json; charset="utf-8"
 *   Apache PHP-FPM 83(php-fpm: master process (...)) is running as root with PID "2462708"
 *   Content-Length: 4062
 *
 * A terceira linha nao e um header valido (sem token de nome, com espacos e
 * aspas tipograficas). O llhttp do Node rejeita a resposta inteira com
 * HPE_INVALID_HEADER_TOKEN e o corpo — JSON perfeitamente valido — e descartado.
 * `insecureHTTPParser: true` NAO resolve: foi testado nas quatro combinacoes
 * (axios/https.request x true/false) contra o servidor real e falha em todas.
 *
 * Este modulo abre o socket TLS, escreve a requisicao e le a resposta sem passar
 * pelo parser HTTP: linhas de header invalidas sao DESCARTADAS e o corpo e
 * devolvido intacto.
 *
 * @MX:WARN: Ignora conscientemente o parser HTTP do Node.
 * @MX:REASON: Usado APENAS como fallback apos HPE_*, contra host WHM confiavel
 * sobre TLS, e descartando linhas invalidas em vez de interpreta-las. Nao deve
 * ser promovido a caminho primario.
 */

const tls = require('tls');
const logger = require('./logger');

// RFC 7230 token: caracteres validos em nome de header
const VALID_HEADER_LINE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+:/;

/**
 * Executa requisicao HTTPS tolerando headers malformados.
 *
 * @param {object} options
 * @param {string} options.host - Hostname do WHM
 * @param {number} options.port - Porta (2087)
 * @param {string} options.path - Path completo com query string
 * @param {string} options.method - GET ou POST
 * @param {object} options.headers - Headers da requisicao (inclui Authorization)
 * @param {string} [options.body] - Corpo para POST
 * @param {boolean} [options.rejectUnauthorized=true] - Validacao TLS
 * @param {number} [options.timeout=15000] - Timeout em ms
 * @returns {Promise<{status:number, headers:object, body:string, droppedHeaderLines:number}>}
 */
function tolerantRequest(options) {
  const {
    host,
    port,
    path,
    method = 'GET',
    headers = {},
    body = null,
    rejectUnauthorized = true,
    timeout = 15000
  } = options;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) { /* socket ja fechado */ }
      fn(arg);
    };

    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized }, () => {
      const lines = [`${method} ${path} HTTP/1.1`, `Host: ${host}:${port}`];
      for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
      if (body) lines.push(`Content-Length: ${Buffer.byteLength(body)}`);
      // Connection: close permite ler ate o fim do socket sem depender de
      // Content-Length (que o WHM as vezes reporta com o valor errado).
      lines.push('Connection: close');
      socket.write(lines.join('\r\n') + '\r\n\r\n' + (body || ''));
    });

    const chunks = [];
    socket.on('data', (c) => chunks.push(c));

    socket.on('end', () => {
      const raw = Buffer.concat(chunks);
      const sep = raw.indexOf('\r\n\r\n');

      if (sep < 0) {
        return finish(reject, new Error('Resposta HTTP sem separador de headers (corpo incompleto)'));
      }

      const headerBlock = raw.subarray(0, sep).toString('latin1');
      const responseBody = raw.subarray(sep + 4).toString('utf8');
      const headerLines = headerBlock.split('\r\n');

      const statusMatch = /^HTTP\/1\.[01] (\d{3})/.exec(headerLines[0] || '');
      if (!statusMatch) {
        return finish(reject, new Error('Status line HTTP invalida na resposta do WHM'));
      }
      const status = Number(statusMatch[1]);

      const parsedHeaders = {};
      let droppedHeaderLines = 0;
      for (let i = 1; i < headerLines.length; i++) {
        const line = headerLines[i];
        if (!line) continue;
        if (!VALID_HEADER_LINE.test(line)) {
          // Linha de log vazada pelo WHM — descartar, nunca interpretar.
          droppedHeaderLines++;
          continue;
        }
        const idx = line.indexOf(':');
        parsedHeaders[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
      }

      finish(resolve, { status, headers: parsedHeaders, body: responseBody, droppedHeaderLines });
    });

    socket.on('error', (err) => finish(reject, err));
    socket.setTimeout(timeout, () => {
      finish(reject, Object.assign(new Error(`Leitura tolerante excedeu ${timeout}ms`), { code: 'ETIMEDOUT' }));
    });
  });
}

/**
 * Identifica erro de parser HTTP (headers malformados vindos do servidor).
 * @param {Error} error
 * @returns {boolean}
 */
function isMalformedHeaderError(error) {
  if (!error) return false;
  if (typeof error.code === 'string' && error.code.startsWith('HPE_')) return true;
  return /Parse Error/i.test(error.message || '');
}

/**
 * Extrai o objeto JSON do corpo, tolerando lixo antes/depois.
 * @param {string} bodyText
 * @returns {object}
 */
function parseJsonBody(bodyText) {
  const text = String(bodyText || '');
  try {
    return JSON.parse(text);
  } catch (_) {
    // O WHM pode anexar linhas soltas antes/depois do JSON.
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error('Resposta do WHM nao contem JSON valido');
  }
}

/**
 * GET tolerante que devolve o JSON ja parseado, no mesmo formato que o axios
 * entrega em `response.data`.
 *
 * @returns {Promise<object>} corpo JSON parseado
 */
async function tolerantGetJson(options) {
  const res = await tolerantRequest({ ...options, method: 'GET' });

  if (res.droppedHeaderLines > 0) {
    logger.warn('Resposta do WHM continha headers malformados — recuperada via leitor tolerante', {
      path: String(options.path || '').split('?')[0],
      droppedHeaderLines: res.droppedHeaderLines,
      status: res.status
    });
  }

  if (res.status >= 400) {
    throw Object.assign(new Error(`WHM respondeu HTTP ${res.status}`), {
      response: { status: res.status, headers: res.headers }
    });
  }

  return parseJsonBody(res.body);
}

module.exports = {
  tolerantRequest,
  tolerantGetJson,
  isMalformedHeaderError,
  parseJsonBody
};
