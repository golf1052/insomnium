import { describe, expect, it } from '@jest/globals';

import { localTemplateTags } from '../local-template-tags';

const jsonPathTag = localTemplateTags.find(tag => tag.templateTag.name === 'jsonpath')?.templateTag;

if (!jsonPathTag?.run) {
  throw new Error('JSONPath template tag is not registered');
}

describe('localTemplateTags', () => {
  it('extracts values from JSON with JSONPath', () => {
    const result = jsonPathTag.run(undefined, '{"items":[{"name":"coffee"}]}', '$.items[0].name');

    expect(result).toBe('coffee');
  });

  it('rejects invalid JSON', () => {
    expect(() => jsonPathTag.run(undefined, '{"items":[}', '$.items[0].name')).toThrow('Invalid JSON:');
  });

  it('rejects invalid JSONPath queries', () => {
    expect(() => jsonPathTag.run(undefined, '{"items":[{"name":"coffee"}]}', '$.items[?(@')).toThrow(
      'Invalid JSONPath query: $.items[?(@',
    );
  });

  it('rejects JSONPath queries with no matches', () => {
    expect(() => jsonPathTag.run(undefined, '{"items":[{"name":"coffee"}]}', '$.items[0].missing')).toThrow(
      'JSONPath query returned no results: $.items[0].missing',
    );
  });
});
