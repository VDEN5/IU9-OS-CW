import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
    testConnection, 
    getCameras, 
    updateCameraStatus, 
    saveEvent,
    getRecentEvents,
    getEventsHistory,
    closeDb,
    checkUser,
    createSession,
    getUserByToken,
    removeSession,
    deleteEvent, 
    pool     ,
    getCameraModels,
    getCameraTypes,
    getAddresses,
    getDepartments,
    getCameraStats     
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = createServer();
const wss = new WebSocketServer({ server });
const clients = new Map(); // Активные камеры
const monitors = new Map(); // Активные мониторы
const PORT = 8081;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

let FIXED_CAMERAS = {};

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`📁 Создана папка для загрузок: ${UPLOADS_DIR}`);
}

// ========== HTTP ОБРАБОТЧИКИ ==========
server.on('request', (req, res) => {
    // CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API для получения истории событий
    if (req.url === '/api/events' && req.method === 'GET') {
        handleGetEvents(req, res);
        return;
    }

    // API для авторизации
    if (req.url === '/api/login' && req.method === 'POST') {
        handleLogin(req, res);
        return;
    }
    
    if (req.url === '/api/check-session' && req.method === 'GET') {
        handleCheckSession(req, res);
        return;
    }
    
    if (req.url === '/api/logout' && req.method === 'POST') {
        handleLogout(req, res);
        return;
    }
        // API для получения информации о моделях камер
    if (req.url === '/api/camera-models' && req.method === 'GET') {
        handleGetCameraModels(req, res);
        return;
    }

    // API для получения информации о типах камер
    if (req.url === '/api/camera-types' && req.method === 'GET') {
        handleGetCameraTypes(req, res);
        return;
    }

    // API для получения информации об адресах
    if (req.url === '/api/addresses' && req.method === 'GET') {
        handleGetAddresses(req, res);
        return;
    }

    // API для получения информации о департаментах
    if (req.url === '/api/departments' && req.method === 'GET') {
        handleGetDepartments(req, res);
        return;
    }

    // API для получения статистики по камерам
    if (req.url === '/api/camera-stats' && req.method === 'GET') {
        handleGetCameraStats(req, res);
        return;
    }

    // Удаление события
    if (req.url.startsWith('/api/events/') && req.method === 'DELETE') {
        handleDeleteEvent(req, res);
        return;
    }
    
    // Статические файлы
    serveStaticFiles(req, res);
});

// ========== ОБРАБОТЧИКИ API ==========

async function handleGetEvents(req, res) {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const cameraId = url.searchParams.get('cameraId');
        const eventType = url.searchParams.get('type');
        const isFire = url.searchParams.get('fire') === 'true';
        
        const events = await getEventsHistory({
            limit,
            cameraId,
            eventType,
            isFire: url.searchParams.has('fire') ? isFire : null
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, events }));
    } catch (error) {
        console.error('❌ Ошибка получения событий:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
    }
}



