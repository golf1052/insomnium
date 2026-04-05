import { describe, expect, it } from '@jest/globals';

import { markdownToHTML } from '../markdown-to-html';

describe('markdownToHTML', () => {
  it('renders markdown while stripping unsafe markup', () => {
    const html = markdownToHTML('**Bold** <img src="x" onerror="alert(1)"><script>alert(1)</script>');

    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('removes unsafe javascript links', () => {
    const html = markdownToHTML('[Open me](javascript:alert(1))');

    expect(html).toContain('<a');
    expect(html).not.toContain('href="javascript:alert(1)"');
  });
});
