import { isRouteErrorResponse } from 'react-router-dom';

const hasStringProperty = <K extends string>(value: unknown, key: K): value is Record<K, string> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string';
};

export const getRouteErrorMessage = (error: unknown) => {
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === 'string') {
      return error.data;
    }

    if (hasStringProperty(error.data, 'message')) {
      return error.data.message;
    }

    return error.statusText || 'Unknown error';
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (hasStringProperty(error, 'message')) {
    return error.message;
  }

  return 'Unknown error';
};

export const getRouteErrorStack = (error: unknown) => {
  if (isRouteErrorResponse(error)) {
    return hasStringProperty(error.data, 'stack') ? error.data.stack : undefined;
  }

  if (error instanceof Error) {
    return error.stack;
  }

  return hasStringProperty(error, 'stack') ? error.stack : undefined;
};
