/**
 * Test Cleanup Helpers
 * Utilities para limpeza segura de timers e promises
 */

/**
 * Aguarda todas as operações assíncronas pendentes
 * Usa microtask queue para garantir que todas as promises sejam processadas
 */
async function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Cleanup completo de timers e promises
 * DEVE ser chamado ao final de cada teste que usa fake timers
 */
async function cleanupTest() {
  // Limpar e restaurar timers reais
  jest.clearAllTimers();
  jest.useRealTimers();

  // Flush de promises pendentes
  await flushPromises();

  // Delay curto para permitir cleanup final
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Aguarda conclusão de promise com timeout de segurança
 */
async function waitForPromiseWithTimeout(promise, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Promise timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Cria uma promise que resolve após delay, mas que pode ser cancelada
 */
function createCancelableDelay(ms) {
  let timeoutId;
  let rejectFn;

  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    timeoutId = setTimeout(resolve, ms);
  });

  return {
    promise,
    cancel: () => {
      clearTimeout(timeoutId);
      rejectFn(new Error('Delay cancelled'));
    }
  };
}

module.exports = {
  flushPromises,
  cleanupTest,
  waitForPromiseWithTimeout,
  createCancelableDelay
};
