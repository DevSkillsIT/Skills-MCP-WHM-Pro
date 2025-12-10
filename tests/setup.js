/**
 * Global Test Setup and Teardown
 * Gerencia cleanup de timers, mocks e handles abertos
 * Resolve BUG: "A worker process has failed to exit gracefully"
 */

// Aumentar timeout padrão para testes com delays
jest.setTimeout(15000);

beforeEach(() => {
  // Garantir real timers antes de cada teste
  jest.useRealTimers();

  // Limpar todos os mocks
  jest.clearAllMocks();

  // Restaurar todos os spies antes de cada teste
  jest.restoreAllMocks();

  // Resetar modules mock se necessário
  jest.resetModules();
});

afterEach(async () => {
  // Restaurar todos os spies PRIMEIRO
  jest.restoreAllMocks();

  // Limpar todos os mocks
  jest.clearAllMocks();

  // Limpar timers remanescentes
  jest.clearAllTimers();
  jest.useRealTimers();

  // Aguardar microtask queue e promises pendentes
  await new Promise(resolve => setImmediate(resolve));

  // Dar tempo para cleanup assíncrono
  await new Promise(resolve => setTimeout(resolve, 5));
});
