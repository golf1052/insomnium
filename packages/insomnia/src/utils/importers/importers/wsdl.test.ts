import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { convert as convertOpenApi } from './openapi-3';
import { generateOpenApiFromWsdl, looksLikeWsdl } from './techspokes-wsdl';
import { convert } from './wsdl';

jest.mock('./openapi-3', () => ({
  convert: jest.fn(),
}));
jest.mock('./techspokes-wsdl', () => ({
  generateOpenApiFromWsdl: jest.fn(),
  looksLikeWsdl: jest.fn(),
}));

const mockConvertOpenApi = jest.mocked(convertOpenApi);
const mockGenerateOpenApiFromWsdl = jest.mocked(generateOpenApiFromWsdl);
const mockLooksLikeWsdl = jest.mocked(looksLikeWsdl);

describe('wsdl importer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null for inputs that do not look like WSDL', async () => {
    mockLooksLikeWsdl.mockReturnValue(false);

    await expect(convert('<xml />')).resolves.toBeNull();
    expect(mockGenerateOpenApiFromWsdl).not.toHaveBeenCalled();
  });

  it('converts WSDL files through TechSpokes and the OpenAPI importer', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const openApiDocument = {
      openapi: '3.1.0',
      info: {
        title: 'Calculator SOAP API',
        version: '1.0.0',
      },
      paths: {
        '/add': {
          post: {},
        },
      },
      servers: [{
        url: 'https://example.com/soap',
      }],
    };
    const convertedResources = [{ _type: 'request', name: 'Converted request' }];

    mockLooksLikeWsdl.mockReturnValue(true);
    mockGenerateOpenApiFromWsdl.mockResolvedValue(openApiDocument as never);
    mockConvertOpenApi.mockResolvedValue(convertedResources as never);

    const result = await convert('<wsdl:definitions />');

    expect(mockGenerateOpenApiFromWsdl).toHaveBeenCalledWith('<wsdl:definitions />');
    expect(mockConvertOpenApi).toHaveBeenCalledWith(JSON.stringify(openApiDocument));
    expect(result).toEqual(convertedResources);

    consoleError.mockRestore();
  });

  it('returns null when WSDL conversion fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    mockLooksLikeWsdl.mockReturnValue(true);
    mockGenerateOpenApiFromWsdl.mockRejectedValue(new Error('invalid wsdl'));

    await expect(convert('<wsdl:definitions />')).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
  });
});
