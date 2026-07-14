export function hasClickCommand(target, handlers) {
  return Boolean(target?.dataset?.screen || handlers[target?.dataset?.action]);
}
