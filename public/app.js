class ServerMonitor {
    constructor() {
        this.monitorWs = null;
        this.isConnected = false;
        this.cameras = new Map();
        this.activeAnimations = new Set();
        this.isMapReady = false;
        this.pendingCamerasUpdate = false;
        this.mapObjects = {};
        this.fireTimeouts = new Map();
        
        // Хранилище истории событий
        this.maxHistorySize = 1000;
        this.loadHistoryFromStorage();
        
        this.initializeElements();
        this.initializeMap();
        this.setupModals();
        this.connect();
    }

    // Загрузка истории из LocalStorage
    loadHistoryFromStorage() {
        try {
            const savedHistory = localStorage.getItem('fireMonitoringHistory');
            if (savedHistory) {
                this.eventsHistory = JSON.parse(savedHistory);
                console.log(`📚 Загружена история из хранилища: ${this.eventsHistory.length} событий`);
            } else {
                this.eventsHistory = [];
                console.log('📚 История не найдена в хранилище, создаем новую');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки истории:', error);
            this.eventsHistory = [];
        }
    }

    // Сохранение истории в LocalStorage
    saveHistoryToStorage() {
        try {
            localStorage.setItem('fireMonitoringHistory', JSON.stringify(this.eventsHistory));
            console.log(`💾 История сохранена: ${this.eventsHistory.length} событий`);
        } catch (error) {
            console.error('❌ Ошибка сохранения истории:', error);
        }
    }

    initializeElements() {
        this.connectionStatus = document.getElementById('connectionStatus');
        this.clientCount = document.getElementById('clientCount');
        this.activeCount = document.getElementById('activeCount');
        this.camerasList = document.getElementById('camerasList');
        this.eventsTable = document.getElementById('eventsTable');
        
        // Элементы модальных окон
        this.modal = document.getElementById('photoModal');
        this.modalImage = document.getElementById('modalImage');
        this.modalTitle = document.getElementById('modalTitle');
        this.modalCameraName = document.getElementById('modalCameraName');
        this.modalTimestamp = document.getElementById('modalTimestamp');
        this.modalType = document.getElementById('modalType');
        
        this.historyModal = document.getElementById('historyModal');
        this.historyTable = document.getElementById('historyTable');
        
        // Кнопки
        this.showHistoryBtn = document.getElementById('showHistoryBtn');
        this.clearHistoryBtn = document.getElementById('clearHistory');
        this.filterAll = document.getElementById('filterAll');
        this.filterFires = document.getElementById('filterFires');
        this.filterConnections = document.getElementById('filterConnections');
        
        // Показываем статистику истории при загрузке
        this.updateHistoryStats();
    }

    setupModals() {
        // Основное модальное окно для фото
        const closeBtns = document.querySelectorAll('.close');
        closeBtns.forEach(btn => {
            btn.onclick = () => {
                this.closeModal();
                this.closeHistoryModal();
            };
        });

        this.modal.onclick = (event) => {
            if (event.target === this.modal) {
                this.closeModal();
            }
        };

        this.historyModal.onclick = (event) => {
            if (event.target === this.historyModal) {
                this.closeHistoryModal();
            }
        };

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeModal();
                this.closeHistoryModal();
            }
        });

        // Кнопка показа истории
        this.showHistoryBtn.onclick = () => {
            this.showHistoryModal();
        };

        // Кнопка очистки истории
        this.clearHistoryBtn.onclick = () => {
            this.clearHistory();
        };

        // Фильтры истории
        this.filterAll.onclick = () => this.setHistoryFilter('all');
        this.filterFires.onclick = () => this.setHistoryFilter('fires');
        this.filterConnections.onclick = () => this.setHistoryFilter('connections');
    }

    // Обновление статистики истории
    updateHistoryStats() {
        const totalEvents = this.eventsHistory.length;
        const fireEvents = this.eventsHistory.filter(e => e.type === 'fire').length;
        const todayEvents = this.eventsHistory.filter(e => {
            const eventDate = new Date(e.timestamp);
            const today = new Date();
            return eventDate.toDateString() === today.toDateString();
        }).length;

        console.log(`📊 Статистика истории: Всего ${totalEvents}, Пожаров: ${fireEvents}, Сегодня: ${todayEvents}`);
    }

    // Добавление события в историю
    addEventToHistory(event) {
        event.id = Date.now() + Math.random(); // Уникальный ID
        this.eventsHistory.unshift(event); // Добавляем в начало
        
        // Ограничиваем размер истории
        if (this.eventsHistory.length > this.maxHistorySize) {
            this.eventsHistory = this.eventsHistory.slice(0, this.maxHistorySize);
        }
        
        // Сохраняем в хранилище
        this.saveHistoryToStorage();
        
        // Обновляем статистику
        this.updateHistoryStats();
        
        // Обновляем сводку (последние 10 событий)
        this.updateEventsSummary();
    }

    // Обновление сводки событий (последние 10)
    updateEventsSummary() {
        const recentEvents = this.eventsHistory.slice(0, 10);
        
        if (recentEvents.length === 0) {
            this.eventsTable.innerHTML = '<tr><td colspan="5" class="empty-state">События появятся здесь</td></tr>';
            return;
        }

        this.eventsTable.innerHTML = recentEvents.map(event => {
            const eventTypeClass = this.getEventTypeClass(event.type);
            const eventTypeText = this.getEventTypeText(event.type);
            
            return `
            <tr>
                <td>${new Date(event.timestamp).toLocaleTimeString()}</td>
                <td><strong>${event.cameraName || 'Система'}</strong></td>
                <td><span class="event-type ${eventTypeClass}">${eventTypeText}</span></td>
                <td>${event.details || ''}</td>
                <td>
                    ${event.photoData ? 
                        `<img src="data:image/jpeg;base64,${event.photoData}" 
                              class="event-photo"
                              onclick="monitor.showEventPhoto('${event.id}')"
                              alt="Фото события"
                              title="Нажмите для просмотра">` 
                        : '<span style="color: #95a5a6;">—</span>'
                    }
                </td>
            </tr>
        `}).join('');
    }

    // Получение класса для типа события
    getEventTypeClass(type) {
        const types = {
            'fire': 'event-fire',
            'connection': 'event-connection',
            'disconnection': 'event-disconnection',
            'message': 'event-message',
            'photo_request': 'event-photo'
        };
        return types[type] || 'event-message';
    }

    // Получение текста для типа события
    getEventTypeText(type) {
        const texts = {
            'fire': '🔥 ПОЖАР',
            'connection': '✅ ПОДКЛЮЧЕНИЕ',
            'disconnection': '❌ ОТКЛЮЧЕНИЕ',
            'message': '💬 СООБЩЕНИЕ',
            'photo_request': '📸 ЗАПРОС ФОТО'
        };
        return texts[type] || type;
    }

    // Показать модальное окно истории
    showHistoryModal() {
        this.updateHistoryTable();
        this.historyModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    closeHistoryModal() {
        this.historyModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // Обновление таблицы истории
    updateHistoryTable(filter = 'all') {
        let filteredEvents = this.eventsHistory;
        
        if (filter === 'fires') {
            filteredEvents = this.eventsHistory.filter(event => event.type === 'fire');
        } else if (filter === 'connections') {
            filteredEvents = this.eventsHistory.filter(event => 
                event.type === 'connection' || event.type === 'disconnection'
            );
        }

        if (filteredEvents.length === 0) {
            this.historyTable.innerHTML = '<tr><td colspan="5" class="empty-state">Нет событий для отображения</td></tr>';
            return;
        }

        this.historyTable.innerHTML = filteredEvents.map(event => {
            const eventTypeClass = this.getEventTypeClass(event.type);
            const eventTypeText = this.getEventTypeText(event.type);
            
            return `
            <tr>
                <td>${new Date(event.timestamp).toLocaleString()}</td>
                <td><strong>${event.cameraName || 'Система'}</strong></td>
                <td><span class="event-type ${eventTypeClass}">${eventTypeText}</span></td>
                <td>${event.details || ''}</td>
                <td>
                    ${event.photoData ? 
                        `<img src="data:image/jpeg;base64,${event.photoData}" 
                              class="history-photo"
                              onclick="monitor.showEventPhoto('${event.id}')"
                              alt="Фото события">` 
                        : '-'
                    }
                </td>
            </tr>
        `}).join('');
    }

    // Установка фильтра истории
    setHistoryFilter(filter) {
        // Обновляем активные кнопки
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (filter === 'all') this.filterAll.classList.add('active');
        if (filter === 'fires') this.filterFires.classList.add('active');
        if (filter === 'connections') this.filterConnections.classList.add('active');
        
        this.updateHistoryTable(filter);
    }

    // Показать фото события
    showEventPhoto(eventId) {
        const event = this.eventsHistory.find(e => e.id === eventId);
        if (event && event.photoData) {
            this.showModal(
                event.photoData,
                event.cameraName,
                event.timestamp,
                'history'
            );
        }
    }

    // Очистка истории
    clearHistory() {
        if (confirm('Вы уверены, что хотите очистить всю историю событий? Это действие нельзя отменить.')) {
            this.eventsHistory = [];
            this.saveHistoryToStorage();
            this.updateEventsSummary();
            this.updateHistoryTable();
            this.updateHistoryStats();
            console.log('🗑️ История полностью очищена');
        }
    }

    initializeMap() {
        ymaps.ready(() => {
            this.map = new ymaps.Map('map', {
                center: [60, 80],
                zoom: 3,
                controls: ['zoomControl', 'fullscreenControl']
            });

            this.map.controls.add('trafficControl');
            this.isMapReady = true;
            console.log('🗺️ Яндекс Карта инициализирована');
            
            if (this.pendingCamerasUpdate) {
                this.updateMapMarkers();
                this.pendingCamerasUpdate = false;
            }
        });
    }

    updateMapMarkers() {
        if (!this.isMapReady) {
            this.pendingCamerasUpdate = true;
            console.log('🗺️ Карта еще не готова, откладываем обновление меток');
            return;
        }

        if (!this.map) {
            console.error('❌ Карта не инициализирована');
            return;
        }

        console.log('🗺️ Обновляем метки на карте...');

        Object.values(this.mapObjects).forEach(obj => {
            this.map.geoObjects.remove(obj);
        });
        this.mapObjects = {};

        if (this.cameras.size === 0) {
            console.log('📷 Нет данных о камерах для отображения на карте');
            return;
        }

        this.cameras.forEach(camera => {
            const hasRecentFire = this.eventsHistory.some(event => 
                event.cameraName === camera.name && event.type === 'fire' &&
                Date.now() - new Date(event.timestamp).getTime() < 300000 // 5 минут
            );
            
            // Создаем кастомную иконку в зависимости от статуса
            let iconLayout;
            if (hasRecentFire) {
                // Для камер с пожарами - fire.svg с анимацией
                iconLayout = ymaps.templateLayoutFactory.createClass(
                    `<div class="fire-marker ${this.activeAnimations.has(camera.id) ? 'animated' : ''}" 
                          style="width: 50px; height: 50px; background-image: url('fire.svg');"></div>`
                );
            } else {
                // Для обычных камер - стандартные иконки
                iconLayout = 'default#imageWithContent';
            }

            const marker = new ymaps.Placemark(
                camera.coords,
                {
                    balloonContent: `
                        <div style="min-width: 250px;">
                            <strong style="color: #2c3e50; font-size: 16px;">${camera.name}</strong><br/>
                            <em style="color: #7f8c8d;">${camera.location}</em><br/>
                            <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 6px;">
                                <strong>Статус:</strong> ${camera.status === 'online' ? '🟢 Онлайн' : '🔴 Офлайн'}<br/>
                                ${camera.status === 'online' ? 
                                    `<strong>IP:</strong> ${camera.ip}<br/>
                                    <strong>Подключена:</strong> ${new Date(camera.connectedAt).toLocaleTimeString()}` 
                                    : ''
                                }
                            </div>
                            ${hasRecentFire ? 
                                '<div style="color: #e74c3c; font-weight: bold; background: #ffebee; padding: 8px; border-radius: 6px; margin-top: 8px;">🔥 ОБНАРУЖЕН ПОЖАР</div>' 
                                : ''
                            }
                        </div>
                    `,
                    iconCaption: camera.name
                },
                hasRecentFire ? {
                    iconLayout: iconLayout,
                    iconShape: {
                        type: 'Circle',
                        coordinates: [0, 0],
                        radius: 25
                    }
                } : {
                    preset: camera.status === 'online' ? 'islands#greenIcon' : 'islands#grayIcon',
                    iconColor: camera.status === 'online' ? '#27ae60' : '#95a5a6',
                    balloonCloseButton: true,
                    hideIconOnBalloonOpen: false
                }
            );

            marker.events.add('click', () => {
                this.focusCamera(camera.id);
            });

            this.map.geoObjects.add(marker);
            this.mapObjects[camera.id] = marker;
        });

        try {
            const bounds = this.map.geoObjects.getBounds();
            if (bounds) {
                this.map.setBounds(bounds, {
                    checkZoomRange: true,
                    zoomMargin: 50
                });
            }
        } catch (error) {
            console.log('⚠️ Не удалось автоматически настроить масштаб карты');
        }

        console.log(`🗺️ Добавлено меток на карту: ${this.map.geoObjects.getLength()}`);
    }

    animateCameraMarker(cameraId) {
        const marker = this.mapObjects[cameraId];
        const camera = this.cameras.get(cameraId);
        
        if (!marker || !camera || camera.status !== 'online') {
            console.log(`❌ Не удалось анимировать метку камеры ${cameraId}`);
            return;
        }

        this.stopCameraAnimation(cameraId);

        console.log(`🔥 Анимируем метку камеры: ${camera.name}`);

        // Создаем анимированную fire иконку
        const fireIconLayout = ymaps.templateLayoutFactory.createClass(
            `<div class="fire-marker animated" 
                  style="width: 50px; height: 50px; background-image: url('fire.svg');"></div>`
        );

        marker.options.set({
            iconLayout: fireIconLayout,
            iconShape: {
                type: 'Circle',
                coordinates: [0, 0],
                radius: 25
            }
        });

        this.animateCameraCard(cameraId);

        // Устанавливаем таймаут для автоматического скрытия fire-метки через 10 секунд
        const fireTimeout = setTimeout(() => {
            console.log(`⏰ Скрываем fire-метку для камеры: ${camera.name}`);
            this.removeFireMarker(cameraId);
        }, 10000);

        this.fireTimeouts.set(cameraId, fireTimeout);
        this.activeAnimations.add(cameraId);
    }

    // Новая функция для удаления fire-метки (но фото остается в таблице)
    removeFireMarker(cameraId) {
        const marker = this.mapObjects[cameraId];
        const camera = this.cameras.get(cameraId);
        
        if (!marker || !camera) return;

        // Очищаем таймаут
        if (this.fireTimeouts.has(cameraId)) {
            clearTimeout(this.fireTimeouts.get(cameraId));
            this.fireTimeouts.delete(cameraId);
        }

        // Возвращаем стандартную иконку
        marker.options.set({
            preset: camera.status === 'online' ? 'islands#greenIcon' : 'islands#grayIcon',
            iconColor: camera.status === 'online' ? '#27ae60' : '#95a5a6',
            iconLayout: 'default#imageWithContent'
        });

        this.stopCameraCardAnimation(cameraId);
        this.activeAnimations.delete(cameraId);

        // Обновляем отображение камер (убираем fire-индикаторы)
        this.updateCamerasDisplay();
    }

    stopCameraAnimation(cameraId) {
        const marker = this.mapObjects[cameraId];
        const camera = this.cameras.get(cameraId);
        
        if (!marker) return;

        // Очищаем таймаут если он есть
        if (this.fireTimeouts.has(cameraId)) {
            clearTimeout(this.fireTimeouts.get(cameraId));
            this.fireTimeouts.delete(cameraId);
        }

        // Возвращаем стандартную иконку
        marker.options.set({
            preset: camera.status === 'online' ? 'islands#greenIcon' : 'islands#grayIcon',
            iconColor: camera.status === 'online' ? '#27ae60' : '#95a5a6',
            iconLayout: 'default#imageWithContent'
        });

        this.stopCameraCardAnimation(cameraId);
        this.activeAnimations.delete(cameraId);
    }

    animateCameraCard(cameraId) {
        const card = document.querySelector(`[data-camera-id="${cameraId}"]`);
        if (card) {
            card.classList.add('fire-detected');
            card.style.borderLeft = '4px solid #e74c3c';
            card.style.background = 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)';
            
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    stopCameraCardAnimation(cameraId) {
        const card = document.querySelector(`[data-camera-id="${cameraId}"]`);
        if (card) {
            card.classList.remove('fire-detected');
            const camera = this.cameras.get(cameraId);
            if (camera) {
                const borderColor = camera.status === 'online' ? '#27ae60' : '#95a5a6';
                card.style.borderLeft = `4px solid ${borderColor}`;
            }
            card.style.background = '';
        }
    }

    focusCamera(cameraId) {
        const camera = this.cameras.get(cameraId);
        if (camera && this.map) {
            this.map.setCenter(camera.coords, 8);
            
            const marker = this.mapObjects[cameraId];
            if (marker) {
                marker.balloon.open();
            }
            
            this.highlightCameraCard(cameraId);
        }
    }

    highlightCameraCard(cameraId) {
        document.querySelectorAll('.client-card').forEach(card => {
            const originalCameraId = card.getAttribute('data-camera-id');
            const camera = this.cameras.get(originalCameraId);
            if (camera) {
                const borderColor = camera.status === 'online' ? '#27ae60' : '#95a5a6';
                card.style.borderLeft = `4px solid ${borderColor}`;
            }
        });
        
        const card = document.querySelector(`[data-camera-id="${cameraId}"]`);
        if (card) {
            card.style.borderLeft = '4px solid #3498db';
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('🔗 Подключаемся к серверу мониторинга...');
        
        try {
            this.monitorWs = new WebSocket(wsUrl);
            this.setupWebSocketHandlers();
        } catch (error) {
            console.error('Ошибка подключения мониторинга:', error);
            this.setDisconnected();
        }
    }

    setupWebSocketHandlers() {
        this.monitorWs.onopen = () => {
            console.log('📊 Мониторинг подключен к серверу');
            this.isConnected = true;
            this.setConnected();
        };

        this.monitorWs.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMonitorMessage(message);
            } catch (error) {
                console.error('Ошибка обработки сообщения:', error);
            }
        };

        this.monitorWs.onclose = () => {
            console.log('📊 Мониторинг отключен от сервера');
            this.setDisconnected();
            
            setTimeout(() => {
                this.connect();
            }, 3000);
        };

        this.monitorWs.onerror = (error) => {
            console.error('💥 Ошибка мониторинга:', error);
            this.setDisconnected();
        };
    }

    handleMonitorMessage(message) {
        console.log('📨 Получено сообщение:', message.type);
        
        switch (message.type) {
            case 'initial_state':
                this.handleInitialState(message);
                break;
                
            case 'camera_connected':
                this.handleCameraConnected(message);
                break;
                
            case 'camera_disconnected':
                this.handleCameraDisconnected(message);
                break;
                
            case 'photo_requested':
                this.handlePhotoRequested(message);
                break;
                
            case 'photo_received':
                this.handlePhotoReceived(message);
                break;

            case 'camera_message':
                this.handleCameraMessage(message);
                break;
                
            default:
                console.log('Неизвестный тип сообщения:', message);
        }
    }

    handleInitialState(message) {
        console.log('📊 Получены начальные данные о камерах:', message.cameras.length);
        
        this.cameras.clear();
        this.fireTimeouts.forEach((timeout, cameraId) => {
            clearTimeout(timeout);
        });
        this.fireTimeouts.clear();
        
        message.cameras.forEach(camera => {
            this.cameras.set(camera.id, camera);
        });
        
        this.updateCamerasDisplay();
        this.updateMapMarkers();
        
        console.log(`📊 Загружено камер: ${message.cameras.length}`);
        
        this.activeAnimations.forEach(cameraId => {
            this.stopCameraAnimation(cameraId);
        });
        this.activeAnimations.clear();
    }

    handleCameraConnected(message) {
        console.log('✅ Подключение камеры:', message.camera.name);
        
        this.cameras.set(message.camera.id, message.camera);
        this.updateCamerasDisplay();
        this.updateMapMarkers();
        this.stopCameraAnimation(message.camera.id);

        // Добавляем в историю
        this.addEventToHistory({
            type: 'connection',
            cameraName: message.camera.name,
            timestamp: new Date().toISOString(),
            details: `Камера подключилась с IP: ${message.camera.ip}`
        });
    }

    handleCameraDisconnected(message) {
        const camera = this.cameras.get(message.cameraId);
        if (camera) {
            console.log('❌ Отключение камеры:', camera.name);
            
            camera.status = 'offline';
            this.updateCamerasDisplay();
            this.updateMapMarkers();
            this.stopCameraAnimation(message.cameraId);

            // Добавляем в историю
            this.addEventToHistory({
                type: 'disconnection',
                cameraName: camera.name,
                timestamp: new Date().toISOString(),
                details: 'Камера отключилась от системы'
            });
        }
    }

    handleCameraMessage(message) {
        console.log(`💬 Сообщение от камеры: ${message.text}`);
        
        // Добавляем в историю
        this.addEventToHistory({
            type: 'message',
            cameraName: message.cameraId,
            timestamp: message.timestamp,
            details: message.text
        });
    }

    handlePhotoRequested(message) {
        // Добавляем запрос фото в историю
        this.addEventToHistory({
            type: 'photo_request',
            cameraName: message.cameraName,
            timestamp: message.timestamp,
            details: 'Запрошено фото с камеры'
        });
        
        const camera = this.cameras.get(message.cameraId);
        if (camera && camera.status === 'online') {
            this.animateRequestCard(message.cameraId);
            setTimeout(() => {
                this.stopRequestCardAnimation(message.cameraId);
            }, 1500);
        }
    }

    handlePhotoReceived(message) {
        console.log(`📸 Получено фото от камеры: ${message.cameraName}, пожар: ${message.isFire}`);
        
        if (message.isFire) {
            // Событие пожара
            this.addEventToHistory({
                type: 'fire',
                cameraName: message.cameraName,
                timestamp: message.timestamp,
                details: `Обнаружен пожар! Фото: ${message.filename} (${message.size} байт)`,
                photoData: message.photoData
            });
            
            this.animateCameraMarker(message.cameraId);
        } else {
            // Обычное фото по запросу
            this.addEventToHistory({
                type: 'photo_request',
                cameraName: message.cameraName,
                timestamp: message.timestamp,
                details: `Фото по запросу: ${message.filename}`,
                photoData: message.photoData
            });
            
            this.showModal(
                message.photoData,
                message.cameraName,
                message.timestamp,
                'requested'
            );
        }
    }

    // Функция для анимации карточки при запросе (без fire)
    animateRequestCard(cameraId) {
        const card = document.querySelector(`[data-camera-id="${cameraId}"]`);
        if (card) {
            card.style.borderLeft = '4px solid #3498db';
            card.style.background = 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)';
            card.style.boxShadow = '0 0 15px rgba(52, 152, 219, 0.5)';
        }
    }

    // Функция для остановки анимации карточки при запросе
    stopRequestCardAnimation(cameraId) {
        const card = document.querySelector(`[data-camera-id="${cameraId}"]`);
        if (card) {
            const camera = this.cameras.get(cameraId);
            if (camera) {
                const borderColor = camera.status === 'online' ? '#27ae60' : '#95a5a6';
                card.style.borderLeft = `4px solid ${borderColor}`;
            }
            card.style.background = '';
            card.style.boxShadow = '';
        }
    }

    updateCamerasDisplay() {
        const onlineCameras = Array.from(this.cameras.values()).filter(c => c.status === 'online');
        this.clientCount.textContent = `${onlineCameras.length}/${this.cameras.size}`;
        
        const camerasArray = Array.from(this.cameras.values()).sort((a, b) => a.id.localeCompare(b.id));

        this.camerasList.innerHTML = camerasArray.map(camera => {
            const hasRecentFire = this.eventsHistory.some(event => 
                event.cameraName === camera.name && event.type === 'fire' &&
                Date.now() - new Date(event.timestamp).getTime() < 300000 // 5 минут
            );
            const isAnimating = this.activeAnimations.has(camera.id);
            const borderColor = isAnimating ? '#e74c3c' : 
                              camera.status === 'online' ? '#27ae60' : '#95a5a6';
            
            return `
            <div class="client-card ${camera.status === 'online' ? 'online' : 'offline'} ${isAnimating ? 'camera-active' : ''}" 
                 data-camera-id="${camera.id}"
                 onclick="monitor.focusCamera('${camera.id}')"
                 style="cursor: pointer; border-left: 4px solid ${borderColor}">
                <div class="client-header">
                    <span class="connection-dot ${camera.status === 'online' ? 'connected' : 'disconnected'} ${isAnimating ? 'pulsing' : ''}"></span>
                    <strong>${camera.name}</strong>
                    <span class="client-id">${camera.id}</span>
                </div>
                <div class="client-info">
                    <div><strong>Регион:</strong> ${camera.location}</div>
                    <div><strong>Статус:</strong> ${camera.status === 'online' ? '🟢 Онлайн' : '🔴 Офлайн'}</div>
                    ${camera.status === 'online' ? `
                        <div><strong>IP:</strong> ${camera.ip}</div>
                        <div><strong>Подключена:</strong> ${new Date(camera.connectedAt).toLocaleTimeString()}</div>
                    ` : ''}
                    <div><strong>Координаты:</strong> ${camera.coords[0].toFixed(4)}, ${camera.coords[1].toFixed(4)}</div>
                    ${hasRecentFire ? 
                        `<div style="color: #e74c3c; font-weight: bold;">
                            <img src="fire.svg" class="fire-icon small" alt="🔥">
                            Обнаружен пожар
                        </div>` 
                        : ''}
                </div>
                <button class="request-btn" 
                        onclick="event.stopPropagation(); monitor.requestPhoto('${camera.id}')"
                        ${camera.status !== 'online' ? 'disabled' : ''}>
                    ${camera.status === 'online' ? '📸 Запросить фото' : '🔴 Недоступна'}
                </button>
            </div>
        `}).join('');
    }

    requestPhoto(cameraId) {
        if (this.monitorWs && this.isConnected) {
            this.monitorWs.send(JSON.stringify({
                type: 'request_photo',
                cameraId: cameraId
            }));
            
            const camera = this.cameras.get(cameraId);
            console.log(`📸 Запрос фото у камеры: ${camera.name}`);
            
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = '⏳ Запрашиваем...';
            button.disabled = true;
            
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = camera.status === 'online' ? false : true;
            }, 2000);
            
        } else {
            alert('Нет подключения к серверу');
        }
    }

    showModal(photoData, cameraName, timestamp, type) {
        this.modalImage.src = `data:image/jpeg;base64,${photoData}`;
        this.modalTitle.textContent = `Фото с ${cameraName}`;
        this.modalCameraName.textContent = cameraName;
        this.modalTimestamp.textContent = new Date(timestamp).toLocaleString();
        this.modalType.textContent = type === 'requested' ? 'По запросу' : 
                                   type === 'history' ? 'Из истории' : 'Автоматически';
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        this.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.modalImage.src = '';
    }

    setConnected() {
        this.connectionStatus.textContent = 'Подключено';
        this.connectionStatus.className = 'status-online';
    }

    setDisconnected() {
        this.isConnected = false;
        this.connectionStatus.textContent = 'Отключено';
        this.connectionStatus.className = 'status-offline';
    }
}

const monitor = new ServerMonitor();