import { pool } from '../db.js';

export const eventRepository = {
  async save(cameraId, eventType, options = {}) {
    const { message = null, photoData = null, isFire = false, severity = 0 } = options;
    const finalCameraId = cameraId === 'system' ? null : cameraId;
    const result = await pool.query(
      `INSERT INTO camera_events (camera_id, event_type, message, photo_data, is_fire, severity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *`,
      [finalCameraId, eventType, message, photoData, isFire, severity]
    );
    return result.rows[0];
  },

  async getHistory({ limit, offset, cameraId, eventType, isFire }) {
    let query = `
      SELECT 
        e.id, e.camera_id, e.event_type, e.message, e.photo_data, 
        e.is_fire, e.severity, e.created_at,
        c.name as camera_name
      FROM camera_events e
      LEFT JOIN cameras c ON e.camera_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (cameraId) { query += ` AND e.camera_id = $${idx++}`; params.push(cameraId); }
    if (eventType) { query += ` AND e.event_type = $${idx++}`; params.push(eventType); }
    if (isFire !== null) { query += ` AND e.is_fire = $${idx++}`; params.push(isFire); }
    query += ` ORDER BY e.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    return result.rows;
  },

  async deleteById(eventId) {
    const result = await pool.query('DELETE FROM camera_events WHERE id = $1::BIGINT RETURNING id', [eventId]);
    return result.rowCount > 0;
  },

  async getCameraDepartmentTin(cameraId) {
    const res = await pool.query('SELECT department_tin FROM cameras WHERE id = $1::VARCHAR', [cameraId]);
    return res.rows[0]?.department_tin || null;
  },
};