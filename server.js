import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = createServer();
const wss = new WebSocketServer({ server });
const clients = new Map();
const monitors = new Set();
const PORT = 8080;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Фиксированные камеры системы пожаров в разных регионах
const FIXED_CAMERAS = {
    'camera_1': { 
        name: 'Камера 1 - ЯНАО', 
        location: 'Ямало-Ненецкий автономный округ', 
        ip: '',
        coords: [66.1667, 76.6667]
    },
    'camera_2': { 
        name: 'Камера 2 - Мордовия', 
        location: 'Республика Мордовия', 
        ip: '',
        coords: [54.4333, 44.4500]
    },
    'camera_3': { 
        name: 'Камера 3 - Башкортостан', 
        location: 'Республика Башкортостан', 
        ip: '',
        coords: [54.7333, 55.9667]
    },
    'camera_4': { 
        name: 'Камера 4 - Псковская область', 
        location: 'Псковская область', 
        ip: '',
        coords: [57.8167, 28.3333]
    },
    'camera_5': { 
        name: 'Камера 5 - Московская область', 
        location: 'Московская область', 
        ip: '',
        coords: [55.7558, 37.6173]
    }
};

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`📁 Создана папка для загрузок: ${UPLOADS_DIR}`);
}

// Serve static files
server.on('request', (req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        serveFile(res, 'public/index.html', 'text/html');
    } else if (req.url === '/app.js') {
        serveFile(res, 'public/app.js', 'application/javascript');
    } else if (req.url === '/style.css') {
        serveFile(res, 'public/style.css', 'text/css');
    } else if (req.url === '/fire.svg') {
        serveFile(res, 'public/fire.svg', 'image/svg+xml');
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

function serveFile(res, filePath, contentType) {
    const fullPath = path.join(__dirname, filePath);
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}

server.listen(PORT, () => {
    console.log(`🚀 WebSocket сервер запущен на порту ${PORT}`);
    console.log(`📊 Система мониторинга пожаров доступна по http://localhost:${PORT}`);
    console.log('🔥 Ожидаем подключения камер пожарообнаружения:');
    Object.keys(FIXED_CAMERAS).forEach(cameraId => {
        console.log(`   - ${FIXED_CAMERAS[cameraId].name}`);
    });
});

wss.on('connection', function connection(ws, request) {
    const isMonitor = request.headers['user-agent'] && 
                     request.headers['user-agent'].includes('Mozilla');
    
    if (isMonitor) {
        handleMonitorConnection(ws, request);
    } else {
        handleClientConnection(ws, request);
    }
});

function handleClientConnection(ws, request) {
    let clientId = null;
    let cameraInfo = null;
    
    const messageHandler = (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'camera_identify') {
                const requestedCameraId = message.cameraId;
                
                if (FIXED_CAMERAS[requestedCameraId]) {
                    clientId = requestedCameraId;
                    cameraInfo = {
                        ...FIXED_CAMERAS[requestedCameraId],
                        id: clientId,
                        ip: request.socket.remoteAddress.replace('::ffff:', ''), // Очищаем IPv6 префикс
                        connectedAt: new Date().toISOString(),
                        lastActivity: new Date().toISOString(),
                        type: 'camera',
                        status: 'online'
                    };
                    
                    clients.set(clientId, {
                        ...cameraInfo,
                        ws: ws // храним отдельно, не отправляем в мониторинг
                    });
                    
                    console.log(`✅ ${cameraInfo.name} подключилась`);
                    console.log(`📊 Подключенных камер: ${Array.from(clients.values()).filter(c => c.type === 'camera').length}\n`);

                    ws.send(JSON.stringify({
                        type: 'camera_identified',
                        cameraId: clientId,
                        name: cameraInfo.name
                    }));

                    // Отправляем безопасную версию без WebSocket
                    broadcastToMonitors({
                        type: 'camera_connected',
                        camera: cameraInfo // уже без ws
                    });

                    ws.off('message', messageHandler);
                    
                    ws.on('message', (data) => {
                        handleCameraMessage(data, cameraInfo);
                    });
                    
                } else {
                    console.log(`❌ Неизвестная камера пытается подключиться: ${requestedCameraId}`);
                    ws.close();
                }
            }
        } catch (error) {
            // Если не JSON, значит это бинарные данные (фото) - считаем пожаром
            console.log(`🔥 Получено фото от камеры (пожар)`);
            handlePhotoUpload(data, cameraInfo, 'camera_upload', true);
        }
    };
    
    ws.on('message', messageHandler);
    
    setTimeout(() => {
        if (!clientId && ws.readyState === 1) {
            console.log('❌ Таймаут идентификации клиента');
            ws.close();
        }
    }, 10000);

    ws.on('close', function close() {
        if (clientId) {
            clients.delete(clientId);
            console.log(`❌ ${cameraInfo.name} отключилась`);
            console.log(`📊 Осталось камер: ${Array.from(clients.values()).filter(c => c.type === 'camera').length}\n`);
            
            broadcastToMonitors({
                type: 'camera_disconnected',
                cameraId: clientId
            });
        }
    });

    ws.on('error', function error(err) {
        console.error(`💥 Ошибка у клиента ${clientId || 'unknown'}:`, err);
    });
}

