import { encodingForModel } from 'js-tiktoken';

const fallbackModel = 'gpt-4o-mini';
const encoder = encodingForModel(fallbackModel);

export const countTokens = (text = '') => {
  if (!text) {
    return 0;
  }

  return encoder.encode(String(text)).length;
};
