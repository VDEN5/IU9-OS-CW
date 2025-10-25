import WebSocket from 'ws';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CameraClient {
    constructor(url = 'ws://localhost:8080', cameraId = 'camera_1') {
        this.url = url;
        this.cameraId = cameraId;
        this.cameraName = '';
        this.ws = null;
        this.isConnected = false;
        this.isIdentified = false;
        this.photosDir = path.join(__dirname, 'client_photos');
        
        if (!fs.existsSync(this.photosDir)) {
            fs.mkdirSync(this.photosDir, { recursive: true });
            console.log(`📁 Папка для фото: ${this.photosDir}`);
        }
        
        this.setupReadline();
        this.connect();
    }

    connect() {
        console.log(`🔗 Подключаемся к ${this.url} как ${this.cameraId}...`);
        
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
            this.isConnected = true;
            console.log('✅ Подключение установлено!');
            
            // Идентифицируемся как камера
            this.ws.send(JSON.stringify({
                type: 'camera_identify',
                cameraId: this.cameraId
            }));
            console.log(`📷 Идентифицируемся как ${this.cameraId}...`);
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                if (message.type === 'camera_identified') {
                    this.isIdentified = true;
                    this.cameraName = message.name;
                    console.log(`✅ Идентификация успешна: ${this.cameraName}`);
                    this.checkPhotos();
                }
                else if (message.type === 'get_photo') {
                    console.log('📸 Сервер запросил фото');
                    this.sendLatestPhoto(false);
                }
                else if (message.type === 'message') {
                    console.log(`📨 Сервер: ${message.text}`);
                }
            } catch (error) {
                // Игнорируем бинарные данные (фото)
            }
        });

        this.ws.on('close', () => {
            this.isConnected = false;
            this.isIdentified = false;
            console.log('❌ Соединение закрыто');
        });

        this.ws.on('error', (error) => {
            console.log('💥 Ошибка:', error.message);
        });
    }

    checkPhotos() {
        try {
            const files = fs.readdirSync(this.photosDir);
            const imageFiles = files.filter(file => 
                /\.(jpg|jpeg|png|gif|bmp)$/i.test(file)
            );

            if (imageFiles.length > 0) {
                console.log(`📸 Найдено фото: ${imageFiles.length} файлов`);
                this.listPhotos();
            } else {
                console.log('❌ В папке нет фото');
            }
        } catch (error) {
            console.log('❌ Ошибка чтения папки');
        }
    }

    listPhotos() {
        try {
            const files = fs.readdirSync(this.photosDir);
            const imageFiles = files
                .filter(file => /\.(jpg|jpeg|png|gif|bmp)$/i.test(file))
                .map(file => {
                    const filePath = path.join(this.photosDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        size: stats.size,
                        mtime: stats.mtime
                    };
                })
                .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

            console.log('');
            imageFiles.forEach((file, index) => {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                console.log(`   ${index + 1}. ${file.name} (${sizeMB} MB)`);
            });
            console.log('');
        } catch (error) {
            console.log('❌ Ошибка получения списка');
        }
    }

    sendMessage(text) {
        if (!this.isConnected || !this.isIdentified) {
            console.log('❌ Нет подключения или не идентифицированы');
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'message',
            text: text
        }));
        console.log(`💬 Отправлено: ${text}`);
    }

    sendLatestPhoto(withFire) {
        this.sendPhotoByIndex(0, withFire);
    }

    sendPhotoByIndex(index, withFire) {
        if (!this.isConnected || !this.isIdentified) {
            console.log('❌ Нет подключения или не идентифицированы');
            return;
        }
    
        try {
            const files = fs.readdirSync(this.photosDir);
            const imageFiles = files
                .filter(file => /\.(jpg|jpeg|png|gif|bmp)$/i.test(file))
                .map(file => {
                    const filePath = path.join(this.photosDir, file);
                    return {
                        name: file,
                        path: filePath
                    };
                })
                .sort((a, b) => {
                    const statA = fs.statSync(a.path);
                    const statB = fs.statSync(b.path);
                    return new Date(statB.mtime) - new Date(statA.mtime);
                });
    
            if (imageFiles.length === 0) {
                console.log('❌ Нет фото для отправки');
                return;
            }
    
            if (index < 0 || index >= imageFiles.length) {
                console.log(`❌ Неверный номер. Доступно: 1-${imageFiles.length}`);
                return;
            }
    
            const photo = imageFiles[index];
            const photoData = fs.readFileSync(photo.path);
            
            // Определяем пожар по имени файла
            const isFire = withFire || photo.name.toLowerCase().includes('fire');
            
            console.log(`📸 Отправляю: ${photo.name} ${isFire ? '🔥 (ПОЖАР)' : ''}`);
            
            // Отправляем JSON с метаданными и фото
            const message = {
                type: 'photo_upload',
                filename: photo.name,
                isFire: isFire,
                timestamp: new Date().toISOString(),
                photoData: photoData.toString('base64')
            };
            
            this.ws.send(JSON.stringify(message));
            console.log(`✅ Фото отправлено (${photoData.length} байт) ${isFire ? '🔥' : ''}\n`);
            
        } catch (error) {
            console.log('❌ Ошибка отправки фото:', error);
        }
    }

    sendAllPhotos() {
        if (!this.isConnected || !this.isIdentified) {
            console.log('❌ Нет подключения или не идентифицированы');
            return;
        }

        try {
            const files = fs.readdirSync(this.photosDir);
            const imageFiles = files
                .filter(file => /\.(jpg|jpeg|png|gif|bmp)$/i.test(file))
                .map(file => {
                    const filePath = path.join(this.photosDir, file);
                    return {
                        name: file,
                        path: filePath
                    };
                })
                .sort((a, b) => {
                    const statA = fs.statSync(a.path);
                    const statB = fs.statSync(b.path);
                    return new Date(statB.mtime) - new Date(statA.mtime);
                });

            if (imageFiles.length === 0) {
                console.log('❌ Нет фото для отправки');
                return;
            }

            console.log(`📸 Отправляю ${imageFiles.length} фото...`);
            
            imageFiles.forEach((photo, index) => {
                try {
                    const photoData = fs.readFileSync(photo.path);
                    this.ws.send(photoData);
                    console.log(`[${index + 1}/${imageFiles.length}] ${photo.name}`);
                } catch (error) {
                    console.log(`❌ Ошибка: ${photo.name}`);
                }
            });
            
            console.log('✅ Все фото отправлены\n');
            
        } catch (error) {
            console.log('❌ Ошибка:', error);
        }
    }

    setupReadline() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '> '
        });

        rl.on('line', (input) => {
            this.handleCommand(input.trim());
            rl.prompt();
        });

        rl.on('close', () => {
            console.log('\nВыход...');
            if (this.ws) {
                this.ws.close();
            }
            process.exit(0);
        });

        rl.prompt();
    }

    handleCommand(input) {
        if (!input) return;

        const [command, ...args] = input.split(' ');
        const text = args.join(' ');

        switch (command) {
            case 'msg':
                if (text) {
                    this.sendMessage(text);
                }
                break;
                
            case 'photo':
                if (args.length > 0) {
                    const index = parseInt(args[0]) - 1;
                    if (!isNaN(index)) {
                        this.sendPhotoByIndex(index, true);
                    }
                } else {
                    this.sendLatestPhoto(true);
                }
                break;
                
            case 'photoall':
                this.sendAllPhotos();
                break;
                
            case 'list':
                this.listPhotos();
                break;
                
            case 'help':
                console.log(`
Команды:
  msg <текст>    - отправить сообщение
  photo          - отправить последнее фото (пожар)
  photo <номер>  - отправить фото по номеру (пожар)
  photoall       - отправить все фото (пожары)
  list           - список фото
  help           - справка
  exit           - выход
                `);
                break;
                
            case 'exit':
                if (this.ws) {
                    this.ws.close();
                }
                process.exit(0);
                break;
                
            default:
                this.sendMessage(input);
        }
    }
}

// Запуск клиента с указанием ID камеры
const args = process.argv.slice(2);
const serverUrl = args.length > 0 ? args[0] : 'ws://localhost:8080';
const cameraId = args.length > 1 ? args[1] : 'camera_1';

console.log('🚀 Запуск клиента-камеры...');
console.log(`📷 ID камеры: ${cameraId}`);
new CameraClient(serverUrl, cameraId);