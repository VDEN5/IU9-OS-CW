import { cameraService } from '../services/cameraService.js';
import { authService } from '../services/authService.js';
import { requestPhotoFromCamera, activeCameras } from './cameraHandler.js';
import { WS_MSG } from './messageTypes.js';

export const activeMonitors = new Map();

export async function handleMonitorConnection(ws, request, token) {
  const user = authService.getUserByToken(token);
  if (!user) {
    console.log('📊 Мониторинг без авторизации – отклонён');
    ws.close();
    return;
  }

  activeMonitors.set(ws, user);
  console.log(`📊 Мониторинг подключён: ${user.name} (департамент TIN: ${user.department_tin})`);

  let cameras = [];
  if (user.department_tin) {
    const all = await cameraService.getAllCameras(user.department_tin);
    cameras = all.map(cam => {
      const connected = activeCameras.get(cam.id);
      if (connected) {
        return {
          id: cam.id,
          name: cam.name,
          location: cam.location,
          coords: cam.coords,
          status: 'online',
          ip: connected.info.ip,
          connectedAt: connected.info.connectedAt,
        };
      } else {
        return {
          id: cam.id,
          name: cam.name,
          location: cam.location,
          coords: cam.coords,
          status: 'offline',
          ip: '',
          connectedAt: null,
        };
      }
    });
  }
  ws.send(JSON.stringify({ type: WS_MSG.INITIAL_STATE, cameras }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === WS_MSG.REQUEST_PHOTO) {
        await requestPhotoFromCamera(msg.cameraId);
      }
    } catch (err) {
      console.error('Ошибка в сообщении монитора:', err);
    }
  });

  ws.on('close', () => {
    activeMonitors.delete(ws);
    console.log(`📊 Мониторинг отключён (${user.name})`);
  });
}

export function broadcastToMonitors(message) {
  const cameraId = message.cameraId;
  let cameraDeptTin = null;
  if (cameraId && activeCameras.has(cameraId)) {
    cameraDeptTin = activeCameras.get(cameraId).info.department_tin;
  }
  for (const [monitor, user] of activeMonitors.entries()) {
    if (monitor.readyState === 1) {
      if (user.department_tin && cameraDeptTin && user.department_tin !== cameraDeptTin) {
        continue;
      }
      monitor.send(JSON.stringify(message));
    } else {
      activeMonitors.delete(monitor);
    }
  }
}