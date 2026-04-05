import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDatabase = {
  batchModifyDocs: jest.fn(),
  init: jest.fn(),
  withAncestors: jest.fn(),
};

const mockModels = {
  caCertificate: {
    findByParentId: jest.fn(),
  },
  clientCertificate: {
    findByParentId: jest.fn(),
  },
  request: {
    getById: jest.fn(),
    type: 'Request',
  },
  requestGroup: {
    type: 'RequestGroup',
  },
  settings: {
    getOrCreate: jest.fn(),
  },
  types: jest.fn(() => ['Request']),
  workspace: {
    getById: jest.fn(),
    type: 'Workspace',
  },
};

const mockNetwork = {
  responseTransform: jest.fn(),
  sendCurlAndWriteTimeline: jest.fn(),
  tryToInterpolateRequest: jest.fn(),
  tryToTransformRequestWithPlugins: jest.fn(),
};

const mockIsWorkspace = jest.fn();
const mockGetBodyBuffer = jest.fn();

jest.mock('../../common/database', () => ({
  database: mockDatabase,
}));
jest.mock('../../models', () => mockModels);
jest.mock('../../models/response', () => ({
  getBodyBuffer: mockGetBodyBuffer,
}));
jest.mock('../../models/workspace', () => ({
  isWorkspace: mockIsWorkspace,
}));
jest.mock('../../network/network', () => mockNetwork);

import { getSendRequestCallbackMemDb } from '../send-request';

describe('getSendRequestCallbackMemDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabase.batchModifyDocs.mockResolvedValue(undefined);
    mockDatabase.init.mockResolvedValue(undefined);
    mockDatabase.withAncestors.mockResolvedValue([]);
    mockGetBodyBuffer.mockResolvedValue(Buffer.from(''));
    mockIsWorkspace.mockImplementation(model => model.type === 'Workspace');
    mockModels.caCertificate.findByParentId.mockResolvedValue([]);
    mockModels.clientCertificate.findByParentId.mockResolvedValue([]);
    mockModels.request.getById.mockResolvedValue(null);
    mockModels.settings.getOrCreate.mockResolvedValue({ _id: 'settings_1', validateSSL: true });
    mockModels.workspace.getById.mockResolvedValue(null);
    mockNetwork.responseTransform.mockResolvedValue({
      elapsedTime: 0,
      headers: [],
      statusCode: 200,
      statusMessage: 'OK',
    });
    mockNetwork.sendCurlAndWriteTimeline.mockResolvedValue({});
    mockNetwork.tryToInterpolateRequest.mockResolvedValue({
      context: {},
      request: { _id: 'rendered_req_1' },
    });
    mockNetwork.tryToTransformRequestWithPlugins.mockResolvedValue({ _id: 'rendered_req_1' });
  });

  it('initializes the in-memory database with the provided documents', async () => {
    const sendRequest = await getSendRequestCallbackMemDb('env_1', {
      Request: [{ _id: 'req_1', name: 'Example Request' }],
      Workspace: [{ _id: 'wrk_1', name: 'Example Workspace' }],
    }, {
      validateSSL: false,
    });

    expect(typeof sendRequest).toBe('function');
    expect(mockDatabase.init).toHaveBeenCalledTimes(1);
    expect(mockModels.types).toHaveBeenCalled();
    expect(mockDatabase.init.mock.calls[0][1]).toEqual({ inMemoryOnly: true });
    expect(mockDatabase.init.mock.calls[0][2]).toBe(true);
    expect(mockDatabase.init.mock.calls[0][3]).toEqual(expect.any(Function));
    expect(mockDatabase.batchModifyDocs).toHaveBeenCalledWith({
      remove: [],
      upsert: [
        expect.objectContaining({ _id: 'settings_1', validateSSL: false }),
        { _id: 'req_1', name: 'Example Request' },
        { _id: 'wrk_1', name: 'Example Workspace' },
      ],
    });
  });

  it('returns the normalized response shape from the request callback', async () => {
    const request = { _id: 'req_1', name: 'Example Request' };
    const workspace = { _id: 'wrk_1', type: 'Workspace' };
    const settings = { _id: 'settings_1', validateSSL: true };
    const renderedRequest = { _id: 'rendered_req_1', url: 'https://example.com' };

    mockDatabase.withAncestors.mockResolvedValue([workspace]);
    mockGetBodyBuffer.mockResolvedValue(Buffer.from('response body'));
    mockModels.request.getById.mockResolvedValue(request);
    mockModels.settings.getOrCreate.mockResolvedValue(settings);
    mockModels.workspace.getById.mockResolvedValue(workspace);
    mockModels.clientCertificate.findByParentId.mockResolvedValue([{ _id: 'cert_1' }]);
    mockModels.caCertificate.findByParentId.mockResolvedValue([{ _id: 'ca_1' }]);
    mockNetwork.tryToInterpolateRequest.mockResolvedValue({
      context: { workspace: 'insomnium' },
      request: renderedRequest,
    });
    mockNetwork.tryToTransformRequestWithPlugins.mockResolvedValue(renderedRequest);
    mockNetwork.responseTransform.mockResolvedValue({
      elapsedTime: 42,
      headers: [{
        name: 'X-Test',
        value: 'Value',
      }],
      statusCode: 201,
      statusMessage: 'Created',
    });

    const sendRequest = await getSendRequestCallbackMemDb('env_1', {
      Request: [request],
      Workspace: [workspace],
    });
    const result = await sendRequest('req_1');

    expect(mockDatabase.withAncestors).toHaveBeenCalledWith(request, [
      mockModels.request.type,
      mockModels.requestGroup.type,
      mockModels.workspace.type,
    ]);
    expect(mockNetwork.tryToInterpolateRequest).toHaveBeenCalledWith(request, 'env_1', expect.any(String));
    expect(mockNetwork.sendCurlAndWriteTimeline).toHaveBeenCalledWith(
      renderedRequest,
      [{ _id: 'cert_1' }],
      [{ _id: 'ca_1' }],
      settings,
    );
    expect(result).toEqual({
      data: 'response body',
      headers: {
        'x-test': 'Value',
      },
      responseTime: 42,
      status: 201,
      statusMessage: 'Created',
    });
  });
});
