export class CameraManager {
    constructor() {
        this.cameras = new Map();
        this.activeAnimations = new Set();
        this.fireTimeouts = new Map();
    }

    updateFromServer(camerasArray) {
        const newMap = new Map();
        for (const cam of camerasArray) {
            newMap.set(cam.id, cam);
        }
        this.cameras = newMap;
    }

    getCamera(id) {
        return this.cameras.get(id);
    }

    getAllCameras() {
        return Array.from(this.cameras.values());
    }

    updateCameraStatus(id, status, ip = null, connectedAt = null) {
        const cam = this.cameras.get(id);
        if (cam) {
            cam.status = status;
            if (ip) cam.ip = ip;
            if (connectedAt) cam.connectedAt = connectedAt;
            this.cameras.set(id, cam);
        }
    }

    startFireAnimation(cameraId, durationMs = 10000) {
        if (this.activeAnimations.has(cameraId)) return;
        this.activeAnimations.add(cameraId);
        if (this.fireTimeouts.has(cameraId)) clearTimeout(this.fireTimeouts.get(cameraId));
        const timeout = setTimeout(() => {
            this.stopFireAnimation(cameraId);
        }, durationMs);
        this.fireTimeouts.set(cameraId, timeout);
    }

    stopFireAnimation(cameraId) {
        this.activeAnimations.delete(cameraId);
        if (this.fireTimeouts.has(cameraId)) {
            clearTimeout(this.fireTimeouts.get(cameraId));
            this.fireTimeouts.delete(cameraId);
        }
    }

    isFireAnimating(cameraId) {
        return this.activeAnimations.has(cameraId);
    }
}