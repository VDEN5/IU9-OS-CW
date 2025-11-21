import asyncio
import websockets
import json
import os
import sys
import readline
from pathlib import Path
from datetime import datetime

class CameraClient:
    def __init__(self, url='ws://localhost:8080', camera_id='camera_1'):
        self.url = url
        self.camera_id = camera_id
        self.camera_name = ''
        self.ws = None
        self.is_connected = False
        self.is_identified = False
        self.photos_dir = Path(__file__).parent / 'client_photos'
        self.auto_send_interval = None
        self.last_sent_photo = None
        self.auto_send_enabled = False
        self.photo_appearance_times = {}
        
        self.photos_dir.mkdir(exist_ok=True, parents=True)
        print(f"📁 Папка для фото: {self.photos_dir}")
        
        self.initialize_appearance_times()
        self.connect()

    def initialize_appearance_times(self):
        try:
            image_files = [f for f in self.photos_dir.iterdir() 
                          if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']]
            
            for file in image_files:
                stats = file.stat()
                self.photo_appearance_times[file.name] = stats.st_ctime * 1000  # Convert to milliseconds
            
            print(f"📊 Отслеживается {len(image_files)} фото")
        except Exception as e:
            print('❌ Ошибка инициализации отслеживания фото:', e)

    def get_photo_appearance_time(self, filename):
        if filename in self.photo_appearance_times:
            return self.photo_appearance_times[filename]
        
        # Если фото новое, сохраняем текущее время
        file_path = self.photos_dir / filename
        try:
            stats = file_path.stat()
            appearance_time = stats.st_ctime * 1000  # Convert to milliseconds
            self.photo_appearance_times[filename] = appearance_time
            return appearance_time
        except Exception as e:
            return datetime.now().timestamp() * 1000

    async def connect(self):
        print(f"🔗 Подключаемся к {self.url} как {self.camera_id}...")
        
        try:
            self.ws = await websockets.connect(self.url)
            self.is_connected = True
            print('✅ Подключение установлено!')
            
            await self.ws.send(json.dumps({
                'type': 'camera_identify',
                'cameraId': self.camera_id
            }))
            print(f"📷 Идентифицируемся как {self.camera_id}...")
            
            await self.handle_messages()
            
        except Exception as e:
            print(f'💥 Ошибка подключения: {e}')

    async def handle_messages(self):
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    
                    if data['type'] == 'camera_identified':
                        self.is_identified = True
                        self.camera_name = data['name']
                        print(f"✅ Идентификация успешна: {self.camera_name}")
                        self.check_photos()
                        self.start_auto_send()
                    
                    elif data['type'] == 'get_photo':
                        print('📸 Сервер запросил фото')
                        await self.send_latest_photo()
                    
                    elif data['type'] == 'message':
                        print(f"📨 Сервер: {data['text']}")
                    
                    elif data['type'] == 'auto_send_toggle':
                        self.auto_send_enabled = data['enabled']
                        print(f"🔄 Автоотправка: {'ВКЛ' if self.auto_send_enabled else 'ВЫКЛ'}")
                        
                except json.JSONDecodeError:
                    # Игнорируем бинарные данные
                    pass
                    
        except websockets.exceptions.ConnectionClosed:
            self.is_connected = False
            self.is_identified = False
            self.stop_auto_send()
            print('❌ Соединение закрыто')

    def start_auto_send(self):
        if self.auto_send_interval:
            self.auto_send_interval.cancel()
        
        async def auto_send_task():
            while True:
                await asyncio.sleep(10)  # Проверка каждые 10 секунд
                await self.check_and_send_new_photos()
        
        self.auto_send_interval = asyncio.create_task(auto_send_task())
        print('🔄 Автоотправка запущена (проверка каждые 10 секунд)')
        self.auto_send_enabled = True

    def stop_auto_send(self):
        if self.auto_send_interval:
            self.auto_send_interval.cancel()
            self.auto_send_interval = None
        self.auto_send_enabled = False
        print('🛑 Автоотправка остановлена')

    async def check_and_send_new_photos(self):
        if not self.is_connected or not self.is_identified or not self.auto_send_enabled:
            return

        try:
            latest_photo = self.get_latest_photo()
            if not latest_photo:
                print('⏳ Нет фото для отправки')
                return

            appearance_time = self.get_photo_appearance_time(latest_photo['name'])
            photo_age = datetime.now().timestamp() * 1000 - appearance_time
            is_recent = photo_age < 10000  # Только фото младше 10 секунд
            is_new_photo = self.last_sent_photo != latest_photo['name']

            print(f"🔍 Проверка фото: {latest_photo['name']} ({photo_age/1000:.1f} сек назад)")

            if is_recent and is_new_photo:
                print(f"🔄 Отправляем новое фото: {latest_photo['name']}")
                
                # ВАЖНО: отправляем с with_fire = True, как при команде "photo"
                await self.send_photo(latest_photo['path'], latest_photo['name'], True, appearance_time)
                self.last_sent_photo = latest_photo['name']
            elif not is_recent:
                print(f"⏩ Пропускаем старое фото: {latest_photo['name']} ({photo_age/1000:.1f} сек назад)")
            elif not is_new_photo:
                print(f"⏩ Уже отправляли: {latest_photo['name']}")
                
        except Exception as e:
            print('❌ Ошибка при проверке новых фото:', e)

    def get_latest_photo(self):
        try:
            image_files = [f for f in self.photos_dir.iterdir() 
                          if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']]

            if not image_files:
                return None

            # Берем ПЕРВЫЙ файл из списка (новое фото всегда первое)
            first_file = image_files[0]
            stats = first_file.stat()
            appearance_time = self.get_photo_appearance_time(first_file.name)
            
            return {
                'name': first_file.name,
                'path': first_file,
                'size': stats.st_size,
                'appearance_time': appearance_time
            }
        except Exception as e:
            print('❌ Ошибка получения фото:', e)
            return None

    def check_photos(self):
        try:
            image_files = [f for f in self.photos_dir.iterdir() 
                          if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']]

            if image_files:
                print(f"📸 Найдено фото: {len(image_files)} файлов")
                self.list_photos()
            else:
                print('❌ В папке нет фото')
        except Exception as e:
            print('❌ Ошибка чтения папки:', e)

    def list_photos(self):
        try:
            image_files = [f for f in self.photos_dir.iterdir() 
                          if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']]

            print('\n📸 Список фото:')
            for index, file in enumerate(image_files):
                stats = file.stat()
                appearance_time = self.get_photo_appearance_time(file.name)
                age = datetime.now().timestamp() * 1000 - appearance_time
                age_seconds = int(age / 1000)
                
                size_mb = stats.st_size / (1024 * 1024)
                is_recent = age_seconds < 10
                sent_marker = ' ✅' if file.name == self.last_sent_photo else ''
                recent_marker = ' 🆕' if is_recent else ''
                appearance_time_str = datetime.fromtimestamp(appearance_time / 1000).strftime('%H:%M:%S')
                
                print(f"   {index + 1}. {file.name} ({size_mb:.2f} MB)")
                print(f"      Появилось: {appearance_time_str} ({age_seconds} сек назад){recent_marker}{sent_marker}")
            print()
            
        except Exception as e:
            print('❌ Ошибка получения списка:', e)

    async def send_message(self, text):
        if not self.is_connected or not self.is_identified:
            print('❌ Нет подключения или не идентифицированы')
            return

        await self.ws.send(json.dumps({
            'type': 'message',
            'text': text
        }))
        print(f"💬 Отправлено: {text}")

    async def send_latest_photo(self):
        latest_photo = self.get_latest_photo()
        if latest_photo:
            # ВАЖНО: отправляем с with_fire = True, как при команде "photo"
            await self.send_photo(latest_photo['path'], latest_photo['name'], True, latest_photo['appearance_time'])
            self.last_sent_photo = latest_photo['name']
        else:
            print('❌ Нет фото для отправки')

    async def send_photo_by_index(self, index):
        if not self.is_connected or not self.is_identified:
            print('❌ Нет подключения или не идентифицированы')
            return
    
        try:
            image_files = [f for f in self.photos_dir.iterdir() 
                          if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']]
    
            if not image_files:
                print('❌ Нет фото для отправки')
                return
    
            if index < 0 or index >= len(image_files):
                print(f"❌ Неверный номер. Доступно: 1-{len(image_files)}")
                return
    
            filename = image_files[index].name
            file_path = self.photos_dir / filename
            appearance_time = self.get_photo_appearance_time(filename)
            
            # ВАЖНО: отправляем с with_fire = True, как при команде "photo"
            await self.send_photo(file_path, filename, True, appearance_time)
            self.last_sent_photo = filename
            
        except Exception as e:
            print('❌ Ошибка отправки фото:', e)

    async def send_photo(self, photo_path, filename, with_fire, appearance_time):
        try:
            with open(photo_path, 'rb') as f:
                photo_data = f.read()
            
            photo_age = datetime.now().timestamp() * 1000 - appearance_time
            
            is_fire = with_fire  # Теперь всегда True из-за with_fire = True
            
            print(f"📸 Отправляю: {filename} ({photo_age/1000:.1f} сек назад) {'🔥 (ПОЖАР)' if is_fire else ''}")
            
            message = {
                'type': 'photo_upload',
                'filename': filename,
                'isFire': is_fire,
                'timestamp': datetime.now().isoformat(),
                'appearanceTime': appearance_time,
                'photoAge': photo_age,
                'photoData': photo_data.hex()  # Convert bytes to hex string
            }
            
            await self.ws.send(json.dumps(message))
            print(f"✅ Фото отправлено ({len(photo_data)} байт) {'🔥' if is_fire else ''}\n")
            
        except Exception as e:
            print('❌ Ошибка отправки фото:', e)

    def toggle_auto_send(self):
        if self.auto_send_enabled:
            self.stop_auto_send()
        else:
            self.start_auto_send()
        
        if self.is_connected and self.is_identified:
            asyncio.create_task(self.ws.send(json.dumps({
                'type': 'auto_send_status',
                'enabled': self.auto_send_enabled
            })))

    async def handle_command(self, input_text):
        if not input_text:
            return

        parts = input_text.split(' ')
        command = parts[0]
        args = parts[1:]
        text = ' '.join(args)

        if command == 'msg':
            if text:
                await self.send_message(text)
                
        elif command == 'photo':
            if args:
                try:
                    index = int(args[0]) - 1
                    await self.send_photo_by_index(index)
                except ValueError:
                    print('❌ Неверный номер')
            else:
                await self.send_latest_photo()
                
        elif command == 'list':
            self.list_photos()
            
        elif command == 'auto':
            self.toggle_auto_send()
            
        elif command == 'help':
            print("""
Команды:
  msg <текст>    - отправить сообщение
  photo          - отправить последнее фото (пожар)
  photo <номер>  - отправить фото по номеру (пожар)
  list           - список фото
  auto           - вкл/выкл автоотправку
  help           - справка
  exit           - выход
            """)
            
        elif command == 'exit':
            self.stop_auto_send()
            if self.ws:
                await self.ws.close()
            return False
            
        else:
            await self.send_message(input_text)
            
        return True

    async def run_cli(self):
        print("""
🚀 Запуск клиента-камеры...
Доступные команды: help
        """)
        
        while True:
            try:
                input_text = input('> ').strip()
                should_continue = await self.handle_command(input_text)
                if not should_continue:
                    break
            except (KeyboardInterrupt, EOFError):
                print('\nВыход...')
                self.stop_auto_send()
                if self.ws:
                    await self.ws.close()
                break

async def main():
    args = sys.argv[1:]
    server_url = args[0] if len(args) > 0 else 'ws://5.188.30.109:8064'
    camera_id = args[1] if len(args) > 1 else 'camera_1'
    
    print(f"📷 ID камеры: {camera_id}")
    client = CameraClient(server_url, camera_id)
    
    # Запускаем CLI и WebSocket соединение параллельно
    await asyncio.gather(
        client.run_cli(),
        return_exceptions=True
    )

if __name__ == "__main__":
    asyncio.run(main())