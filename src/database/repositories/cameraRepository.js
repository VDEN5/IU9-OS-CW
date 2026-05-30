import { pool } from '../db.js';

export const cameraRepository = {
  async getAll(departmentTin = null) {
    let query = `
      SELECT 
        c.*, d.name as department_name, d.taxpayerindividualnumber as department_tin
      FROM cameras c
      LEFT JOIN department d ON c.department_tin = d.taxpayerindividualnumber
    `;
    const params = [];
    if (departmentTin) {
      query += ` WHERE c.department_tin = $1`;
      params.push(departmentTin);
    }
    query += ` ORDER BY c.name`;
    const result = await pool.query(query, params);
    return result.rows;
  },

  async updateStatus(cameraId, status, ip = null) {
    const query = `
      UPDATE cameras 
      SET status = $1::VARCHAR, 
          ip = COALESCE($2::VARCHAR, ip),
          last_activity = CURRENT_TIMESTAMP,
          connected_at = CASE 
            WHEN $1::VARCHAR = 'online' AND connected_at IS NULL 
            THEN CURRENT_TIMESTAMP 
            ELSE connected_at 
          END
      WHERE id = $3::VARCHAR
      RETURNING *
    `;
    const result = await pool.query(query, [status, ip, cameraId]);
    return result.rows[0] || null;
  },

  async getStats() {
    const byModel = await pool.query(`
      SELECT 
        cm.name as model_name,
        COUNT(c.id) as camera_count,
        COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_count
      FROM camera_model cm
      LEFT JOIN cameras c ON cm.modelid = c.model_id
      GROUP BY cm.name
      ORDER BY camera_count DESC
    `);
    const byType = await pool.query(`
      SELECT 
        ct.name as type_name,
        AVG(ct.range) as avg_range,
        COUNT(c.id) as camera_count
      FROM camera_type ct
      LEFT JOIN cameras c ON ct.cameraid = c.type_id
      GROUP BY ct.name
    `);
    return { byModel: byModel.rows, byType: byType.rows };
  },
};