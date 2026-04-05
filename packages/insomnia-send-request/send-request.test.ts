import { describe, expect, it, jest } from '@jest/globals';

const mockGetSendRequestCallbackMemDb = jest.fn();

jest.mock('../insomnia/src/common/send-request', () => ({
  getSendRequestCallbackMemDb: mockGetSendRequestCallbackMemDb,
}));

import { getSendRequestCallbackMemDb } from '../insomnia/send-request';

describe('insomnia-send-request package', () => {
  it('re-exports the send-request callback helper', () => {
    expect(getSendRequestCallbackMemDb).toBe(mockGetSendRequestCallbackMemDb);
  });
});