async function handleLogin(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const { login, password } = JSON.parse(body);
            console.log(`🔐 Попытка входа: ${login}`);
            
            const user = await checkUser(login, password);
            
            if (user) {
                // Получаем department_tin по названию департамента
                let departmentTin = null;
                if (user.department) {
                    try {
                        const deptRes = await pool.query('SELECT taxpayerindividualnumber FROM department WHERE name = $1', [user.department]);
                        if (deptRes.rows[0]) {
                            departmentTin = deptRes.rows[0].taxpayerindividualnumber;
                            console.log(`📌 Департамент пользователя: ${user.department} (TIN: ${departmentTin})`);
                        } else {
                            console.log(`⚠️ Департамент "${user.department}" не найден в таблице department`);
                        }
                    } catch (err) {
                        console.error('Ошибка получения department_tin:', err);
                    }
                }
                
                const sessionUser = { 
                    ...user, 
                    department_tin: departmentTin 
                };
                const token = createSession(sessionUser);
                
                console.log(`✅ Успешный вход: ${user.name} (департамент: ${user.department || 'не указан'}, TIN: ${departmentTin || 'нет'})`);
                
                // Сохраняем событие входа
                await saveEvent('system', 'system', {
                    message: `Пользователь ${user.name} вошел в систему`,
                    isFire: false
                });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    user: {
                        name: user.name,
                        position: user.position,
                        department: user.department
                    },
                    token: token
                }));
            } else {
                console.log(`❌ Неудачная попытка входа: ${login}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Неверный логин или пароль' 
                }));
            }
        } catch (error) {
            console.error('❌ Ошибка при входе:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка запроса' }));
        }
    });
}

function handleCheckSession(req, res) {
    const token = req.headers['x-auth-token'];
    const user = getUserByToken(token);
    
    if (user) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            success: true, 
            user: {
                name: user.name,
                position: user.position
            }
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
    }
}

function handleLogout(req, res) {
    const token = req.headers['x-auth-token'];
    const user = getUserByToken(token);
    
    if (token) {
        if (user) {
            // Сохраняем событие выхода
            saveEvent('system', 'system', {
                message: `Пользователь ${user.name} вышел из системы`,
                isFire: false
            }).catch(console.error);
        }
        removeSession(token);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
}

async function handleDeleteEvent(req, res) {
    const token = req.headers['x-auth-token'];
    const user = getUserByToken(token);
    if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Не авторизован' }));
        return;
    }
    
    const eventId = req.url.split('/').pop();
    if (!eventId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'ID события не указан' }));
        return;
    }
    
    try {
        const eventIdNum = parseInt(eventId);
        if (isNaN(eventIdNum)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Неверный ID события' }));
            return;
        }
        
        console.log(`🔍 Попытка удаления события ${eventIdNum} пользователем ${user.name}`);
        
        // Получаем событие
        const eventResult = await pool.query('SELECT camera_id FROM camera_events WHERE id = $1::BIGINT', [eventIdNum]);
        
        if (eventResult.rows.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Событие не найдено' }));
            return;
        }
        
        const eventCameraId = eventResult.rows[0].camera_id;
        console.log(`📋 Событие ${eventIdNum} привязано к камере: ${eventCameraId || 'системное'}`);
        
        // Проверка прав:
        // 1. Если событие системное (camera_id IS NULL) - разрешаем удалять ТОЛЬКО администраторам
        // 2. Если событие привязано к камере - проверяем, что камера принадлежит департаменту пользователя
        let hasPermission = false;
        
        if (eventCameraId === null) {
            // Системное событие - разрешаем только администраторам
            // Проверяем, есть ли у пользователя роль admin или position содержит "Admin"
            if (user.login === 'admin' || (user.position && user.position.includes('Admin'))) {
                hasPermission = true;
                console.log(`✅ Пользователь ${user.name} имеет право удалять системные события`);
            } else {
                console.log(`❌ Пользователь ${user.name} не имеет права удалять системные события`);
            }
        } else {
            // Проверяем принадлежность камеры департаменту пользователя
            const cameraCheck = await pool.query(
                'SELECT department_tin FROM cameras WHERE id = $1::VARCHAR',
                [eventCameraId]
            );
            if (cameraCheck.rows.length > 0) {
                const cameraDeptTin = cameraCheck.rows[0].department_tin;
                console.log(`📌 Департамент камеры: ${cameraDeptTin}, Департамент пользователя: ${user.department_tin}`);
                hasPermission = (user.department_tin === cameraDeptTin);
            }
        }
        
        if (!hasPermission) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Нет прав на удаление этого события' }));
            return;
        }
        
        const deleted = await deleteEvent(eventIdNum);
        if (deleted) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Событие не найдено' }));
        }
    } catch (err) {
        console.error('Ошибка удаления события:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
    }
}

async function handleGetCameraModels(req, res) {
    try {
        const models = await getCameraModels();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, models }));
    } catch (error) {
        console.error('❌ Ошибка получения моделей камер:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
    }
}

async function handleGetCameraTypes(req, res) {
    try {
        const types = await getCameraTypes();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, types }));
    } catch (error) {
        console.error('❌ Ошибка получения типов камер:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
    }
}

async function handleGetAddresses(req, res) {
    try {
        const addresses = await getAddresses();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, addresses }));
    } catch (error) {
        console.error('❌ Ошибка получения адресов:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
    }
}

async function handleGetDepartments(req, res) {
    try {
        const departments = await getDepartments();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, departments }));
    } catch (error) {
        console.error('❌ Ошибка получения департаментов:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
    }
}

async function handleGetCameraStats(req, res) {
    try {
        const stats = await getCameraStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, stats }));
    } catch (error) {
        console.error('❌ Ошибка получения статистики камер:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
    }
}

function serveStaticFiles(req, res) {
    if (req.url === '/' || req.url === '/index.html') {
        serveFile(res, 'public/index.html', 'text/html');
    } else if (req.url === '/login-modal.html') {
        serveFile(res, 'public/login-modal.html', 'text/html');
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
}

function serveFile(res, filePath, contentType) {
    const fullPath = path.join(__dirname, filePath);
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            console.error(`❌ Файл не найден: ${filePath}`);
            res.writeHead(404);
            res.end('Not found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}

// ========== ЗАГРУЗКА КАМЕР ИЗ БД ==========
async function loadCamerasFromDB() {
    console.log('🔄 Загрузка камер из PostgreSQL...');
    try {
        FIXED_CAMERAS = await getCameras(); // Без параметра - все камеры
        
        const count = Object.keys(FIXED_CAMERAS).length;
        if (count > 0) {
            console.log(`✅ Загружено ${count} камер из БД:`);
            Object.keys(FIXED_CAMERAS).forEach(cameraId => {
                console.log(`   - ${FIXED_CAMERAS[cameraId].name} (департамент: ${FIXED_CAMERAS[cameraId].department || 'не указан'})`);
            });
        } else {
            console.log('⚠️ В БД нет камер! Используем заглушки.');
            FIXED_CAMERAS = {
                'camera_1': { 
                    name: 'Camera 1 - Yamal', 
                    location: 'Yamalo-Nenets Autonomous Okrug', 
                    ip: '', 
                    coords: [66.1667, 76.6667],
                    department_tin: null
                },
                'camera_2': { 
                    name: 'Camera 2 - Mordovia', 
                    location: 'Republic of Mordovia', 
                    ip: '', 
                    coords: [54.4333, 44.4500],
                    department_tin: null
                },
                'camera_3': { 
                    name: 'Camera 3 - Bashkortostan', 
                    location: 'Republic of Bashkortostan', 
                    ip: '', 
                    coords: [54.7333, 55.9667],
                    department_tin: null
                },
                'camera_4': { 
                    name: 'Camera 4 - Pskov', 
                    location: 'Pskov Oblast', 
                    ip: '', 
                    coords: [57.8167, 28.3333],
                    department_tin: null
                },
                'camera_5': { 
                    name: 'Camera 5 - Moscow', 
                    location: 'Moscow Oblast', 
                    ip: '', 
                    coords: [55.7558, 37.6173],
                    department_tin: null
                }
            };
        }
    } catch (err) {
        console.error('❌ Ошибка загрузки камер:', err);
        FIXED_CAMERAS = {};
    }
}

// ========== ЗАПУСК СЕРВЕРА ==========
server.listen(PORT, async () => {
    console.log(`🚀 Запуск сервера на порту ${PORT}...`);
    
    const dbConnected = await testConnection();
    
    if (dbConnected) {
        await loadCamerasFromDB();
        
        // Загружаем последние события при старте
        const recentEvents = await getRecentEvents(5);
        console.log(`📊 Последние события в БД:`);
        recentEvents.forEach(event => {
            console.log(`   [${new Date(event.created_at).toLocaleTimeString()}] ${event.event_type}: ${event.message || ''}`);
        });
    } else {
        console.log('⚠️ Не удалось подключиться к БД.');
    }
    
    console.log(`📊 Система мониторинга доступна по http://localhost:${PORT}`);
});

