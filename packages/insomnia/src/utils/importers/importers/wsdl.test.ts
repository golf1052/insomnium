import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  findWSDLForServiceName,
  getJsonForWSDL,
  getSwaggerForService,
  getWSDLServices,
} from 'apiconnect-wsdl';

import * as postman from './postman';
import { convert } from './wsdl';

jest.mock('apiconnect-wsdl', () => ({
  findWSDLForServiceName: jest.fn(),
  getJsonForWSDL: jest.fn(),
  getSwaggerForService: jest.fn(),
  getWSDLServices: jest.fn(),
}));
jest.mock('./postman', () => ({
  convert: jest.fn(),
}));

const mockFindWSDLForServiceName = jest.mocked(findWSDLForServiceName);
const mockGetJsonForWSDL = jest.mocked(getJsonForWSDL);
const mockGetSwaggerForService = jest.mocked(getSwaggerForService);
const mockGetWSDLServices = jest.mocked(getWSDLServices);
const mockPostmanConvert = jest.mocked(postman.convert);

describe('wsdl importer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null for inputs that do not look like WSDL', async () => {
    await expect(convert('<xml />')).resolves.toBeNull();
    expect(mockGetJsonForWSDL).not.toHaveBeenCalled();
  });

  it('converts WSDL files through apiconnect-wsdl and the Postman importer', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const wsdls = [{ filename: 'calculator.wsdl' }];
    const swagger = {
      info: {
        title: 'Calculator',
      },
      consumes: ['text/xml'],
      produces: ['application/xml'],
      paths: {
        '/convert': {
          post: {
            operationId: 'Convert',
            description: 'Convert values',
            parameters: [{
              schema: {
                $ref: '#/definitions/ConvertRequest',
              },
            }],
            'x-ibm-soap': {
              'soap-action': 'urn:Convert',
            },
          },
        },
      },
      definitions: {
        ConvertRequest: {
          example: '<Envelope />',
        },
      },
      'x-ibm-configuration': {
        assembly: {
          execute: [{
            proxy: {
              'target-url': 'https://example.com/soap',
            },
          }],
        },
      },
    };
    const convertedResources = [{ _type: 'request', name: 'Converted request' }];

    mockGetJsonForWSDL.mockResolvedValue(wsdls as never);
    mockGetWSDLServices.mockReturnValue({
      services: [{
        service: 'Calculator',
        filename: 'calculator.wsdl',
      }],
    } as never);
    mockFindWSDLForServiceName.mockReturnValue({ filename: 'calculator.wsdl' } as never);
    mockGetSwaggerForService.mockReturnValue(swagger as never);
    mockPostmanConvert.mockReturnValue(convertedResources as never);

    const result = await convert('<wsdl:definition />');
    const [postmanJson] = mockPostmanConvert.mock.calls[0];
    const parsedPostman = JSON.parse(postmanJson);

    expect(mockGetJsonForWSDL).toHaveBeenCalledWith('<?xml version="1.0" encoding="UTF-8" ?><wsdl:definition />');
    expect(parsedPostman.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.0.0/collection.json');
    expect(parsedPostman.item[0].item[0].request.body.raw).toBe('<Envelope />');
    expect(result).toEqual(convertedResources);

    consoleError.mockRestore();
  });

  it('returns null when WSDL conversion fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    mockGetJsonForWSDL.mockRejectedValue(new Error('invalid wsdl'));

    await expect(convert('<wsdl:definition />')).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
  });
});
