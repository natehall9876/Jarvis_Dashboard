import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

/** Exercise real server modules while replacing external boundaries only. */
export function loadServerModule<T>(file: string, mocks: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch): T {
  const cache = new Map<string, { exports: unknown }>();
  function load(filename: string): unknown {
    const absolute = path.resolve(filename);
    if (cache.has(absolute)) return cache.get(absolute)!.exports;
    const loadedModule = { exports: {} };
    cache.set(absolute, loadedModule);
    const nativeRequire = createRequire(absolute);
    const resolve = (id: string): unknown => {
      if (id in mocks) return mocks[id];
      if (id.startsWith("@/") || id.startsWith(".")) {
        const target = id.startsWith("@/") ? path.resolve("src", id.slice(2)) : path.resolve(path.dirname(absolute), id);
        for (const candidate of [target, target + ".ts", target + ".tsx"]) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
        }
      }
      return nativeRequire(id);
    };
    const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      fileName: absolute,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", "fetch", code)(resolve, loadedModule, loadedModule.exports, fetchImpl);
    return loadedModule.exports;
  }
  return load(file) as T;
}