// ========== WEBSOCKET ОБРАБОТКА ==========
wss.on('connection', function connection(ws, request) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    
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
                    
                    const ip = request.socket.remoteAddress.replace('::ffff:', '');
                    
                    // Обновляем статус в БД
                    updateCameraStatus(clientId, 'online', ip);
                    
                    // Сохраняем событие подключения в БД
                    saveEvent(clientId, 'connection', {
                        message: `Камера подключилась с IP ${ip}`,
                        isFire: false
                    });
                    
                    cameraInfo = {
                        ...FIXED_CAMERAS[requestedCameraId],
                        id: clientId,
                        ip: ip,
                        connectedAt: new Date().toISOString(),
                        lastActivity: new Date().toISOString(),
                        type: 'camera',
                        status: 'online',
                        department_tin: FIXED_CAMERAS[requestedCameraId].department_tin
                    };
                    
                    clients.set(clientId, {
                        ...cameraInfo,
                        ws: ws
                    });
                    
                    console.log(`✅ ${cameraInfo.name} подключилась`);
                    console.log(`📊 Подключенных камер: ${Array.from(clients.values()).filter(c => c.type === 'camera').length}\n`);

                    ws.send(JSON.stringify({
                        type: 'camera_identified',
                        cameraId: clientId,
                        name: cameraInfo.name
                    }));

                    broadcastToMonitors({
                        type: 'camera_connected',
                        camera: cameraInfo
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
            // Если это не JSON, значит это фото (бинарные данные)
            console.log(`📸 Получено фото от камеры`);
            if (cameraInfo) {
                handlePhotoUpload(data, cameraInfo, 'camera_upload', true);
            }
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
            // Обновляем статус в БД
            updateCameraStatus(clientId, 'offline');
            
            // Сохраняем событие отключения в БД
            saveEvent(clientId, 'disconnection', {
                message: `Камера отключилась`,
                isFire: false
            });
            
            clients.delete(clientId);
            console.log(`❌ ${cameraInfo?.name || clientId} отключилась`);
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
    
    const storedCamera = clients.get(cameraInfo.id);
    if (storedCamera) {
        storedCamera.lastActivity = new Date().toISOString();
    }
    
    try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'message') {
            console.log(`💬 ${cameraInfo.name}: ${message.text}`);
            
            // Сохраняем сообщение в БД
            saveEvent(cameraInfo.id, 'message', {
                message: message.text,
                isFire: false
            });
            
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
        // Если это не JSON, значит это бинарные данные фото
        console.log(`🔥 Получено фото от ${cameraInfo.name} (пожар - старый формат)`);
        handlePhotoUpload(data, cameraInfo, 'camera_upload', true);
    }
}

async function handleMonitorConnection(ws, request) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    let user = null;
    if (token) user = getUserByToken(token);
    
    if (!user) {
        console.log('📊 Попытка подключения мониторинга без авторизации - отклонено');
        ws.close();
        return;
    }
    
    ws.user = user;
    monitors.set(ws, user);
    console.log(`📊 Мониторинг подключен: ${user.name} (департамент: ${user.department || 'не указан'}, TIN: ${user.department_tin || 'нет'})`);
    
    // Загружаем камеры ТОЛЬКО его департамента
    let allCamerasState = [];
    
    if (user.department_tin) {
        // Фильтруем камеры по TIN департамента
        const camerasObj = await getCameras(user.department_tin);
        allCamerasState = Object.keys(camerasObj).map(cameraId => {
            const cameraData = camerasObj[cameraId];
            const connectedCamera = clients.get(cameraId);
            if (connectedCamera) {
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
        console.log(`📷 Пользователь ${user.name} видит ${allCamerasState.length} камер своего департамента`);
    } else {
        console.log(`⚠️ У пользователя ${user.name} нет привязанного департамента, камеры не отображаются`);
    }

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
        const user = monitors.get(ws);
        monitors.delete(ws);
        console.log(`📊 Отключение мониторинга (${user?.name || 'unknown'})`);
    });
}

function handlePhotoUpload(photoData, cameraInfo, uploadType = 'camera_upload', isFire = false) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeCameraId = cameraInfo.id.replace(/[:\/]/g, '_');
    const filename = `${isFire ? 'FIRE_' : 'photo_'}${safeCameraId}_${timestamp}.jpg`;
    const filepath = path.join(UPLOADS_DIR, filename);
    
    // Сохраняем файл
    fs.writeFile(filepath, photoData, async (err) => {
        if (err) {
            console.error(`❌ Ошибка сохранения фото от ${cameraInfo.name}:`, err);
        } else {
            const sourceType = uploadType === 'requested' ? 'по запросу' : 'авто';
            const fireText = isFire ? '🔥 ПОЖАР' : 'обычное';
            console.log(`📸 ${fireText} фото от ${cameraInfo.name} (${sourceType}) сохранено: ${filename} (${photoData.length} байт)`);
            
            const base64Image = photoData.toString('base64');
            
            // Сохраняем событие в БД с фото
            const eventType = isFire ? 'fire' : 'photo_upload';
            await saveEvent(cameraInfo.id, eventType, {
                message: isFire ? '🔥 ОБНАРУЖЕН ПОЖАР!' : 'Получено фото с камеры',
                photoData: base64Image,
                isFire: isFire
            });
            
            // Отправляем мониторам
            broadcastToMonitors({
                type: 'photo_received',
                photoData: base64Image,
                cameraId: cameraInfo.id,
                cameraName: cameraInfo.name,
                filename: filename,
                timestamp: new Date(),
                size: photoData.length,
                uploadType: uploadType,
                isFire: isFire
            });
        }
    });
}

