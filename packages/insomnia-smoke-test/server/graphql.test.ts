import { describe, expect, it } from '@jest/globals';
import { graphql } from 'graphql';

import { schema } from './graphql';

describe('GraphQL smoke-test schema', () => {
  it('resolves the hello field and enum-backed bearer field', async () => {
    const result = await graphql({
      schema,
      source: '{ hello bearer }',
    });

    expect(result).toEqual({
      data: {
        hello: 'Hello world!',
        bearer: 'Gandalf',
      },
    });
  });
});
