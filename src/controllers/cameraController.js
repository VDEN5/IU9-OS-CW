import { cameraService } from '../services/cameraService.js';
import { systemService } from '../services/systemService.js';

export const cameraController = {
  async getModels(req, res) {
    const models = await systemService.getCameraModels();
    res.json({ success: true, models });
  },
  async getTypes(req, res) {
    const types = await systemService.getCameraTypes();
    res.json({ success: true, types });
  },
  async getStats(req, res) {
    const stats = await cameraService.getStats();
    res.json({ success: true, stats });
  },
};