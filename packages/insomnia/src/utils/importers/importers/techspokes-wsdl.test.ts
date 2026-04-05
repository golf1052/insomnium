import { access } from 'fs/promises';
import { dirname } from 'path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { loadTechSpokesWsdlClient } from './techspokes-wsdl-loader';
import { extractWsdlServiceUrl, generateOpenApiFromWsdl, normalizeWsdlContent } from './techspokes-wsdl';

jest.mock('./techspokes-wsdl-loader', () => ({
  loadTechSpokesWsdlClient: jest.fn(),
}));

const mockLoadTechSpokesWsdlClient = jest.mocked(loadTechSpokesWsdlClient);

describe('techspokes WSDL helper', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes WSDL content without duplicating the XML header', () => {
    expect(normalizeWsdlContent('<wsdl:definitions />')).toBe(
      '<?xml version="1.0" encoding="UTF-8" ?><wsdl:definitions />',
    );
    expect(normalizeWsdlContent('<?xml version="1.0" encoding="UTF-8" ?><wsdl:definitions />')).toBe(
      '<?xml version="1.0" encoding="UTF-8" ?><wsdl:definitions />',
    );
  });

  it('extracts the first SOAP service URL from the WSDL', () => {
    expect(
      extractWsdlServiceUrl('<wsdl:definitions><soap:address location="https://example.com/soap" /></wsdl:definitions>'),
    ).toBe('https://example.com/soap');
  });

  it('writes a temporary WSDL file, forwards the service URL, and removes the temp directory', async () => {
    let generatedWsdlPath = '';

    mockLoadTechSpokesWsdlClient.mockResolvedValue({
      generateOpenAPI: jest.fn(async (input: { wsdl: string; servers?: string[] }) => {
        const { wsdl, servers } = input;
        generatedWsdlPath = wsdl;
        expect(servers).toEqual(['https://example.com/soap']);
        await expect(access(wsdl)).resolves.toBeUndefined();

        return {
          doc: {
            openapi: '3.1.0',
            info: {
              title: 'Calculator SOAP API',
              version: '1.0.0',
            },
            paths: {},
          },
        };
      }),
    } as never);

    const doc = await generateOpenApiFromWsdl(
      '<wsdl:definitions><soap:address location="https://example.com/soap" /></wsdl:definitions>',
    );

    expect(doc.info.title).toBe('Calculator SOAP API');
    await expect(access(dirname(generatedWsdlPath))).rejects.toThrow();
  });

  it('removes the temporary directory when OpenAPI generation fails', async () => {
    let generatedWsdlPath = '';

    mockLoadTechSpokesWsdlClient.mockResolvedValue({
      generateOpenAPI: jest.fn(async (input: { wsdl: string }) => {
        const { wsdl } = input;
        generatedWsdlPath = wsdl;
        throw new Error('invalid wsdl');
      }),
    } as never);

    await expect(generateOpenApiFromWsdl('<wsdl:definitions />')).rejects.toThrow('invalid wsdl');
    await expect(access(dirname(generatedWsdlPath))).rejects.toThrow();
  });
});
