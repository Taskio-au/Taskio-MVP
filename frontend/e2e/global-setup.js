'use strict';

const { server: mockServer, PORT: mockPort } = require('./mock-server');
const { server: frontendServer } = require('./frontend-server');

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

module.exports = async () => {
  await listen(mockServer, mockPort);
  await listen(frontendServer, 3100);
  return async () => {
    await Promise.all([close(frontendServer), close(mockServer)]);
  };
};
