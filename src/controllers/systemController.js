import { systemService } from '../services/systemService.js';

export const systemController = {
  async getAddresses(req, res) {
    const addresses = await systemService.getAddresses();
    res.json({ success: true, addresses });
  },
  async getDepartments(req, res) {
    const departments = await systemService.getDepartments();
    res.json({ success: true, departments });
  },
};