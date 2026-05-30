import { cameraRepository } from '../database/repositories/cameraRepository.js';

export const cameraService = {
  async getAllCameras(departmentTin = null) {
    const rows = await cameraRepository.getAll(departmentTin);
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      location: row.location,
      ip: row.ip || '',
      coords: [parseFloat(row.coords_lat), parseFloat(row.coords_lng)],
      department: row.department_name,
      department_tin: row.department_tin,
    }));
  },

  async updateStatus(cameraId, status, ip) {
    return cameraRepository.updateStatus(cameraId, status, ip);
  },

  async getStats() {
    return cameraRepository.getStats();
  },
};