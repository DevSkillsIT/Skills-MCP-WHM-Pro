/**
 * Zone Resolver — Resolve qual zona DNS um registro pertence.
 *
 * PROBLEMA QUE RESOLVE:
 * No WHM/cPanel, cada dominio hospedado tem uma ZONA DNS independente, mesmo que
 * varios dominios pertencam a mesma conta cPanel. Ex: a conta `clientecom` pode ter
 * tanto `dominio.com.br` quanto `outrodominio.com` como zonas DNS separadas.
 *
 * Para criar um registro `teste.outrodominio.com`, a zona correta e `outrodominio.com`
 * (NAO o dominio principal da conta, NAO o username). LLMs frequentemente confundem
 * esses tres conceitos. Este helper resolve a zona correta a partir do nome do registro.
 *
 * Regra: a zona e o SUFIXO REGISTRAVEL mais longo da lista de zonas existentes que
 * casa com o final do nome do registro.
 */

/**
 * Normaliza um nome de registro/dominio: minusculo, sem trailing dot, sem espacos.
 */
function normalizeDomainName(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\.+$/, '');
}

/**
 * Resolve a zona DNS correta para um registro.
 *
 * @param {string} name - Nome do registro. Pode ser FQDN ("teste.outrodominio.com"),
 *                         FQDN com ponto final ("teste.outrodominio.com."), ou relativo ("teste").
 * @param {string|null} providedZone - Zona informada pelo usuario (opcional).
 * @param {string[]} availableZones - Lista de zonas DNS existentes no servidor.
 * @returns {{ zone: string|null, recordName: string, inferred: boolean, warning: string|null, error: string|null }}
 *   - zone: zona resolvida (ou null se erro)
 *   - recordName: nome do registro normalizado como FQDN com ponto final (formato WHM)
 *   - inferred: true se a zona foi inferida (nao igual a providedZone)
 *   - warning: aviso quando houve correcao/inferencia
 *   - error: mensagem de erro orientativa quando nao foi possivel resolver
 */
function resolveZone(name, providedZone, availableZones) {
  const zones = (availableZones || []).map(normalizeDomainName).filter(Boolean);
  const normName = normalizeDomainName(name);
  const normProvided = normalizeDomainName(providedZone);

  if (!normName) {
    return { zone: normProvided || null, recordName: '', inferred: false, warning: null,
      error: 'Nome do registro (name) e obrigatorio.' };
  }

  // Helper: a zona Z casa com o nome N se N === Z ou N termina em ".Z"
  const matchesZone = (n, z) => n === z || n.endsWith('.' + z);

  // 1. Tentar inferir a zona pelo sufixo mais longo dentre as zonas existentes
  const candidates = zones.filter(z => matchesZone(normName, z));
  // sufixo mais longo = zona mais especifica
  candidates.sort((a, b) => b.length - a.length);
  const inferredZone = candidates[0] || null;

  // 2. Caso o usuario tenha informado uma zona
  if (normProvided) {
    const providedExists = zones.length === 0 || zones.includes(normProvided);

    // 2a. name ja e FQDN que casa com a zona informada -> coerente
    if (matchesZone(normName, normProvided)) {
      return { zone: normProvided, recordName: toFqdn(normName), inferred: false, warning: null, error: null };
    }

    // 2b. name NAO casa com a zona informada, mas casa com outra zona existente -> incoerencia
    if (inferredZone && inferredZone !== normProvided) {
      return {
        zone: inferredZone,
        recordName: toFqdn(normName),
        inferred: true,
        warning: `A zona informada era "${normProvided}", mas o registro "${normName}" pertence a zona "${inferredZone}". ` +
                 `Usando "${inferredZone}" (a zona correta). DNS opera por zona, nao por conta cPanel.`,
        error: null
      };
    }

    // 2c. name parece relativo (sem o sufixo da zona) -> tratar como relativo a zona informada
    //     Ex: name="teste", zone="outrodominio.com" -> registro "teste.outrodominio.com."
    if (providedExists && !normName.includes('.') ) {
      return { zone: normProvided, recordName: toFqdn(`${normName}.${normProvided}`), inferred: false, warning: null, error: null };
    }
    // name relativo multi-label (ex: "api.v2") relativo a zona informada
    if (providedExists && !inferredZone) {
      return { zone: normProvided, recordName: toFqdn(`${normName}.${normProvided}`), inferred: false, warning: null, error: null };
    }

    // 2d. zona informada nao existe e nao da pra inferir
    if (!providedExists && !inferredZone) {
      return {
        zone: null, recordName: toFqdn(normName), inferred: false, warning: null,
        error: `Zona "${normProvided}" nao existe no servidor e nao foi possivel inferir a zona de "${normName}". ` +
               `Zonas disponiveis (amostra): ${zones.slice(0, 8).join(', ')}${zones.length > 8 ? '...' : ''}. ` +
               `Use search_dns_zone_records (searchType=zones) para listar todas.`
      };
    }
  }

  // 3. Nenhuma zona informada -> inferir do name
  if (inferredZone) {
    return {
      zone: inferredZone,
      recordName: toFqdn(normName),
      inferred: true,
      warning: providedZone ? null : `Zona inferida automaticamente: "${inferredZone}" (a partir do registro "${normName}").`,
      error: null
    };
  }

  // 4. Nao foi possivel inferir e nenhuma zona informada
  return {
    zone: null,
    recordName: toFqdn(normName),
    inferred: false,
    warning: null,
    error: `Nao foi possivel determinar a zona DNS para "${normName}". ` +
           `O registro precisa pertencer a uma zona existente. ` +
           `Zonas disponiveis (amostra): ${zones.slice(0, 8).join(', ')}${zones.length > 8 ? '...' : ''}. ` +
           `Informe o parametro "zone" explicitamente ou use um FQDN que termine em uma zona existente.`
  };
}

/**
 * Converte um nome para FQDN com ponto final (formato esperado pelo WHM addzonerecord).
 */
function toFqdn(name) {
  const n = normalizeDomainName(name);
  return n ? `${n}.` : '';
}

module.exports = { resolveZone, normalizeDomainName, toFqdn };
