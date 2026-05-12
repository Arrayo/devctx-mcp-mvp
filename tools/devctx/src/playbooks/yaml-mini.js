const COMMENT_RE = /(^|\s)#.*$/;

const stripComment = (line) => {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && (inSingle || inDouble)) { i += 1; continue; }
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '\'' && !inDouble) inSingle = !inSingle;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i).trimEnd();
  }
  return line.replace(COMMENT_RE, '$1').trimEnd();
};

const unquoteScalar = (raw) => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  return trimmed;
};

const indentOf = (line) => {
  let i = 0;
  while (i < line.length && line[i] === ' ') i += 1;
  return i;
};

const parseFlowInline = (rest) => {
  if (rest === '' || rest === undefined) return undefined;
  const trimmed = rest.trim();
  if (trimmed === '{}') return {};
  if (trimmed === '[]') return [];
  return unquoteScalar(rest);
};

class Reader {
  constructor(lines) {
    this.lines = lines;
    this.idx = 0;
  }

  peek() {
    while (this.idx < this.lines.length) {
      const raw = stripComment(this.lines[this.idx]);
      if (raw.trim() === '') { this.idx += 1; continue; }
      return { raw, indent: indentOf(raw), content: raw.slice(indentOf(raw)) };
    }
    return null;
  }

  consume() {
    const next = this.peek();
    if (next) this.idx += 1;
    return next;
  }
}

const parseValue = (reader, baseIndent) => {
  const first = reader.peek();
  if (!first || first.indent < baseIndent) return null;

  if (first.content.startsWith('- ') || first.content === '-') {
    return parseSequence(reader, first.indent);
  }
  return parseMapping(reader, first.indent);
};

const parseMapping = (reader, baseIndent) => {
  const obj = {};
  while (true) {
    const next = reader.peek();
    if (!next || next.indent < baseIndent) break;
    if (next.indent > baseIndent) break;
    if (next.content.startsWith('-')) break;

    const colon = next.content.indexOf(':');
    if (colon === -1) throw new Error(`YAML parse error: missing ':' near "${next.content}"`);

    const key = next.content.slice(0, colon).trim();
    const rest = next.content.slice(colon + 1).trim();
    reader.consume();

    if (rest === '' || rest === undefined) {
      const nestedPeek = reader.peek();
      if (nestedPeek && nestedPeek.indent > baseIndent) {
        obj[key] = parseValue(reader, nestedPeek.indent);
      } else {
        obj[key] = null;
      }
    } else {
      obj[key] = parseFlowInline(rest);
    }
  }
  return obj;
};

const parseSequence = (reader, baseIndent) => {
  const arr = [];
  while (true) {
    const next = reader.peek();
    if (!next || next.indent !== baseIndent) break;
    if (!next.content.startsWith('-')) break;

    const tail = next.content.slice(1).trimStart();
    reader.consume();

    if (tail === '') {
      const nestedPeek = reader.peek();
      if (nestedPeek && nestedPeek.indent > baseIndent) {
        arr.push(parseValue(reader, nestedPeek.indent));
      } else {
        arr.push(null);
      }
    } else if (tail.includes(':') && !/^["']/.test(tail)) {
      const colon = tail.indexOf(':');
      const key = tail.slice(0, colon).trim();
      const rest = tail.slice(colon + 1).trim();
      const item = {};
      if (rest === '') {
        const nestedPeek = reader.peek();
        if (nestedPeek && nestedPeek.indent > baseIndent) {
          const nested = parseMapping(reader, nestedPeek.indent);
          item[key] = nested;
        } else {
          item[key] = null;
        }
      } else {
        item[key] = parseFlowInline(rest);
      }
      const nestedPeek = reader.peek();
      const itemIndent = baseIndent + 2;
      if (nestedPeek && nestedPeek.indent >= itemIndent && !nestedPeek.content.startsWith('-')) {
        const rest2 = parseMapping(reader, nestedPeek.indent);
        Object.assign(item, rest2);
      }
      arr.push(item);
    } else {
      arr.push(parseFlowInline(tail));
    }
  }
  return arr;
};

export const parseYamlMini = (input) => {
  if (typeof input !== 'string') throw new Error('YAML parse: input must be a string');
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const reader = new Reader(lines);
  const first = reader.peek();
  if (!first) return null;
  const baseIndent = first.indent;
  if (first.content.startsWith('-')) return parseSequence(reader, baseIndent);
  return parseMapping(reader, baseIndent);
};