function requestPhotoFromCamera(cameraId) {
    const cameraData = clients.get(cameraId);
    if (cameraData && cameraData.ws && cameraData.ws.readyState === 1) {
        console.log(`📸 Запрашиваем фото у ${cameraData.name}...`);
        
        // Сохраняем событие запроса в БД
        saveEvent(cameraId, 'photo_request', {
            message: 'Запрошено фото с камеры',
            isFire: false
        });
        
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

function broadcastToMonitors(message) {
    const monitorsToRemove = [];
    const cameraId = message.cameraId;
    let cameraDepartmentTin = null;
    if (cameraId) {
        const camera = clients.get(cameraId);
        if (camera && camera.department_tin) {
            cameraDepartmentTin = camera.department_tin;
        }
    }
    
    monitors.forEach((user, monitor) => {
        if (monitor.readyState === 1) {
            // Фильтр по департаменту
            if (user && user.department_tin && cameraDepartmentTin && user.department_tin !== cameraDepartmentTin) {
                return;
            }
            try {
                monitor.send(JSON.stringify(createSafeMessage(message)));
            } catch (error) {
                monitorsToRemove.push(monitor);
            }
        } else {
            monitorsToRemove.push(monitor);
        }
    });
    monitorsToRemove.forEach(monitor => monitors.delete(monitor));
}

function createSafeMessage(message) {
    const seen = new WeakSet();
    
    return JSON.parse(JSON.stringify(message, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return undefined;
            }
            seen.add(value);
        }
        return value;
    }));
}

// ========== ЗАВЕРШЕНИЕ РАБОТЫ ==========
process.on('SIGINT', async () => {
    console.log('\n🛑 Завершение работы...');
    await saveEvent('system', 'system', {
        message: 'Сервер мониторинга остановлен',
        isFire: false
    }).catch(console.error);
    await closeDb();
    process.exit();
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Завершение работы...');
    await saveEvent('system', 'system', {
        message: 'Сервер мониторинга остановлен',
        isFire: false
    }).catch(console.error);
    await closeDb();
    process.exit();
});