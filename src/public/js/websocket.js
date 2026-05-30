export class WebSocketManager {
    constructor(onMessage, onConnected, onDisconnected) {
        this.ws = null;
        this.isConnected = false;
        this.onMessage = onMessage;
        this.onConnected = onConnected;
        this.onDisconnected = onDisconnected;
        this.token = null;
    }

    connect(token) {
        this.token = token;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = token ? `${protocol}//${location.host}?token=${token}` : `${protocol}//${location.host}`;
        
        console.log('🔗 Подключение к WebSocket...');
        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
            console.log('✅ WebSocket соединён');
            this.isConnected = true;
            if (this.onConnected) this.onConnected();
        };
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (this.onMessage) this.onMessage(msg);
            } catch(e) { console.error('Ошибка парсинга сообщения', e); }
        };
        this.ws.onclose = () => {
            console.log('❌ WebSocket отключён');
            this.isConnected = false;
            if (this.onDisconnected) this.onDisconnected();
            setTimeout(() => this.connect(this.token), 3000);
        };
        this.ws.onerror = (err) => console.error('WebSocket ошибка', err);
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    requestPhoto(cameraId) {
        this.send({ type: 'request_photo', cameraId });
    }

    disconnect() {
        if (this.ws) this.ws.close();
    }
}