import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { isBinaryBuffer } from './utils/fs.js';

const INDEX_VERSION = 2;

const resolveIndexPath = (root) => {
  if (process.env.DEVCTX_INDEX_DIR) {
    return path.join(process.env.DEVCTX_INDEX_DIR, 'index.json');
  }
  return path.join(root, '.devctx', 'index.json');
};

const indexableExtensions = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java',
]);

const ignoredDirs = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.venv', 'venv', '__pycache__', '.terraform', '.devctx',
]);

const scriptKindByExtension = {
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
};

// ---------------------------------------------------------------------------
// JS/TS extraction
// ---------------------------------------------------------------------------

const parseJsSource = (fullPath, content) => {
  const ext = path.extname(fullPath).toLowerCase();
  const kind = scriptKindByExtension[ext] ?? ts.ScriptKind.TS;
  return ts.createSourceFile(fullPath, content, ts.ScriptTarget.Latest, true, kind);
};

const extractJsSymbolsFromAst = (sourceFile) => {
  const symbols = [];

  const addSymbol = (name, symbolKind, line, parent) => {
    if (!name) return;
    const entry = { name, kind: symbolKind, line };
    if (parent) entry.parent = parent;
    symbols.push(entry);
  };

  const visitMembers = (node, parentName) => {
    ts.forEachChild(node, (child) => {
      if (ts.isMethodDeclaration(child) || ts.isMethodSignature(child)) {
        const name = child.name && ts.isIdentifier(child.name) ? child.name.text : null;
        const line = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile)).line + 1;
        addSymbol(name, 'method', line, parentName);
      } else if (ts.isPropertyDeclaration(child) || ts.isPropertySignature(child)) {
        const name = child.name && ts.isIdentifier(child.name) ? child.name.text : null;
        const line = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile)).line + 1;
        addSymbol(name, 'property', line, parentName);
      }
    });
  };

  for (const stmt of sourceFile.statements) {
    const line = sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile)).line + 1;

    if (ts.isFunctionDeclaration(stmt)) {
      addSymbol(stmt.name?.text, 'function', line);
    } else if (ts.isClassDeclaration(stmt)) {
      const className = stmt.name?.text;
      addSymbol(className, 'class', line);
      if (className) visitMembers(stmt, className);
    } else if (ts.isInterfaceDeclaration(stmt)) {
      const ifName = stmt.name?.text;
      addSymbol(ifName, 'interface', line);
      if (ifName) visitMembers(stmt, ifName);
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      addSymbol(stmt.name?.text, 'type', line);
    } else if (ts.isEnumDeclaration(stmt)) {
      addSymbol(stmt.name?.text, 'enum', line);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          addSymbol(decl.name.text, 'const', line);
        }
      }
    }
  }

  return symbols;
};

const hasExportModifier = (node) => {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
};

const extractJsImportsExports = (sourceFile) => {
  const imports = [];
  const exports = [];

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      imports.push(stmt.moduleSpecifier.text);
    }

    if (ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        imports.push(stmt.moduleSpecifier.text);
      }
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const spec of stmt.exportClause.elements) {
          exports.push(spec.name.text);
        }
      }
    }

    if (ts.isExportAssignment(stmt)) {
      exports.push('default');
    }

    if (hasExportModifier(stmt)) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name) exports.push(stmt.name.text);
      else if (ts.isClassDeclaration(stmt) && stmt.name) exports.push(stmt.name.text);
      else if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) exports.push(decl.name.text);
        }
      } else if (ts.isInterfaceDeclaration(stmt)) exports.push(stmt.name.text);
      else if (ts.isTypeAliasDeclaration(stmt)) exports.push(stmt.name.text);
      else if (ts.isEnumDeclaration(stmt)) exports.push(stmt.name.text);
    }
  }

  return { imports, exports };
};

// ---------------------------------------------------------------------------
// Python extraction
// ---------------------------------------------------------------------------

const PYTHON_SYMBOL_RE = /^(class|def|async\s+def)\s+(\w+)/;

