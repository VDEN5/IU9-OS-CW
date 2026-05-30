import { AuthManager } from './auth.js';
import { WebSocketManager } from './websocket.js';
import { MapManager } from './map.js';
import { UIManager } from './ui.js';
import { HistoryManager } from './history.js';
import { CameraManager } from './cameraManager.js';

class App {
    constructor() {
        this.auth = new AuthManager();
        this.ui = new UIManager();
        this.history = new HistoryManager();
        this.cameraManager = new CameraManager();
        this.ws = null;
        this.map = null;

        this.init();
    }

    async init() {
        // Проверка авторизации
        if (!this.auth.isAuthenticated()) {
            window.location.href = '/login-modal.html';
            return;
        }
        this.ui.updateAuthUI(this.auth.getUser(), () => this.logout());

        // Инициализация карты (дождёмся ymaps)
        this.map = new MapManager('map', (cameraId) => this.focusCamera(cameraId));
        this.map.setCameraDataSupplier((id) => this.cameraManager.getCamera(id));

        // Загрузка справочной информации
        this.loadSystemInfo();

        // Подключение WebSocket
        this.ws = new WebSocketManager(
            (msg) => this.handleWsMessage(msg),
            () => this.ui.setConnectionStatus(true),
            () => this.ui.setConnectionStatus(false)
        );
        this.ws.connect(this.auth.getToken());

        // Настройка кнопок UI
        this.ui.elements.showHistoryBtn.onclick = () => this.showHistoryModal();
        this.ui.elements.clearHistoryBtn.onclick = () => this.clearHistory();
        this.ui.elements.filterAll.onclick = () => this.setHistoryFilter('all');
        this.ui.elements.filterFires.onclick = () => this.setHistoryFilter('fires');
        this.ui.elements.filterConnections.onclick = () => this.setHistoryFilter('connections');

        // Глобальный доступ для вызовов из onclick в HTML
        window.app = this;
    }

    async loadSystemInfo() {
        try {
            const [models, types, addresses, departments, stats] = await Promise.all([
                fetch('/api/camera-models').then(r => r.json()),
                fetch('/api/camera-types').then(r => r.json()),
                fetch('/api/addresses').then(r => r.json()),
                fetch('/api/departments').then(r => r.json()),
                fetch('/api/camera-stats').then(r => r.json())
            ]);
            this.ui.updateSystemInfo({
                models: models.models || [],
                types: types.types || [],
                addresses: addresses.addresses || [],
                departments: departments.departments || [],
                stats: stats.stats || {}
            });
        } catch(e) { console.error('Ошибка загрузки системной информации', e); }
    }