function handleCameraMessage(data, cameraInfo) {
    if (!cameraInfo) return;
    
    // Обновляем активность в хранилище
    const storedCamera = clients.get(cameraInfo.id);
    if (storedCamera) {
        storedCamera.lastActivity = new Date().toISOString();
    }
    
    try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'message') {
            console.log(`💬 ${cameraInfo.name}: ${message.text}`);
            
            broadcastToMonitors({
                type: 'camera_message',
                cameraId: cameraInfo.id,
                text: message.text,
                timestamp: new Date().toISOString()
            });
        }
        else if (message.type === 'photo_upload') {
            console.log(`📸 Получено фото от ${cameraInfo.name} ${message.isFire ? '🔥 (ПОЖАР)' : ''}`);
            
            const photoData = Buffer.from(message.photoData, 'base64');
            handlePhotoUpload(photoData, cameraInfo, 'camera_upload', message.isFire);
        }
        
    } catch (error) {
        console.log(`🔥 Получено фото от ${cameraInfo.name} (пожар - старый формат)`);
        handlePhotoUpload(data, cameraInfo, 'camera_upload', true);
    }
}

function handleMonitorConnection(ws, request) {
    monitors.add(ws);
    console.log('📊 Новое подключение мониторинга');
    
    const allCamerasState = Object.keys(FIXED_CAMERAS).map(cameraId => {
        const cameraData = FIXED_CAMERAS[cameraId];
        const connectedCamera = clients.get(cameraId);
        
        if (connectedCamera) {
            // Используем безопасные данные
            return {
                id: cameraId,
                name: cameraData.name,
                location: cameraData.location,
                coords: cameraData.coords,
                status: 'online',
                ip: connectedCamera.ip,
                connectedAt: connectedCamera.connectedAt,
                lastActivity: connectedCamera.lastActivity
            };
        } else {
            return {
                id: cameraId,
                name: cameraData.name,
                location: cameraData.location,
                coords: cameraData.coords,
                status: 'offline',
                ip: '',
                connectedAt: null,
                lastActivity: null
            };
        }
    });

    ws.send(JSON.stringify({
        type: 'initial_state',
        cameras: allCamerasState
    }));

    ws.on('message', function incoming(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'request_photo') {
                requestPhotoFromCamera(message.cameraId);
            }
            
        } catch (error) {
            console.error('Ошибка в сообщении мониторинга:', error);
        }
    });

    ws.on('close', function close() {
        monitors.delete(ws);
        console.log('📊 Отключение мониторинга');
    });

    ws.on('error', function error(err) {
        console.error('💥 Ошибка мониторинга:', err);
        monitors.delete(ws);
    });
}

function handlePhotoUpload(photoData, cameraInfo, uploadType = 'camera_upload', isFire = false) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeCameraId = cameraInfo.id.replace(/[:\/]/g, '_');
    const filename = `photo_${safeCameraId}_${timestamp}.jpg`;
    const filepath = path.join(UPLOADS_DIR, filename);
    
    fs.writeFile(filepath, photoData, (err) => {
        if (err) {
            console.error(`❌ Ошибка сохранения фото от ${cameraInfo.name}:`, err);
        } else {
            const sourceType = uploadType === 'requested' ? 'по запросу' : 'самостоятельно';
            const fireText = isFire ? '🔥 ПОЖАР' : 'обычное';
            console.log(`📸 ${fireText} фото от ${cameraInfo.name} (${sourceType}) сохранено: ${filename} (${photoData.length} байт)`);
            
            const base64Image = photoData.toString('base64');
            broadcastToMonitors({
                type: 'photo_received',
                photoData: base64Image,
                cameraId: cameraInfo.id,
                cameraName: cameraInfo.name,
                filename: filename,
                timestamp: new Date(),
                size: photoData.length,
                uploadType: uploadType,
                isFire: isFire // true - пожар, false - обычное фото
            });
        }
    });
}

function requestPhotoFromCamera(cameraId) {
    const cameraData = clients.get(cameraId);
    if (cameraData && cameraData.ws && cameraData.ws.readyState === 1) {
        console.log(`📸 Запрашиваем фото у ${cameraData.name}...`);
        cameraData.ws.send(JSON.stringify({
            type: 'get_photo'
        }));
        
        broadcastToMonitors({
            type: 'photo_requested',
            cameraId: cameraId,
            cameraName: cameraData.name,
            timestamp: new Date().toISOString()
        });
        
        return true;
    } else {
        console.log(`❌ Камера ${cameraId} не подключена`);
        return false;
    }
}

function getSafeCameraData(cameraId) {
    const cameraData = clients.get(cameraId);
    if (!cameraData) return null;
    
    // Возвращаем безопасный объект без WebSocket
    return {
        id: cameraData.id,
        name: cameraData.name,
        location: cameraData.location,
        coords: cameraData.coords,
        ip: cameraData.ip,
        connectedAt: cameraData.connectedAt,
        lastActivity: cameraData.lastActivity,
        status: 'online',
        type: cameraData.type
    };
}

function broadcastToMonitors(message) {
    const monitorsToRemove = [];
    
    monitors.forEach(monitor => {
        if (monitor.readyState === 1) {
            try {
                // Клонируем сообщение, чтобы избежать циклических ссылок
                const safeMessage = JSON.parse(JSON.stringify(message, (key, value) => {
                    // Исключаем циклические ссылки и неподдерживаемые типы
                    if (key === 'ws' || value instanceof WebSocket) {
                        return undefined;
                    }
                    if (value && typeof value === 'object' && value.constructor.name === 'Socket') {
                        return undefined;
                    }
                    return value;
                }));
                
                monitor.send(JSON.stringify(safeMessage));
            } catch (error) {
                console.error('Ошибка отправки в мониторинг:', error);
                monitorsToRemove.push(monitor);
            }
        } else {
            monitorsToRemove.push(monitor);
        }
    });
    
    monitorsToRemove.forEach(monitor => {
        monitors.delete(monitor);
    });
}