const extractPySymbols = (content) => {
  const symbols = [];
  const lines = content.split('\n');
  let currentClass = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const indent = lines[i].length - trimmed.length;
    const match = PYTHON_SYMBOL_RE.exec(trimmed);
    if (!match) continue;

    const keyword = match[1].replace(/\s+/g, ' ');
    const name = match[2];
    const line = i + 1;

    if (keyword === 'class') {
      currentClass = name;
      symbols.push({ name, kind: 'class', line });
    } else if (indent > 0 && currentClass) {
      symbols.push({ name, kind: 'method', line, parent: currentClass });
    } else {
      currentClass = null;
      symbols.push({ name, kind: 'function', line });
    }
  }

  return symbols;
};

const PY_IMPORT_RE = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/;

const extractPyImports = (content) => {
  const imports = [];
  for (const line of content.split('\n')) {
    const m = PY_IMPORT_RE.exec(line.trimStart());
    if (m) imports.push(m[1] ?? m[2]);
  }
  return { imports, exports: [] };
};

// ---------------------------------------------------------------------------
// Go extraction
// ---------------------------------------------------------------------------

const GO_FUNC_RE = /^func\s+(?:\([\w\s*]+\)\s+)?(\w+)\s*\(/;
const GO_TYPE_RE = /^type\s+(\w+)\s+/;

const extractGoSymbols = (content) => {
  const symbols = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const funcMatch = GO_FUNC_RE.exec(trimmed);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], kind: 'function', line: i + 1 });
      continue;
    }
    const typeMatch = GO_TYPE_RE.exec(trimmed);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: 'type', line: i + 1 });
    }
  }

  return symbols;
};

const extractGoImports = (content) => {
  const imports = [];
  const lines = content.split('\n');
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('import (')) { inBlock = true; continue; }
    if (inBlock && trimmed === ')') { inBlock = false; continue; }

    if (inBlock || trimmed.startsWith('import "')) {
      const m = /"([^"]+)"/.exec(trimmed);
      if (m) imports.push(m[1]);
    }
  }

  return { imports, exports: [] };
};

// ---------------------------------------------------------------------------
// Rust extraction
// ---------------------------------------------------------------------------

const RUST_ITEM_RE = /^(?:pub\s+)?(?:async\s+)?(fn|struct|enum|trait|type|impl|const|static)\s+(\w+)/;

const extractRustSymbols = (content) => {
  const symbols = [];
  const lines = content.split('\n');
  let currentImpl = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const match = RUST_ITEM_RE.exec(trimmed);
    if (!match) continue;

    const [, keyword, name] = match;
    const line = i + 1;

    if (keyword === 'impl') {
      currentImpl = name;
      symbols.push({ name, kind: 'impl', line });
    } else if (keyword === 'fn' && currentImpl && lines[i].startsWith('    ')) {
      symbols.push({ name, kind: 'method', line, parent: currentImpl });
    } else {
      if (keyword === 'fn') currentImpl = null;
      symbols.push({ name, kind: keyword, line });
    }
  }

  return symbols;
};

// ---------------------------------------------------------------------------
// Java extraction
// ---------------------------------------------------------------------------

const JAVA_DECL_RE = /^(?:public|private|protected|static|final|abstract|\s)*(?:class|interface|enum|record)\s+(\w+)/;
const JAVA_METHOD_RE = /^(?:public|private|protected|static|final|abstract|synchronized|\s)*(?:<[\w\s,?]+>\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\(/;

const extractJavaSymbols = (content) => {
  const symbols = [];
  const lines = content.split('\n');
  let currentType = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const declMatch = JAVA_DECL_RE.exec(trimmed);
    if (declMatch) {
      currentType = declMatch[1];
      symbols.push({ name: declMatch[1], kind: 'class', line: i + 1 });
      continue;
    }
    if (currentType) {
      const methodMatch = JAVA_METHOD_RE.exec(trimmed);
      if (methodMatch && !trimmed.includes(' new ') && !trimmed.includes('return ')) {
        symbols.push({ name: methodMatch[1], kind: 'method', line: i + 1, parent: currentType });
      }
    }
  }

  return symbols;
};

// ---------------------------------------------------------------------------
// Unified file info extraction
// ---------------------------------------------------------------------------

const extractFileInfo = (fullPath, content) => {
  const ext = path.extname(fullPath).toLowerCase();

  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    try {
      const sourceFile = parseJsSource(fullPath, content);
      return {
        symbols: extractJsSymbolsFromAst(sourceFile),
        ...extractJsImportsExports(sourceFile),
      };
    } catch {
      return { symbols: [], imports: [], exports: [] };
    }
  }
  if (ext === '.py') return { symbols: extractPySymbols(content), ...extractPyImports(content) };
  if (ext === '.go') return { symbols: extractGoSymbols(content), ...extractGoImports(content) };
  if (ext === '.rs') return { symbols: extractRustSymbols(content), imports: [], exports: [] };
  if (ext === '.java') return { symbols: extractJavaSymbols(content), imports: [], exports: [] };
  return { symbols: [], imports: [], exports: [] };
};

