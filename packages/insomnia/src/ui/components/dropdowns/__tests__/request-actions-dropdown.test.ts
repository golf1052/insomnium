import { describe, expect, it, jest } from '@jest/globals';

import { copyRequestAsCurl } from '../request-actions-dropdown';

describe('copyRequestAsCurl', () => {
  it('writes generated curl commands to the clipboard', async () => {
    const writeText = jest.fn();
    const exportHarRequestFn = jest.fn().mockResolvedValue({ log: { entries: [] } });
    const convert = jest.fn().mockReturnValue('curl https://example.com');

    const command = await copyRequestAsCurl('req_1', 'env_1', {
      exportHarRequestFn,
      loadHTTPSnippet: async () => ({
        default: class {
          constructor(_har: unknown) {}

          convert(target: string, client: string) {
            return convert(target, client);
          }
        },
      }),
      writeText,
    });

    expect(exportHarRequestFn).toHaveBeenCalledWith('req_1', 'env_1');
    expect(convert).toHaveBeenCalledWith('shell', 'curl');
    expect(writeText).toHaveBeenCalledWith('curl https://example.com');
    expect(command).toBe('curl https://example.com');
  });

  it('does nothing when no HAR can be exported', async () => {
    const writeText = jest.fn();

    const command = await copyRequestAsCurl('req_1', 'env_1', {
      exportHarRequestFn: jest.fn().mockResolvedValue(null),
      loadHTTPSnippet: async () => ({
        default: class {
          constructor(_har: unknown) {}

          convert() {
            return 'curl https://example.com';
          }
        },
      }),
      writeText,
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(command).toBeNull();
  });
});
