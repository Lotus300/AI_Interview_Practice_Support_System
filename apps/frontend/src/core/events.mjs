export function hasClickCommand(target, handlers) {
  return Boolean(target?.dataset?.screen || handlers[target?.dataset?.action]);
}

export function createCommandGate() {
  const inFlight = new Set();
  return async function runOnce(key, command) {
    if (!key || inFlight.has(key)) return;
    inFlight.add(key);
    try {
      return await command();
    } finally {
      inFlight.delete(key);
    }
  };
}
