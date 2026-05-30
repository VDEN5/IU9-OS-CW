import { cameraService } from '../services/cameraService.js';
import { eventService } from '../services/eventService.js';
import { broadcastToMonitors } from './monitorHandler.js';
import { WS_MSG } from './messageTypes.js';
import { savePhotoFile } from '../utils/fileUtils.js';

export const activeCameras = new Map(); 

export async function handleCameraConnection(ws, request) {
  let clientId = null;
  let cameraInfo = null;

  const identifyHandler = async (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === WS_MSG.CAMERA_IDENTIFY) {
        const requestedId = message.cameraId;
        const allCameras = await cameraService.getAllCameras(); 
        const cameraDb = allCameras.find(c => c.id === requestedId);
        if (!cameraDb) {
          console.log(`❌ Неизвестная камера: ${requestedId}`);
          ws.close();
          return;
        }

        clientId = requestedId;
        const ip = request.socket.remoteAddress.replace('::ffff:', '');
        await cameraService.updateStatus(clientId, 'online', ip);

        await eventService.saveEvent(clientId, 'connection', {
          message: `Камера подключилась с IP ${ip}`,
        });

        cameraInfo = {
          id: clientId,
          name: cameraDb.name,
          location: cameraDb.location,
          coords: cameraDb.coords,
          ip: ip,
          connectedAt: new Date().toISOString(),
          status: 'online',
          department_tin: cameraDb.department_tin,
        };

        activeCameras.set(clientId, { ws, info: cameraInfo });

        console.log(`✅ ${cameraInfo.name} подключилась`);

        ws.send(JSON.stringify({
          type: WS_MSG.CAMERA_IDENTIFIED,
          cameraId: clientId,
          name: cameraInfo.name,
        }));

        broadcastToMonitors({
          type: WS_MSG.CAMERA_CONNECTED,
          camera: cameraInfo,
        });

        ws.removeListener('message', identifyHandler);
        ws.on('message', (msg) => handleCameraMessage(msg, cameraInfo));
      }
    } catch (err) {
    }
  };

  ws.on('message', identifyHandler);

  setTimeout(() => {
    if (!clientId && ws.readyState === 1) {
      console.log('❌ Таймаут идентификации камеры');
      ws.close();
    }
  }, 10000);

  ws.on('close', async () => {
    if (clientId) {
      await cameraService.updateStatus(clientId, 'offline');
      await eventService.saveEvent(clientId, 'disconnection', { message: 'Камера отключилась' });
      activeCameras.delete(clientId);
      console.log(`❌ ${cameraInfo?.name || clientId} отключилась`);
      broadcastToMonitors({
        type: WS_MSG.CAMERA_DISCONNECTED,
        cameraId: clientId,
      });
    }
  });
}

async function handleCameraMessage(data, cameraInfo) {
  if (!cameraInfo) return;
  try {
    const message = JSON.parse(data.toString());
    if (message.type === WS_MSG.MESSAGE) {
      console.log(`💬 ${cameraInfo.name}: ${message.text}`);
      await eventService.saveEvent(cameraInfo.id, 'message', { message: message.text });
      broadcastToMonitors({
        type: WS_MSG.CAMERA_MESSAGE,
        cameraId: cameraInfo.id,
        text: message.text,
        timestamp: new Date().toISOString(),
      });
    } else if (message.type === WS_MSG.PHOTO_UPLOAD) {
      const photoBuffer = Buffer.from(message.photoData, 'base64');
      await processPhoto(photoBuffer, cameraInfo, message.isFire);
    }
  } catch (err) {
    if (data instanceof Buffer) {
      await processPhoto(data, cameraInfo, true);
    }
  }
}

async function processPhoto(photoBuffer, cameraInfo, isFire) {
  console.log(`📸 Фото от ${cameraInfo.name} ${isFire ? '🔥 ПОЖАР' : ''}`);
  const filename = await savePhotoFile(photoBuffer, cameraInfo.id, isFire);
  const base64 = photoBuffer.toString('base64');
  const eventType = isFire ? 'fire' : 'photo_upload';
  await eventService.saveEvent(cameraInfo.id, eventType, {
    message: isFire ? '🔥 ОБНАРУЖЕН ПОЖАР!' : 'Получено фото с камеры',
    photoData: base64,
    isFire,
  });
  broadcastToMonitors({
    type: WS_MSG.PHOTO_RECEIVED,
    photoData: base64,
    cameraId: cameraInfo.id,
    cameraName: cameraInfo.name,
    filename,
    timestamp: new Date(),
    size: photoBuffer.length,
    isFire,
  });
}

export async function requestPhotoFromCamera(cameraId) {
  const entry = activeCameras.get(cameraId);
  if (entry && entry.ws.readyState === 1) {
    console.log(`📸 Запрос фото у ${entry.info.name}`);
    await eventService.saveEvent(cameraId, 'photo_request', { message: 'Запрошено фото' });
    entry.ws.send(JSON.stringify({ type: WS_MSG.GET_PHOTO }));
    broadcastToMonitors({
      type: WS_MSG.PHOTO_REQUESTED,
      cameraId,
      cameraName: entry.info.name,
      timestamp: new Date().toISOString(),
    });
    return true;
  }
  return false;
}