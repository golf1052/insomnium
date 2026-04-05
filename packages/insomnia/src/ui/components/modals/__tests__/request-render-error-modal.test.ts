import { describe, expect, it } from '@jest/globals';

import { init as initRequest, type Request } from '../../../../models/request';
import { RenderError } from '../../../../templating';
import { getRequestRenderErrorDetails } from '../request-render-error-modal';

const createRequest = (text: string): Request => ({
  ...initRequest(),
  _id: 'req_1',
  type: 'Request',
  parentId: 'wrk_1',
  modified: 0,
  created: 0,
  isPrivate: false,
  name: 'Example Request',
  body: {
    text,
  },
});

describe('getRequestRenderErrorDetails', () => {
  it('locates multi-line request fields with JSONPath', () => {
    const error = new RenderError('Invalid tag');
    error.path = 'body.text';
    error.location = {
      line: 3,
      column: 1,
    };

    const details = getRequestRenderErrorDetails(createRequest('line 1\nline 2\n{% tag %}'), error);

    expect(details).toEqual({
      fullPath: 'Request.body.text',
      locationLabel: 'line 3 of',
      template: 'line 1\nline 2\n{% tag %}',
    });
  });

  it('omits the line label for single-line values', () => {
    const error = new RenderError('Invalid tag');
    error.path = 'body.text';
    error.location = {
      line: 1,
      column: 1,
    };

    const details = getRequestRenderErrorDetails(createRequest('{% tag %}'), error);

    expect(details.locationLabel).toBeNull();
  });
});