    handleWsMessage(msg) {
        console.log('📨 WebSocket сообщение:', msg.type);
        switch(msg.type) {
            case 'initial_state':
                this.cameraManager.updateFromServer(msg.cameras);
                this.updateUIFromCameras();
                this.map.updateMarkers(this.cameraManager.getAllCameras());
                break;
            case 'camera_connected':
                this.cameraManager.updateCameraStatus(msg.camera.id, 'online', msg.camera.ip, msg.camera.connectedAt);
                this.updateUIFromCameras();
                this.map.updateMarkers(this.cameraManager.getAllCameras());
                this.history.addEvent({
                    type: 'connection',
                    cameraName: msg.camera.name,
                    timestamp: new Date().toISOString(),
                    details: `Камера подключилась с IP: ${msg.camera.ip}`
                });
                this.updateEventsDisplay();
                break;
            case 'camera_disconnected':
                this.cameraManager.updateCameraStatus(msg.cameraId, 'offline');
                this.updateUIFromCameras();
                this.map.updateMarkers(this.cameraManager.getAllCameras());
                const cam = this.cameraManager.getCamera(msg.cameraId);
                if (cam) {
                    this.history.addEvent({
                        type: 'disconnection',
                        cameraName: cam.name,
                        timestamp: new Date().toISOString(),
                        details: 'Камера отключилась'
                    });
                    this.updateEventsDisplay();
                }
                break;
            case 'photo_received':
                if (msg.isFire) {
                    this.cameraManager.startFireAnimation(msg.cameraId);
                    this.history.addEvent({
                        type: 'fire',
                        cameraName: msg.cameraName,
                        timestamp: msg.timestamp,
                        details: `Обнаружен пожар! Фото: ${msg.filename}`,
                        photoData: msg.photoData
                    });
                    this.updateUIFromCameras();
                    this.map.updateMarkers(this.cameraManager.getAllCameras());
                } else {
                    this.ui.showModal(msg.photoData, msg.cameraName, msg.timestamp, 'requested');
                }
                this.updateEventsDisplay();
                break;
            case 'photo_requested':
                this.history.addEvent({
                    type: 'photo_request',
                    cameraName: msg.cameraName,
                    timestamp: msg.timestamp,
                    details: 'Запрошено фото'
                });
                this.updateEventsDisplay();
                // визуальный фидбек на карточке
                const card = document.querySelector(`[data-camera-id="${msg.cameraId}"]`);
                if(card) {
                    card.style.borderLeft = '4px solid #3498db';
                    card.style.background = 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)';
                    setTimeout(() => {
                        const cam = this.cameraManager.getCamera(msg.cameraId);
                        if(cam) card.style.borderLeft = `4px solid ${cam.status === 'online' ? '#27ae60' : '#95a5a6'}`;
                        card.style.background = '';
                    }, 1500);
                }
                break;
            case 'camera_message':
                this.history.addEvent({
                    type: 'message',
                    cameraName: msg.cameraId,
                    timestamp: msg.timestamp,
                    details: msg.text
                });
                this.updateEventsDisplay();
                break;
        }
    }

    updateUIFromCameras() {
        const cameras = this.cameraManager.getAllCameras();
        this.ui.updateCamerasList(cameras, (id) => this.requestPhoto(id), (id) => this.focusCamera(id), this.cameraManager.activeAnimations, this.history.getAll());
    }

    updateEventsDisplay() {
        const recent = this.history.getAll().slice(0, 10);
        this.ui.updateEventsTable(recent, (id) => this.showEventPhoto(id), (id) => this.deleteEvent(id));
    }

    requestPhoto(cameraId) {
        if (this.ws && this.ws.isConnected) {
            this.ws.requestPhoto(cameraId);
            const btn = event?.target;
            if(btn) {
                const original = btn.textContent;
                btn.textContent = '⏳ Запрашиваем...';
                btn.disabled = true;
                setTimeout(() => {
                    btn.textContent = original;
                    const cam = this.cameraManager.getCamera(cameraId);
                    btn.disabled = cam?.status !== 'online';
                }, 2000);
            }
        } else {
            alert('Нет подключения к серверу');
        }
    }

    focusCamera(cameraId) {
        this.map.focusCamera(cameraId);
        // подсветка карточки
        document.querySelectorAll('.client-card').forEach(card => {
            const cid = card.getAttribute('data-camera-id');
            const cam = this.cameraManager.getCamera(cid);
            if(cam) card.style.borderLeft = `4px solid ${cam.status === 'online' ? '#27ae60' : '#95a5a6'}`;
        });
        const card = document.querySelector(`[data-camera-id="${cameraId}"]`);
        if(card) {
            card.style.borderLeft = '4px solid #3498db';
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    showEventPhoto(eventId) {
        const event = this.history.getAll().find(e => e.id == eventId);
        if(event && event.photoData) {
            this.ui.showModal(event.photoData, event.cameraName, event.timestamp, 'history');
        }
    }

    async deleteEvent(eventId) {
        const numericId = parseInt(eventId);
        if (isNaN(numericId) || numericId > 999999) {
            // старый локальный ID
            this.history.deleteEventById(eventId);
            this.updateEventsDisplay();
            return;
        }
        if (!confirm('Удалить событие?')) return;
        try {
            const resp = await fetch(`/api/events/${numericId}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': this.auth.getToken() }
            });
            const data = await resp.json();
            if (data.success) {
                this.history.deleteEventById(numericId);
                this.updateEventsDisplay();
            } else {
                alert('Ошибка: ' + data.error);
            }
        } catch(e) { alert('Ошибка соединения'); }
    }

    showHistoryModal() {
        this.updateHistoryTable();
        this.ui.elements.historyModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    updateHistoryTable(filter = 'all') {
        let filtered = this.history.getAll();
        if (filter === 'fires') filtered = filtered.filter(e => e.type === 'fire');
        if (filter === 'connections') filtered = filtered.filter(e => e.type === 'connection' || e.type === 'disconnection');
        if (!filtered.length) {
            this.ui.elements.historyTable.innerHTML = '<tr><td colspan="5" class="empty-state">Нет событий</td></tr>';
            return;
        }
        this.ui.elements.historyTable.innerHTML = filtered.map(ev => {
            const typeClass = this.ui.getEventTypeClass(ev.type);
            const typeText = this.ui.getEventTypeText(ev.type);
            return `
            <tr>
                <td>${new Date(ev.timestamp).toLocaleString()}</td>
                <td><strong>${ev.cameraName || 'Система'}</strong></td>
                <td><span class="event-type ${typeClass}">${typeText}</span></td>
                <td>${ev.details || ''}</td>
                <td style="white-space:nowrap;">
                    ${ev.photoData ? `<img src="data:image/jpeg;base64,${ev.photoData}" class="history-photo" onclick="event.stopPropagation(); window.app.showEventPhoto(${ev.id})" alt="Фото">` : '-'}
                    <button class="delete-event-btn" onclick="event.stopPropagation(); window.app.deleteEvent(${ev.id})" title="Удалить">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    }

    setHistoryFilter(filter) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        if (filter === 'all') this.ui.elements.filterAll.classList.add('active');
        if (filter === 'fires') this.ui.elements.filterFires.classList.add('active');
        if (filter === 'connections') this.ui.elements.filterConnections.classList.add('active');
        this.updateHistoryTable(filter);
    }

    clearHistory() {
        if (confirm('Очистить всю историю?')) {
            this.history.clear();
            this.updateEventsDisplay();
            this.updateHistoryTable();
        }
    }

    logout() {
        this.auth.logout();
        if (this.ws) this.ws.disconnect();
    }
}

// Запуск приложения
new App();