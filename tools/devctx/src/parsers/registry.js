const parsers = new Map();
const importExtractors = new Map();

export const registerParser = (extension, parser) => {
  if (!extension || typeof parser !== 'function') return;
  parsers.set(extension.toLowerCase(), parser);
};

export const registerImportExtractor = (extension, extractor) => {
  if (!extension || typeof extractor !== 'function') return;
  importExtractors.set(extension.toLowerCase(), extractor);
};

export const getParser = (extension) => parsers.get(extension?.toLowerCase()) ?? null;

export const getImportExtractor = (extension) => importExtractors.get(extension?.toLowerCase()) ?? null;

export const listRegisteredExtensions = () => ({
  symbols: [...parsers.keys()],
  imports: [...importExtractors.keys()],
});

export const clearRegistry = () => {
  parsers.clear();
  importExtractors.clear();
};
