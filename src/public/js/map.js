export class MapManager {
    constructor(containerId, onCameraClick) {
        this.map = null;
        this.containerId = containerId;
        this.onCameraClick = onCameraClick;
        this.markers = new Map(); 
        this.isReady = false;
        this.pendingCameras = null;
        this.init();
    }

    init() {
        ymaps.ready(() => {
            this.map = new ymaps.Map(this.containerId, {
                center: [60, 80],
                zoom: 3,
                controls: ['zoomControl', 'fullscreenControl']
            });
            this.map.controls.add('trafficControl');
            this.isReady = true;
            console.log('🗺️ Карта готова');
            if (this.pendingCameras) {
                this.updateMarkers(this.pendingCameras);
                this.pendingCameras = null;
            }
        });
    }

    updateMarkers(cameras) {
        if (!this.isReady) {
            this.pendingCameras = cameras;
            return;
        }
        // удаляем старые
        this.markers.forEach(marker => this.map.geoObjects.remove(marker));
        this.markers.clear();

        cameras.forEach(cam => {
            const isFire = cam.hasRecentFire; // флаг, устанавливаемый извне
            const marker = this.createMarker(cam, isFire);
            marker.events.add('click', () => this.onCameraClick(cam.id));
            this.map.geoObjects.add(marker);
            this.markers.set(cam.id, marker);
        });

        try {
            const bounds = this.map.geoObjects.getBounds();
            if (bounds) this.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
        } catch(e) {}
    }

    createMarker(camera, isFire) {
        if (isFire) {
            const layout = ymaps.templateLayoutFactory.createClass(
                `<div class="fire-marker animated" style="width:50px;height:50px;background-image:url('fire.svg');"></div>`
            );
            return new ymaps.Placemark(camera.coords, {
                balloonContent: this.balloonContent(camera, true),
                iconCaption: camera.name
            }, {
                iconLayout: layout,
                iconShape: { type: 'Circle', coordinates: [0,0], radius: 25 }
            });
        } else {
            return new ymaps.Placemark(camera.coords, {
                balloonContent: this.balloonContent(camera, false),
                iconCaption: camera.name
            }, {
                preset: camera.status === 'online' ? 'islands#greenIcon' : 'islands#grayIcon',
                iconColor: camera.status === 'online' ? '#27ae60' : '#95a5a6'
            });
        }
    }

    balloonContent(camera, hasFire) {
        return `
            <div style="min-width:250px;">
                <strong>${camera.name}</strong><br/>
                <em>${camera.location}</em><br/>
                <div style="margin:8px 0;padding:8px;background:#f8f9fa;border-radius:6px;">
                    <strong>Статус:</strong> ${camera.status === 'online' ? '🟢 Онлайн' : '🔴 Офлайн'}<br/>
                    ${camera.status === 'online' ? `<strong>IP:</strong> ${camera.ip}<br/><strong>Подключена:</strong> ${new Date(camera.connectedAt).toLocaleTimeString()}` : ''}
                </div>
                ${hasFire ? '<div style="color:#e74c3c;font-weight:bold;background:#ffebee;padding:8px;border-radius:6px;">🔥 ОБНАРУЖЕН ПОЖАР</div>' : ''}
            </div>
        `;
    }

    setFireAnimation(cameraId, enable) {
        const marker = this.markers.get(cameraId);
        if (!marker) return;
        if (enable) {
            const layout = ymaps.templateLayoutFactory.createClass(
                `<div class="fire-marker animated" style="width:50px;height:50px;background-image:url('fire.svg');"></div>`
            );
            marker.options.set({ iconLayout: layout, iconShape: { type: 'Circle', coordinates: [0,0], radius: 25 } });
        } else {
            const camera = this.getCameraData(cameraId); 
            marker.options.set({
                preset: camera?.status === 'online' ? 'islands#greenIcon' : 'islands#grayIcon',
                iconColor: camera?.status === 'online' ? '#27ae60' : '#95a5a6',
                iconLayout: 'default#imageWithContent'
            });
        }
    }

    setCameraDataSupplier(fn) {
        this.getCameraData = fn;
    }

    focusCamera(cameraId) {
        const camera = this.getCameraData(cameraId);
        if (camera && this.map) {
            this.map.setCenter(camera.coords, 8);
            const marker = this.markers.get(cameraId);
            if (marker) marker.balloon.open();
        }
    }
}