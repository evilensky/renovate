import jsonata from 'jsonata';
import { toSha256 } from './hash';
import * as memCache from './cache/memory';

export function getExpression(input: string): jsonata.Expression | Error {
  const cacheKey = `jsonata:${toSha256(input)}`;
  const cachedExpression = memCache.get<jsonata.Expression | Error>(cacheKey);
  // istanbul ignore if: cannot test
  if (cachedExpression) {
    return cachedExpression;
  }
  let result: jsonata.Expression | Error;
  try {
    result = jsonata(input);
  } catch (err) {
    // JSONata errors aren't detected as TypeOf Error
    result = new Error(err.message);
  }
  memCache.set(cacheKey, result);
  return result;
}