// ---------------------------------------------------------------------------
// Test file detection
// ---------------------------------------------------------------------------

const TEST_FILE_RE = /(?:\.(?:test|spec)\.[jt]sx?$|__tests__|_test\.go$|test_\w+\.py$)/;
export const isTestFile = (relPath) => TEST_FILE_RE.test(relPath);

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

const resolveLocalImport = (specifier, fileDir, root, knownRelPaths) => {
  if (!specifier.startsWith('.')) return null;

  const abs = path.resolve(fileDir, specifier);
  const rel = path.relative(root, abs).replace(/\\/g, '/');

  if (knownRelPaths.has(rel)) return rel;

  for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs']) {
    const c = rel + ext;
    if (knownRelPaths.has(c)) return c;
  }

  for (const ext of ['.js', '.ts', '.tsx', '.jsx']) {
    const c = rel + '/index' + ext;
    if (knownRelPaths.has(c)) return c;
  }

  return null;
};

const inferTestTarget = (testRelPath, knownRelPaths) => {
  const base = path.basename(testRelPath).replace(/\.(?:test|spec)\.[^.]+$/, '');
  const dir = path.dirname(testRelPath);
  const parentDir = path.dirname(dir);

  for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java']) {
    const c = `${dir}/${base}${ext}`;
    if (knownRelPaths.has(c)) return c;
  }

  for (const srcDir of ['src', 'lib', 'pkg']) {
    for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java']) {
      const c = `${parentDir}/${srcDir}/${base}${ext}`;
      if (knownRelPaths.has(c)) return c;
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Directory walker
// ---------------------------------------------------------------------------

const walkForIndex = (dir, files = []) => {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkForIndex(fullPath, files);
    } else if (indexableExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
};

// ---------------------------------------------------------------------------
// Build index
// ---------------------------------------------------------------------------

export const buildIndex = (root) => {
  const files = walkForIndex(root);
  const fileEntries = {};
  const invertedIndex = {};
  const rawImports = {};

  for (const fullPath of files) {
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 512 * 1024) continue;

      const buffer = fs.readFileSync(fullPath);
      if (isBinaryBuffer(buffer)) continue;

      const content = buffer.toString('utf8');
      const info = extractFileInfo(fullPath, content);
      if (info.symbols.length === 0 && info.imports.length === 0) continue;

      const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
      fileEntries[relPath] = {
        mtime: Math.floor(stat.mtimeMs),
        symbols: info.symbols,
        exports: info.exports,
      };
      rawImports[relPath] = info.imports;

      for (const sym of info.symbols) {
        const key = sym.name.toLowerCase();
        if (!invertedIndex[key]) invertedIndex[key] = [];
        const entry = { path: relPath, line: sym.line, kind: sym.kind };
        if (sym.parent) entry.parent = sym.parent;
        invertedIndex[key].push(entry);
      }
    } catch {
      // skip unreadable files
    }
  }

  const knownRelPaths = new Set(Object.keys(fileEntries));
  const edges = [];

  for (const [relPath, specifiers] of Object.entries(rawImports)) {
    const fileDir = path.resolve(root, path.dirname(relPath));
    const testFile = isTestFile(relPath);

    for (const spec of specifiers) {
      const resolved = resolveLocalImport(spec, fileDir, root, knownRelPaths);
      if (!resolved) continue;

      edges.push({ from: relPath, to: resolved, kind: 'import' });
      if (testFile) edges.push({ from: relPath, to: resolved, kind: 'testOf' });
    }

    if (testFile && !edges.some((e) => e.from === relPath && e.kind === 'testOf')) {
      const target = inferTestTarget(relPath, knownRelPaths);
      if (target) edges.push({ from: relPath, to: target, kind: 'testOf' });
    }
  }

  return {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    files: fileEntries,
    invertedIndex,
    graph: { edges },
  };
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export const queryIndex = (index, symbolName) => {
  if (!index?.invertedIndex) return [];
  const key = symbolName.toLowerCase();
  return index.invertedIndex[key] ?? [];
};

