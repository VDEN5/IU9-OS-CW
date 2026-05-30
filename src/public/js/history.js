export class HistoryManager {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.events = [];
        this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem('fireMonitoringHistory');
            this.events = saved ? JSON.parse(saved) : [];
            console.log(`📚 Загружено ${this.events.length} событий из хранилища`);
        } catch(e) { this.events = []; }
    }

    saveToStorage() {
        try {
            localStorage.setItem('fireMonitoringHistory', JSON.stringify(this.events));
        } catch(e) {}
    }

    addEvent(event) {
        event.id = Date.now() + Math.random();
        this.events.unshift(event);
        if (this.events.length > this.maxSize) this.events.pop();
        this.saveToStorage();
    }

    getAll() {
        return this.events;
    }

    deleteEventById(eventId) {
        const index = this.events.findIndex(e => e.id == eventId);
        if (index !== -1) {
            this.events.splice(index, 1);
            this.saveToStorage();
            return true;
        }
        return false;
    }

    clear() {
        this.events = [];
        this.saveToStorage();
    }

    // Метод для синхронизации с серверными событиями (вызывается при получении нового события)
    syncWithServerEvent(serverEvent) {
        if (!this.events.some(e => e.id === serverEvent.id)) {
            this.addEvent({
                id: serverEvent.id,
                cameraName: serverEvent.cameraName,
                type: serverEvent.type,
                timestamp: serverEvent.timestamp,
                details: serverEvent.details,
                photoData: serverEvent.photoData
            });
        }
    }
}