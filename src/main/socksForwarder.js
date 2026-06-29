'use strict';

/**
 * SOCKS5 Forwarder
 * Runs as a child process to provide a local, unauthenticated SOCKS5 interface
 * that forwards requests to an upstream SOCKS5 proxy requiring authentication.
 */

const net = require('net');
const { SocksClient } = require('socks');

const proxyConfig = JSON.parse(process.argv[2]);
const localPort = parseInt(process.argv[3]);

const server = net.createServer((clientSocket) => {
  clientSocket.once('data', (data) => {
    // Basic SOCKS5 handshake handling
    if (data[0] !== 0x05) {
      clientSocket.destroy();
      return;
    }

    // Number of methods
    const nMethods = data[1];
    const methods = data.slice(2, 2 + nMethods);

    // Respond with No Authentication Required (0x00)
    clientSocket.write(Buffer.from([0x05, 0x00]));

    clientSocket.once('data', async (requestData) => {
      // SOCKS5 Request
      if (requestData[0] !== 0x05 || requestData[1] !== 0x01) {
        clientSocket.destroy();
        return;
      }

      let host;
      let port;
      let addrLength;

      const atyp = requestData[3];
      if (atyp === 0x01) { // IPv4
        host = requestData.slice(4, 8).join('.');
        port = requestData.readUInt16BE(8);
      } else if (atyp === 0x03) { // Domain
        addrLength = requestData[4];
        host = requestData.slice(5, 5 + addrLength).toString();
        port = requestData.readUInt16BE(5 + addrLength);
      } else if (atyp === 0x04) { // IPv6
        host = requestData.slice(4, 20).toString('hex').match(/.{1,4}/g).join(':');
        port = requestData.readUInt16BE(20);
      }

      try {
        const { socket: upstreamSocket } = await SocksClient.createConnection({
          proxy: {
            host: proxyConfig.host,
            port: proxyConfig.port,
            type: 5,
            userId: proxyConfig.username,
            password: proxyConfig.password
          },
          command: 'connect',
          destination: { host, port }
        });

        // Success response to client
        const response = Buffer.alloc(requestData.length);
        requestData.copy(response);
        response[1] = 0x00; // Success
        clientSocket.write(response);

        // Pipe data
        clientSocket.pipe(upstreamSocket);
        upstreamSocket.pipe(clientSocket);

      } catch (err) {
        // Error response
        const response = Buffer.from([0x05, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        clientSocket.write(response);
        clientSocket.destroy();
      }
    });
  });

  clientSocket.on('error', () => clientSocket.destroy());
});

server.listen(localPort, '127.0.0.1', () => {
  console.log(`SOCKS5 Forwarder listening on 127.0.0.1:${localPort}`);
  // Signal to parent process that we are ready
  if (process.send) process.send('ready');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