export const queryRelated = (index, relPath) => {
  const result = { imports: [], importedBy: [], tests: [], neighbors: [] };
  if (!index?.graph?.edges) return result;

  for (const edge of index.graph.edges) {
    if (edge.from === relPath && edge.kind === 'import') result.imports.push(edge.to);
    if (edge.to === relPath && edge.kind === 'import') result.importedBy.push(edge.from);
    if (edge.to === relPath && edge.kind === 'testOf') result.tests.push(edge.from);
  }

  const dir = path.dirname(relPath);
  if (index.files) {
    result.neighbors = Object.keys(index.files).filter((p) => p !== relPath && path.dirname(p) === dir);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Staleness & incremental reindex
// ---------------------------------------------------------------------------

export const isFileStale = (index, relPath, currentMtimeMs) => {
  const entry = index?.files?.[relPath];
  if (!entry) return true;
  return Math.floor(currentMtimeMs) !== entry.mtime;
};

export const reindexFile = (index, root, relPath) => {
  const fullPath = path.join(root, relPath);

  if (index.graph?.edges) {
    index.graph.edges = index.graph.edges.filter((e) => e.from !== relPath);
  }

  try {
    const stat = fs.statSync(fullPath);
    const buffer = fs.readFileSync(fullPath);
    if (isBinaryBuffer(buffer)) return;

    const content = buffer.toString('utf8');
    const info = extractFileInfo(fullPath, content);

    const oldSymbols = index.files[relPath]?.symbols ?? [];
    for (const sym of oldSymbols) {
      const key = sym.name.toLowerCase();
      if (index.invertedIndex[key]) {
        index.invertedIndex[key] = index.invertedIndex[key].filter((e) => e.path !== relPath);
        if (index.invertedIndex[key].length === 0) delete index.invertedIndex[key];
      }
    }

    if (info.symbols.length === 0 && info.imports.length === 0) {
      delete index.files[relPath];
      return;
    }

    index.files[relPath] = {
      mtime: Math.floor(stat.mtimeMs),
      symbols: info.symbols,
      exports: info.exports,
    };

    for (const sym of info.symbols) {
      const key = sym.name.toLowerCase();
      if (!index.invertedIndex[key]) index.invertedIndex[key] = [];
      const invEntry = { path: relPath, line: sym.line, kind: sym.kind };
      if (sym.parent) invEntry.parent = sym.parent;
      index.invertedIndex[key].push(invEntry);
    }

    if (!index.graph) index.graph = { edges: [] };
    const knownRelPaths = new Set(Object.keys(index.files));
    const fileDir = path.resolve(root, path.dirname(relPath));
    const testFile = isTestFile(relPath);

    for (const spec of info.imports) {
      const resolved = resolveLocalImport(spec, fileDir, root, knownRelPaths);
      if (!resolved) continue;
      index.graph.edges.push({ from: relPath, to: resolved, kind: 'import' });
      if (testFile) index.graph.edges.push({ from: relPath, to: resolved, kind: 'testOf' });
    }

    if (testFile && !index.graph.edges.some((e) => e.from === relPath && e.kind === 'testOf')) {
      const target = inferTestTarget(relPath, knownRelPaths);
      if (target) index.graph.edges.push({ from: relPath, to: target, kind: 'testOf' });
    }
  } catch {
    if (index.files[relPath]) {
      const oldSymbols = index.files[relPath].symbols ?? [];
      for (const sym of oldSymbols) {
        const key = sym.name.toLowerCase();
        if (index.invertedIndex[key]) {
          index.invertedIndex[key] = index.invertedIndex[key].filter((e) => e.path !== relPath);
          if (index.invertedIndex[key].length === 0) delete index.invertedIndex[key];
        }
      }
      delete index.files[relPath];
    }
  }
};

export const removeFileFromIndex = (index, relPath) => {
  const oldSymbols = index.files?.[relPath]?.symbols ?? [];
  for (const sym of oldSymbols) {
    const key = sym.name.toLowerCase();
    if (index.invertedIndex?.[key]) {
      index.invertedIndex[key] = index.invertedIndex[key].filter((e) => e.path !== relPath);
      if (index.invertedIndex[key].length === 0) delete index.invertedIndex[key];
    }
  }
  if (index.graph?.edges) {
    index.graph.edges = index.graph.edges.filter((e) => e.from !== relPath && e.to !== relPath);
  }
  delete index.files[relPath];
};

export const buildIndexIncremental = (root) => {
  const existing = loadIndex(root);
  if (!existing) {
    const index = buildIndex(root);
    const total = Object.keys(index.files).length;
    return { index, stats: { total, reindexed: total, removed: 0, unchanged: 0, fullRebuild: true } };
  }

  const diskFiles = walkForIndex(root);
  const diskRelPaths = new Set();
  const reindexedPaths = [];
  let unchanged = 0;

  for (const fullPath of diskFiles) {
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 512 * 1024) continue;
      const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
      diskRelPaths.add(relPath);

      if (isFileStale(existing, relPath, stat.mtimeMs)) {
        reindexFile(existing, root, relPath);
        reindexedPaths.push(relPath);
      } else {
        unchanged++;
      }
    } catch { /* skip unreadable */ }
  }

  const indexedPaths = Object.keys(existing.files);
  let removed = 0;
  for (const relPath of indexedPaths) {
    if (!diskRelPaths.has(relPath)) {
      removeFileFromIndex(existing, relPath);
      removed++;
    }
  }

  if (reindexedPaths.length > 0) {
    const knownRelPaths = new Set(Object.keys(existing.files));
    if (!existing.graph) existing.graph = { edges: [] };

    for (const relPath of reindexedPaths) {
      existing.graph.edges = existing.graph.edges.filter((e) => e.from !== relPath);

      const entry = existing.files[relPath];
      if (!entry) continue;

      const fullPath = path.join(root, relPath);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const info = extractFileInfo(fullPath, content);
        const fileDir = path.resolve(root, path.dirname(relPath));
        const testFile = isTestFile(relPath);

        for (const spec of info.imports) {
          const resolved = resolveLocalImport(spec, fileDir, root, knownRelPaths);
          if (!resolved) continue;
          existing.graph.edges.push({ from: relPath, to: resolved, kind: 'import' });
          if (testFile) existing.graph.edges.push({ from: relPath, to: resolved, kind: 'testOf' });
        }

        if (testFile && !existing.graph.edges.some((e) => e.from === relPath && e.kind === 'testOf')) {
          const target = inferTestTarget(relPath, knownRelPaths);
          if (target) existing.graph.edges.push({ from: relPath, to: target, kind: 'testOf' });
        }
      } catch { /* skip */ }
    }
  }

  existing.generatedAt = new Date().toISOString();

  const total = Object.keys(existing.files).length;
  return { index: existing, stats: { total, reindexed: reindexedPaths.length, removed, unchanged, fullRebuild: false } };
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const persistIndex = async (index, root) => {
  try {
    const indexPath = resolveIndexPath(root);
    await fsp.mkdir(path.dirname(indexPath), { recursive: true });
    await fsp.writeFile(indexPath, JSON.stringify(index), 'utf8');
  } catch {
    // best-effort
  }
};

export const loadIndex = (root) => {
  try {
    const indexPath = resolveIndexPath(root);
    const raw = fs.readFileSync(indexPath, 'utf8');
    const index = JSON.parse(raw);
    if (index.version !== INDEX_VERSION) return null;
    return index;
  } catch {
    return null;
  }
};
