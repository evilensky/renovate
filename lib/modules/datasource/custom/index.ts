import is from '@sindresorhus/is';
import { logger } from '../../../logger';
import * as jsonata from '../../../util/jsonata';
import { Datasource } from '../datasource';
import type { DigestConfig, GetReleasesConfig, ReleaseResult } from '../types';
import { fetchers } from './formats';
import { ReleaseResultZodSchema } from './schema';
import { getCustomConfig } from './utils';

export class CustomDatasource extends Datasource {
  static readonly id = 'custom';

  override customRegistrySupport = true;

  constructor() {
    super(CustomDatasource.id);
  }

  async getReleases(
    getReleasesConfig: GetReleasesConfig,
  ): Promise<ReleaseResult | null> {
    const config = getCustomConfig(getReleasesConfig);
    if (is.nullOrUndefined(config)) {
      return null;
    }

    const { defaultRegistryUrlTemplate, transformTemplates, format } = config;

    const fetcher = fetchers[format];
    const isLocalRegistry = defaultRegistryUrlTemplate.startsWith('file://');

    let data: unknown;
    try {
      if (isLocalRegistry) {
        data = await fetcher.readFile(
          defaultRegistryUrlTemplate.replace('file://', ''),
        );
      } else {
        data = await fetcher.fetch(this.http, defaultRegistryUrlTemplate);
      }
    } catch (e) {
      this.handleHttpErrors(e);
      return null;
    }

    logger.trace({ data }, `Custom manager fetcher '${format}' returned data.`);

    for (const transformTemplate of transformTemplates) {
      const expression = jsonata.getExpression(transformTemplate);

      // istanbul ignore if: JSONata doesn't seem to ever throw for this, despite the docs
      if (expression instanceof Error) {
        logger.once.warn(
          { err: expression },
          `Error while compiling JSONata expression ${JSON.stringify(transformTemplate)}`,
        );
        return null;
      }

      // Check if JSONata returned a working expression
      if (!expression.evaluate) {
        logger.once.warn(
          { expression },
          `Error while compiling JSONata expression: ${transformTemplate}`,
        );
        return null;
      }

      try {
        data = await expression.evaluate(data);
      } catch (err) {
        logger.once.warn(
          { err },
          `Error while evaluating JSONata expression: ${transformTemplate}`,
        );
        return null;
      }
    }

    try {
      const parsed = ReleaseResultZodSchema.parse(data);
      return structuredClone(parsed);
    } catch (err) {
      logger.debug({ err }, `Response has failed validation`);
      logger.trace({ data }, 'Response that has failed validation');
      return null;
    }
  }

  override getDigest(
    { packageName }: DigestConfig,
    newValue?: string,
  ): Promise<string | null> {
    // Return null here to support setting a digest: value can be provided digest in getReleases
    return Promise.resolve(null);
  }
}
