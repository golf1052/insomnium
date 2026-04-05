import { describe, expect, it, jest } from '@jest/globals';
import type { HTTPSnippetClient, HTTPSnippetTarget } from 'httpsnippet';

import { init as initRequest, type Request } from '../../../../models/request';
import { generateCodeSnippet, parseStoredGenerateCodeOption } from '../generate-code-modal';

const createRequest = (): Request => ({
  ...initRequest(),
  _id: 'req_1',
  type: 'Request',
  parentId: 'wrk_1',
  modified: 0,
  created: 0,
  isPrivate: false,
  metaSortKey: 0,
  name: 'Example Request',
});

const shellTarget: HTTPSnippetTarget = {
  key: 'shell',
  title: 'Shell',
  extname: '.sh',
  default: 'curl',
  clients: [{
    key: 'curl',
    title: 'cURL',
    link: 'https://curl.se',
    description: 'Command line HTTP client',
  }, {
    key: 'httpie',
    title: 'HTTPie',
    link: 'https://httpie.io',
    description: 'Human friendly CLI',
  }],
};

const nodeClient: HTTPSnippetClient = {
  key: 'native',
  title: 'Native',
  link: 'https://nodejs.org',
  description: 'Native Node.js client',
};

const nodeTarget: HTTPSnippetTarget = {
  key: 'node',
  title: 'Node.js',
  extname: '.js',
  default: 'native',
  clients: [nodeClient],
};

describe('generate-code-modal helpers', () => {
  it('falls back to the shell/curl target and client', async () => {
    const exportHarRequestFn = jest.fn().mockResolvedValue({ log: { entries: [] } });

    const state = await generateCodeSnippet(
      createRequest(),
      'env_1',
      undefined,
      undefined,
      {
        exportHarRequestFn,
        loadHTTPSnippet: async () => ({
          default: class {
            static availableTargets() {
              return [shellTarget, nodeTarget];
            }

            convert(target: string, client: string) {
              return `${target}:${client}`;
            }
          },
        }),
      },
    );

    expect(exportHarRequestFn).toHaveBeenCalledWith('req_1', 'env_1', false);
    expect(state).toMatchObject({
      cmd: 'shell:curl',
      client: shellTarget.clients[0],
      request: createRequest(),
      target: shellTarget,
      targets: [shellTarget, nodeTarget],
    });
  });

  it('adds content-length for node native snippets', async () => {
    const exportHarRequestFn = jest.fn().mockResolvedValue({ log: { entries: [] } });

    const state = await generateCodeSnippet(
      createRequest(),
      'env_1',
      nodeTarget,
      nodeClient,
      {
        exportHarRequestFn,
        loadHTTPSnippet: async () => ({
          default: class {
            static availableTargets() {
              return [shellTarget, nodeTarget];
            }

            convert(target: string, client: string) {
              return `${target}:${client}`;
            }
          },
        }),
      },
    );

    expect(exportHarRequestFn).toHaveBeenCalledWith('req_1', 'env_1', true);
    expect(state?.cmd).toBe('node:native');
  });

  it('returns null when HAR generation fails', async () => {
    const state = await generateCodeSnippet(
      createRequest(),
      'env_1',
      undefined,
      undefined,
      {
        exportHarRequestFn: jest.fn().mockResolvedValue(null),
        loadHTTPSnippet: async () => ({
          default: class {
            static availableTargets() {
              return [shellTarget];
            }

            convert() {
              return 'shell:curl';
            }
          },
        }),
      },
    );

    expect(state).toBeNull();
  });

  it('falls back when stored code-generation preferences are invalid', () => {
    expect(parseStoredGenerateCodeOption('{bad json', shellTarget)).toBe(shellTarget);
  });
});
