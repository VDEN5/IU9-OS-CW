import { pool } from '../db.js';

export const systemRepository = {
  async getCameraModels() {
    const res = await pool.query('SELECT * FROM camera_model ORDER BY name');
    return res.rows;
  },
  async getCameraTypes() {
    const res = await pool.query('SELECT * FROM camera_type ORDER BY name');
    return res.rows;
  },
  async getAddresses() {
    const res = await pool.query('SELECT * FROM address ORDER BY region, city');
    return res.rows;
  },
  async getDepartments() {
    const res = await pool.query('SELECT * FROM department ORDER BY name');
    return res.rows;
  },
};