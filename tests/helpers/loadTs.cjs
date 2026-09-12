// Loads a TypeScript source file (and its relative imports) straight from
// `src`, so a test can exercise a hook without building the library first.
// Bare imports (react, markdown-to-jsx…) resolve through node as usual.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');

const cache = new Map();
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js'];

function resolveRelative(from, request) {
  const base = path.resolve(path.dirname(from), request);
  for (const extension of ['', ...EXTENSIONS]) {
    const candidate = base + extension;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`loadTs: cannot resolve ${request} from ${from}`);
}

function loadTs(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = new Module(filename, null);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, module);
  if (filename.endsWith('.css')) return module.exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const localRequire = (request) =>
    request.startsWith('.') ? loadTs(resolveRelative(filename, request)) : require(request);
  const compiled = vm.runInThisContext(Module.wrap(outputText), { filename });
  compiled.call(module.exports, module.exports, localRequire, module, filename, path.dirname(filename));
  module.loaded = true;
  return module.exports;
}

module.exports = { loadTs };
