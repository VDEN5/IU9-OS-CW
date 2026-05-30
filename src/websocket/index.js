import { WebSocketServer } from 'ws';
import { handleCameraConnection } from './cameraHandler.js';
import { handleMonitorConnection } from './monitorHandler.js';

export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    const isMonitor = request.headers['user-agent']?.includes('Mozilla');

    if (isMonitor) {
      handleMonitorConnection(ws, request, token);
    } else {
      handleCameraConnection(ws, request);
    }
  });

  console.log('🔌 WebSocket сервер готов');
  return wss;
}