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
        this.autoSendInterval = null;
        this.lastSentPhoto = null;
        this.autoSendEnabled = false;
        this.photoAppearanceTimes = new Map();
        
        if (!fs.existsSync(this.photosDir)) {
            fs.mkdirSync(this.photosDir, { recursive: true });
            console.log(`📁 Папка для фото: ${this.photosDir}`);
        }
        
        this.initializeAppearanceTimes();
        this.setupReadline();
        this.connect();
    }

    initializeAppearanceTimes() {
        try {
            const files = fs.readdirSync(this.photosDir);
            const imageFiles = files.filter(file => 
                /\.(jpg|jpeg|png|gif|bmp)$/i.test(file)
            );

            imageFiles.forEach(file => {
                const filePath = path.join(this.photosDir, file);
                const stats = fs.statSync(filePath);
                this.photoAppearanceTimes.set(file, stats.ctime.getTime());
            });
            
            console.log(`📊 Отслеживается ${imageFiles.length} фото`);
        } catch (error) {
            console.log('❌ Ошибка инициализации отслеживания фото');
        }
    }

    getPhotoAppearanceTime(filename) {
        if (this.photoAppearanceTimes.has(filename)) {
            return this.photoAppearanceTimes.get(filename);
        }
        
        // Если фото новое, сохраняем текущее время
        const filePath = path.join(this.photosDir, filename);
        try {
            const stats = fs.statSync(filePath);
            const appearanceTime = stats.ctime.getTime();
            this.photoAppearanceTimes.set(filename, appearanceTime);
            return appearanceTime;
        } catch (error) {
            return Date.now();
        }
    }

    connect() {
        console.log(`🔗 Подключаемся к ${this.url} как ${this.cameraId}...`);
        
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
            this.isConnected = true;
            console.log('✅ Подключение установлено!');
            
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
                    this.startAutoSend(); // Автоматически запускаем автоотправку
                }
                else if (message.type === 'get_photo') {
                    console.log('📸 Сервер запросил фото');
                    this.sendLatestPhoto();
                }
                else if (message.type === 'message') {
                    console.log(`📨 Сервер: ${message.text}`);
                }
                else if (message.type === 'auto_send_toggle') {
                    this.autoSendEnabled = message.enabled;
                    console.log(`🔄 Автоотправка: ${this.autoSendEnabled ? 'ВКЛ' : 'ВЫКЛ'}`);
                }
            } catch (error) {
                // Игнорируем бинарные данные
            }
        });

        this.ws.on('close', () => {
            this.isConnected = false;
            this.isIdentified = false;
            this.stopAutoSend();
            console.log('❌ Соединение закрыто');
        });

        this.ws.on('error', (error) => {
            console.log('💥 Ошибка:', error.message);
        });
    }

    startAutoSend() {
        if (this.autoSendInterval) {
            clearInterval(this.autoSendInterval);
        }
        
        this.autoSendInterval = setInterval(() => {
            this.checkAndSendNewPhotos();
        }, 10000); // Проверка каждые 10 секунд
        
        console.log('🔄 Автоотправка запущена (проверка каждые 10 секунд)');
        this.autoSendEnabled = true;
    }

    stopAutoSend() {
        if (this.autoSendInterval) {
            clearInterval(this.autoSendInterval);
            this.autoSendInterval = null;
        }
        this.autoSendEnabled = false;
        console.log('🛑 Автоотправка остановлена');
    }

    checkAndSendNewPhotos() {
        if (!this.isConnected || !this.isIdentified || !this.autoSendEnabled) {
            return;
        }

        try {
            const latestPhoto = this.getLatestPhoto();
            if (!latestPhoto) {
                console.log('⏳ Нет фото для отправки');
                return;
            }

            const appearanceTime = this.getPhotoAppearanceTime(latestPhoto.name);
            const photoAge = Date.now() - appearanceTime;
            const isRecent = photoAge < 10000; // Только фото младше 10 секунд
            const isNewPhoto = this.lastSentPhoto !== latestPhoto.name;

            console.log(`🔍 Проверка фото: ${latestPhoto.name} (${(photoAge/1000).toFixed(1)} сек назад)`);

            if (isRecent && isNewPhoto) {
                console.log(`🔄 Отправляем новое фото: ${latestPhoto.name}`);
                
                // ВАЖНО: отправляем с withFire = true, как при команде "photo"
                this.sendPhoto(latestPhoto.path, latestPhoto.name, true, appearanceTime);
                this.lastSentPhoto = latestPhoto.name;
            } else if (!isRecent) {
                console.log(`⏩ Пропускаем старое фото: ${latestPhoto.name} (${(photoAge/1000).toFixed(1)} сек назад)`);
            } else if (!isNewPhoto) {
                console.log(`⏩ Уже отправляли: ${latestPhoto.name}`);
            }
        } catch (error) {
            console.log('❌ Ошибка при проверке новых фото:', error);
        }
    }

    getLatestPhoto() {
        try {
            const files = fs.readdirSync(this.photosDir);
            const imageFiles = files.filter(file => 
                /\.(jpg|jpeg|png|gif|bmp)$/i.test(file)
            );

            if (imageFiles.length === 0) {
                return null;
            }

            // Берем ПЕРВЫЙ файл из списка (новое фото всегда первое)
            const firstFile = imageFiles[0];
            const filePath = path.join(this.photosDir, firstFile);
            const stats = fs.statSync(filePath);
            const appearanceTime = this.getPhotoAppearanceTime(firstFile);
            
            return {
                name: firstFile,
                path: filePath,
                size: stats.size,
                appearanceTime: appearanceTime
            };
        } catch (error) {
            console.log('❌ Ошибка получения фото');
            return null;
        }
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
                    const appearanceTime = this.getPhotoAppearanceTime(file);
                    const age = Date.now() - appearanceTime;
                    const ageSeconds = Math.floor(age / 1000);
                    return {
                        name: file,
                        size: stats.size,
                        appearanceTime: appearanceTime,
                        age: ageSeconds
                    };
                });

            console.log('');
            console.log('📸 Список фото:');
            imageFiles.forEach((file, index) => {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                const isRecent = file.age < 10;
                const sentMarker = file.name === this.lastSentPhoto ? ' ✅' : '';
                const recentMarker = isRecent ? ' 🆕' : '';
                const appearanceTime = new Date(file.appearanceTime).toLocaleTimeString();
                
                console.log(`   ${index + 1}. ${file.name} (${sizeMB} MB)`);
                console.log(`      Появилось: ${appearanceTime} (${file.age} сек назад)${recentMarker}${sentMarker}`);
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

    sendLatestPhoto() {
        const latestPhoto = this.getLatestPhoto();
        if (latestPhoto) {
            // ВАЖНО: отправляем с withFire = true, как при команде "photo"
            this.sendPhoto(latestPhoto.path, latestPhoto.name, true, latestPhoto.appearanceTime);
            this.lastSentPhoto = latestPhoto.name;
        } else {
            console.log('❌ Нет фото для отправки');
        }
    }

    sendPhotoByIndex(index) {
        if (!this.isConnected || !this.isIdentified) {
            console.log('❌ Нет подключения или не идентифицированы');
            return;
        }
    
        try {
            const files = fs.readdirSync(this.photosDir);
            const imageFiles = files.filter(file => 
                /\.(jpg|jpeg|png|gif|bmp)$/i.test(file)
            );
    
            if (imageFiles.length === 0) {
                console.log('❌ Нет фото для отправки');
                return;
            }
    
            if (index < 0 || index >= imageFiles.length) {
                console.log(`❌ Неверный номер. Доступно: 1-${imageFiles.length}`);
                return;
            }
    
            const filename = imageFiles[index];
            const filePath = path.join(this.photosDir, filename);
            const appearanceTime = this.getPhotoAppearanceTime(filename);
            
            // ВАЖНО: отправляем с withFire = true, как при команде "photo"
            this.sendPhoto(filePath, filename, true, appearanceTime);
            this.lastSentPhoto = filename;
            
        } catch (error) {
            console.log('❌ Ошибка отправки фото:', error);
        }
    }

    sendPhoto(photoPath, filename, withFire, appearanceTime) {
        try {
            const photoData = fs.readFileSync(photoPath);
            const photoAge = Date.now() - appearanceTime;
            
            const isFire = withFire; // Теперь всегда true из-за withFire = true
            
            console.log(`📸 Отправляю: ${filename} (${(photoAge/1000).toFixed(1)} сек назад) ${isFire ? '🔥 (ПОЖАР)' : ''}`);
            
            const message = {
                type: 'photo_upload',
                filename: filename,
                isFire: isFire,
                timestamp: new Date().toISOString(),
                appearanceTime: appearanceTime,
                photoAge: photoAge,
                photoData: photoData.toString('base64')
            };
            
            this.ws.send(JSON.stringify(message));
            console.log(`✅ Фото отправлено (${photoData.length} байт) ${isFire ? '🔥' : ''}\n`);
            
        } catch (error) {
            console.log('❌ Ошибка отправки фото:', error);
        }
    }

    toggleAutoSend() {
        if (this.autoSendEnabled) {
            this.stopAutoSend();
        } else {
            this.startAutoSend();
        }
        
        if (this.isConnected && this.isIdentified) {
            this.ws.send(JSON.stringify({
                type: 'auto_send_status',
                enabled: this.autoSendEnabled
            }));
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
            this.stopAutoSend();
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
                        this.sendPhotoByIndex(index);
                    }
                } else {
                    this.sendLatestPhoto();
                }
                break;
                
            case 'list':
                this.listPhotos();
                break;
                
            case 'auto':
                this.toggleAutoSend();
                break;
                
            case 'help':
                console.log(`
Команды:
  msg <текст>    - отправить сообщение
  photo          - отправить последнее фото (пожар)
  photo <номер>  - отправить фото по номеру (пожар)
  list           - список фото
  auto           - вкл/выкл автоотправку
  help           - справка
  exit           - выход
                `);
                break;
                
            case 'exit':
                this.stopAutoSend();
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

// Запуск клиента
const args = process.argv.slice(2);
const serverUrl = args.length > 0 ? args[0] : 'ws://5.188.30.109:8064';
const cameraId = args.length > 1 ? args[1] : 'camera_1';

console.log('🚀 Запуск клиента-камеры...');
console.log(`📷 ID камеры: ${cameraId}`);
new CameraClient(serverUrl, cameraId);