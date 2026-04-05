import { afterEach, describe, expect, it } from '@jest/globals';
import { createServer, type IncomingHttpHeaders, type Server } from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

import { startWebSocketServer } from './websocket';

let server: Server | null = null;
const sockets: WebSocket[] = [];

const listen = async () => {
  server = createServer();
  startWebSocketServer(server);

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => resolve());
  });

  return (server.address() as AddressInfo).port;
};

const trackSocket = (socket: WebSocket) => {
  sockets.push(socket);
  return socket;
};

afterEach(async () => {
  await Promise.all(sockets.splice(0).map(socket => new Promise<void>(resolve => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    socket.once('close', () => resolve());
    socket.terminate();
  })));

  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server!.close(error => error ? reject(error) : resolve());
  });
  server = null;
});

describe('startWebSocketServer', () => {
  it('sets the cookie header for the cookie test route', async () => {
    const port = await listen();
    const socket = trackSocket(new WebSocket(`ws://127.0.0.1:${port}/cookies`, 'chat'));

    const [headers] = await Promise.all([
      new Promise<IncomingHttpHeaders>((resolve, reject) => {
        socket.once('upgrade', response => resolve(response.headers));
        socket.once('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', reject);
      }),
    ]);

    expect(headers['set-cookie']).toEqual(
      expect.arrayContaining(['insomnia-websocket-test-cookie=foo']),
    );
  });

  it('returns the binary response sequence used by the websocket smoke tests', async () => {
    const port = await listen();
    const socket = trackSocket(new WebSocket(`ws://127.0.0.1:${port}/binary`, 'chat'));

    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });

    const messagesPromise = new Promise<Array<{ data: string; isBinary: boolean }>>((resolve, reject) => {
      const messages: Array<{ data: string; isBinary: boolean }> = [];

      socket.on('message', (data, isBinary) => {
        messages.push({
          data: data.toString(),
          isBinary,
        });

        if (messages.length === 4) {
          resolve(messages);
        }
      });
      socket.once('error', reject);
    });

    socket.send('hello');

    await expect(messagesPromise).resolves.toEqual([
      { data: '', isBinary: true },
      { data: 'test', isBinary: true },
      { data: 'hello', isBinary: true },
      { data: 'hello', isBinary: false },
    ]);
  });

  it('closes the socket with the expected protocol error for invalid messages', async () => {
    const port = await listen();
    const socket = trackSocket(new WebSocket(`ws://127.0.0.1:${port}/`, 'chat'));

    const close = new Promise<{ code: number; reason: string }>((resolve, reject) => {
      socket.once('open', () => {
        socket.send('close');
      });
      socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
      socket.once('error', reject);
    });

    await expect(close).resolves.toEqual({
      code: 1003,
      reason: 'Invalid message type',
    });
  });
});
