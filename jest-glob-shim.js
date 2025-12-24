// Preload shim so Jest's coverage reporter (CJS) can require a glob implementation.
const path = require('path');
const { createRequire } = require('module');
const requireFromHere = createRequire(__filename);

try {
  const stub = requireFromHere('./__tests__/helpers/glob-default.js');
  const resolved = requireFromHere.resolve('glob');
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: stub,
  };
} catch (error) {
  // If resolution fails, leave as-is; Jest may have a compatible glob already.
}
