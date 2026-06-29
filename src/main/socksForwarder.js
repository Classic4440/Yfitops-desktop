'use strict';

/**
 * SOCKS5 Forwarder
 * Robust SOCKS5 forwarder spawning a local HTTP proxy to bridge auth.
 */

const { spawn } = require('child_process');

async function startSocksForwarder(proxyConfig) {
  const { host, port, username, password } = proxyConfig;
  const socksUrl = `socks5://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
  
  const localPort = await getPort();

  const child = spawn(process.execPath, [
    '-e',
    `
      const http = require('http');
      const { SocksProxyAgent } = require('socks-proxy-agent');
      const agent = new SocksProxyAgent('${socksUrl}');

      const server = http.createServer((req, res) => {
        res.writeHead(405);
        res.end();
      });

      server.on('connect', (req, clientSocket, head) => {
        const target = req.url;
        const [host, port] = target.split(':');
        agent.connect({
          host,
          port: parseInt(port, 10),
        }, (err, socket) => {
          if (err) {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\\r\\n\\r\\n');
            clientSocket.end();
            return;
          }
          clientSocket.write('HTTP/1.1 200 Connection Established\\r\\n\\r\\n');
          socket.pipe(clientSocket);
          clientSocket.pipe(socket);
          if (head && head.length) socket.write(head);
        });
      });

      server.listen(${localPort}, '127.0.0.1', () => {
        console.log('SOCKS5 forwarder listening on port ${localPort}');
      });
    `
  ]);

  return { port: localPort, child };
}

module.exports = { startSocksForwarder };
