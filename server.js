import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = createServer();
const wss = new WebSocketServer({ server });
const clients = new Map();
const PORT = 8080;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`📁 Создана папка для загрузок: ${UPLOADS_DIR}`);
}

server.listen(PORT, () => {
    console.log(`🚀 WebSocket сервер запущен на порту ${PORT}`);
    console.log('Ожидание подключений...\n');
});

wss.on('connection', function connection(ws, request) {
    const clientId = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
    clients.set(clientId, ws);
    
    console.log(`✅ Клиент подключился: ${clientId}`);
    console.log(`📊 Всего подключенных клиентов: ${clients.size}\n`);

    ws.on('message', function incoming(data) {
        try {
            if (data instanceof Buffer) {
                // Это фото - сразу сохраняем
                handlePhotoUpload(data, clientId);
                return;
            }
            
            const message = JSON.parse(data);
            
            if (message.type === 'message') {
                console.log(`💬 ${clientId}: ${message.text}`);
            }
            
        } catch (error) {
            console.error(`❌ Ошибка от ${clientId}:`, error);
        }
    });

    ws.on('close', function close() {
        clients.delete(clientId);
        console.log(`❌ Клиент отключился: ${clientId}`);
        console.log(`📊 Осталось клиентов: ${clients.size}\n`);
    });

    ws.on('error', function error(err) {
        console.error(`💥 Ошибка у клиента ${clientId}:`, err);
    });
});

function handlePhotoUpload(photoData, clientId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeClientId = clientId.replace(/[:\/]/g, '_');
    const filename = `photo_${safeClientId}_${timestamp}.jpg`;
    const filepath = path.join(UPLOADS_DIR, filename);
    
    // Просто сохраняем фото без лишних проверок
    fs.writeFile(filepath, photoData, (err) => {
        if (err) {
            console.error(`❌ Ошибка сохранения фото от ${clientId}:`, err);
        } else {
            console.log(`✅ Фото от ${clientId} сохранено: ${filename} (${photoData.length} байт)`);
        }
    });
}

function requestPhotoFromClient(clientId) {
    const client = clients.get(clientId);
    if (client && client.readyState === 1) {
        console.log(`📸 Запрашиваем фото у ${clientId}...`);
        client.send(JSON.stringify({
            type: 'get_photo'
        }));
        return true;
    } else {
        console.log(`❌ Клиент ${clientId} не подключен`);
        return false;
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function handleServerCommand(input) {
    const [command, ...args] = input.trim().split(' ');
    const text = args.join(' ');

    switch (command) {
        case 'getphoto':
            if (args.length > 0) {
                const clientId = args[0];
                requestPhotoFromClient(clientId);
            } else {
                console.log('❌ Использование: getphoto <client_id>');
                console.log('📋 Доступные клиенты:');
                clients.forEach((ws, clientId) => {
                    console.log(`  - ${clientId}`);
                });
            }
            break;
            
        case 'list':
            console.log('📋 Подключенные клиенты:');
            clients.forEach((ws, clientId) => {
                const status = ws.readyState === 1 ? 'online' : 'offline';
                console.log(`  - ${clientId} (${status})`);
            });
            break;
            
        case 'send':
            if (text) {
                console.log(`📢 Отправляю всем: "${text}"`);
                clients.forEach((client) => {
                    if (client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'message',
                            text: text
                        }));
                    }
                });
            }
            break;
            
        case 'help':
            console.log(`
Команды сервера:
  getphoto <client_id> - запросить фото у клиента
  list                - список клиентов
  send <сообщение>    - отправить сообщение всем
  help                - справка
  exit                - выход
            `);
            break;
            
        case 'exit':
            console.log('Завершение работы...');
            clients.forEach((client) => client.close());
            server.close();
            process.exit(0);
            break;
            
        default:
            console.log('❌ Неизвестная команда');
    }
}

rl.on('line', (input) => {
    handleServerCommand(input);
});

console.log('💡 Введите "help" для просмотра команд\n');