import path from 'node:path';
import ts from 'typescript';
import { joinSections, toUniqueLines, truncateSection } from './shared.js';

const scriptKindByExtension = {
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
};

const getNodeName = (node) => {
  if (node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  return 'anonymous';
};

const isIIFE = (node) => {
  if (!ts.isExpressionStatement(node)) return false;
  const expr = node.expression;
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    return ts.isParenthesizedExpression(callee) || ts.isFunctionExpression(callee) || ts.isArrowFunction(callee);
  }
  return false;
};

const extractIIFEMembers = (node, sourceFile) => {
  const results = [];
  const expr = node.expression;
  const fn = ts.isCallExpression(expr)
    ? (ts.isParenthesizedExpression(expr.expression) ? expr.expression.expression : expr.expression)
    : null;

  if (!fn || !fn.body) return ['(IIFE)'];

  const visit = (child) => {
    if (ts.isFunctionDeclaration(child) || ts.isFunctionExpression(child)) {
      const name = child.name?.text;
      if (name) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile));
        results.push(`  function ${name}() → line ${line + 1}`);
      }
    }
    if (ts.isVariableStatement(child)) {
      for (const decl of child.declarationList.declarations) {
        const name = ts.isIdentifier(decl.name) ? decl.name.text : null;
        const init = decl.initializer;
        if (name && init && (ts.isFunctionExpression(init) || ts.isArrowFunction(init))) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile));
          results.push(`  const ${name} = () → line ${line + 1}`);
        }
      }
    }
    ts.forEachChild(child, visit);
  };

  ts.forEachChild(fn.body, visit);
  return results.length > 0 ? ['(IIFE)', ...results] : ['(IIFE)'];
};

const formatImport = (statement) => {
  const moduleName = statement.moduleSpecifier.getText();
  const clause = statement.importClause;

  if (!clause) {
    return `import ${moduleName}`;
  }

  const parts = [];

  if (clause.name) {
    parts.push(clause.name.text);
  }

  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      parts.push(`* as ${clause.namedBindings.name.text}`);
    } else {
      const names = clause.namedBindings.elements.map((element) => {
        if (element.propertyName) {
          return `${element.propertyName.text} as ${element.name.text}`;
        }

        return element.name.text;
      });
      parts.push(`{ ${names.join(', ')} }`);
    }
  }

  return `import ${parts.join(', ')} from ${moduleName}`;
};

const formatDeclarationName = (name) => {
  if (ts.isIdentifier(name)) {
    return name.text;
  }

  return name.getText();
};

const collectVariableNames = (declarationList) => declarationList.declarations.map((declaration) => formatDeclarationName(declaration.name));

const formatTopLevelStatement = (statement, sourceFile) => {
  const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  const prefix = exported ? 'export ' : '';

  if (ts.isImportDeclaration(statement)) {
    return formatImport(statement);
  }

  if (ts.isFunctionDeclaration(statement)) {
    return `${prefix}function ${getNodeName(statement)}()`;
  }

  if (ts.isClassDeclaration(statement)) {
    return `${prefix}class ${getNodeName(statement)}`;
  }

  if (ts.isInterfaceDeclaration(statement)) {
    return `${prefix}interface ${statement.name.text}`;
  }

  if (ts.isTypeAliasDeclaration(statement)) {
    return `${prefix}type ${statement.name.text}`;
  }

  if (ts.isEnumDeclaration(statement)) {
    return `${prefix}enum ${statement.name.text}`;
  }

  if (ts.isVariableStatement(statement)) {
    const declarationKind = statement.declarationList.flags & ts.NodeFlags.Const
      ? 'const'
      : statement.declarationList.flags & ts.NodeFlags.Let
        ? 'let'
        : 'var';
    return `${prefix}${declarationKind} ${collectVariableNames(statement.declarationList).join(', ')}`;
  }

  if (ts.isExportAssignment(statement)) {
    return `export default ${statement.expression.getText(sourceFile)}`;
  }

  return statement.getText(sourceFile).split('\n')[0];
};

const collectHooks = (sourceFile) => {
  const hooks = new Set();

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^use[A-Z]/.test(node.expression.text)) {
      hooks.add(node.expression.text);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  return [...hooks].sort();
};

const parseSource = (fullPath, content) => {
  const extension = path.extname(fullPath).toLowerCase();
  const scriptKind = scriptKindByExtension[extension] ?? ts.ScriptKind.TS;
  return ts.createSourceFile(fullPath, content, ts.ScriptTarget.Latest, true, scriptKind);
};

const getDeclarationName = (statement) => {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) {
    return statement.name?.text ?? null;
  }

  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((d) => formatDeclarationName(d.name));
  }

  return null;
};

const matchesSymbolName = (statement, symbolName) => {
  const name = getDeclarationName(statement);
  if (Array.isArray(name)) return name.includes(symbolName);
  return name === symbolName;
};

const nodeToNumberedLines = (node, sourceFile, content) => {
  const startPos = node.getStart(sourceFile);
  const endPos = node.getEnd();
  const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(startPos);
  const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(endPos);
  const lines = content.split('\n').slice(startLine, endLine + 1);
  return lines.map((l, i) => `${startLine + i + 1}|${l}`).join('\n');
};

const getNodeIdentifierName = (node) => {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (node.name && ts.isComputedPropertyName(node.name)) return null;
  return null;
};

const findSymbolNode = (node, symbolName) => {
  if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    if (getNodeIdentifierName(node) === symbolName) return node;
  }

  if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
    if (getNodeIdentifierName(node) === symbolName) return node;
  }

  if (ts.isMethodSignature(node) || ts.isPropertySignature(node)) {
    if (getNodeIdentifierName(node) === symbolName) return node;
  }

  let found = null;
  ts.forEachChild(node, (child) => {
    if (!found) found = findSymbolNode(child, symbolName);
  });
  return found;
};

export const extractCodeSymbol = (fullPath, content, symbolName) => {
  const sourceFile = parseSource(fullPath, content);

  for (const statement of sourceFile.statements) {
    if (matchesSymbolName(statement, symbolName)) {
      return nodeToNumberedLines(statement, sourceFile, content);
    }
  }

  const nested = findSymbolNode(sourceFile, symbolName);
  if (nested) {
    return nodeToNumberedLines(nested, sourceFile, content);
  }

  return `Symbol not found: ${symbolName}`;
};

export const summarizeCode = (fullPath, content, mode) => {
  const sourceFile = parseSource(fullPath, content);
  const topLevel = sourceFile.statements.flatMap((statement) => {
    if (isIIFE(statement)) return extractIIFEMembers(statement, sourceFile);
    return [formatTopLevelStatement(statement, sourceFile)];
  });
  const hooks = collectHooks(sourceFile);

  if (mode === 'signatures') {
    return truncateSection('# Signatures', toUniqueLines(topLevel), 4000);
  }

  return joinSections([
    truncateSection('# Outline', toUniqueLines(topLevel), 4000),
    truncateSection('# Hooks', hooks, 1200),
  ], 5000);
};
