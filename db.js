import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'fire_monitoring',
    password: 'vden2005',  
    port: 5432,
});

const activeSessions = new Map();

const EVENT_TYPES = {
    'fire': { ru: '🔥 ПОЖАР', severity: 10 },
    'connection': { ru: '✅ ПОДКЛЮЧЕНИЕ', severity: 1 },
    'disconnection': { ru: '❌ ОТКЛЮЧЕНИЕ', severity: 2 },
    'message': { ru: '💬 СООБЩЕНИЕ', severity: 0 },
    'photo_request': { ru: '📸 ЗАПРОС ФОТО', severity: 3 },
    'photo_upload': { ru: '📸 ПОЛУЧЕНО ФОТО', severity: 3 },
    'system': { ru: '⚙️ СИСТЕМА', severity: 5 }
};

export async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ Подключено к PostgreSQL');
        client.release();
        return true;
    } catch (err) {
        console.error('❌ Ошибка подключения:', err.message);
        return false;
    }
}

export async function getCameras(departmentTin = null) {
    try {
        let query = `
            SELECT 
                c.*,
                d.name as department_name,
                d.taxpayerindividualnumber as department_tin
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
        const cameras = {};
        result.rows.forEach(cam => {
            cameras[cam.id] = {
                name: cam.name,
                location: cam.location,
                ip: cam.ip || '',
                coords: [parseFloat(cam.coords_lat), parseFloat(cam.coords_lng)],
                department: cam.department_name,
                department_tin: cam.department_tin
            };
        });
        return cameras;
    } catch (err) {
        console.error('❌ Ошибка получения камер:', err);
        return {};
    }
}

export async function updateCameraStatus(cameraId, status, ip = null) {
    try {
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
    } catch (err) {
        console.error(`❌ Ошибка обновления статуса камеры ${cameraId}:`, err);
        return null;
    }
}

export async function saveEvent(cameraId, eventType, options = {}) {
    try {
        const {
            message = null,
            photoData = null,
            isFire = false
        } = options;

        const eventInfo = EVENT_TYPES[eventType] || { ru: eventType, severity: 0 };
        const finalCameraId = cameraId === 'system' ? null : cameraId;
        
        const query = `
            INSERT INTO camera_events (
                camera_id, event_type, message, photo_data, is_fire, severity, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            finalCameraId, eventType, message, photoData, isFire, eventInfo.severity
        ]);
        
        console.log(`💾 Событие сохранено: ${eventInfo.ru}`);
        return result.rows[0];
    } catch (err) {
        console.error(`❌ Ошибка сохранения события:`, err);
        return null;
    }
}

export async function getEventsHistory(options = {}) {
    try {
        const { limit = 100, offset = 0, cameraId = null, eventType = null, isFire = null } = options;
        
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
    } catch (err) {
        console.error(`❌ Ошибка получения истории:`, err);
        return [];
    }
}

export async function getRecentEvents(limit = 20) {
    return getEventsHistory({ limit });
}

export async function deleteEvent(eventId) {
    try {
        const result = await pool.query('DELETE FROM camera_events WHERE id = $1::BIGINT RETURNING id', [eventId]);
        if (result.rowCount > 0) {
            console.log(`🗑️ Событие ${eventId} удалено из БД`);
            return true;
        }
        console.log(`⚠️ Событие ${eventId} не найдено`);
        return false;
    } catch (err) {
        console.error(`❌ Ошибка удаления события ${eventId}:`, err);
        return false;
    }
}


export async function getCameraModels() {
    try {
        const result = await pool.query('SELECT * FROM camera_model ORDER BY name');
        return result.rows;
    } catch (err) {
        console.error('❌ Ошибка получения моделей камер:', err);
        return [];
    }
}

export async function getCameraTypes() {
    try {
        const result = await pool.query('SELECT * FROM camera_type ORDER BY name');
        return result.rows;
    } catch (err) {
        console.error('❌ Ошибка получения типов камер:', err);
        return [];
    }
}

export async function getAddresses() {
    try {
        const result = await pool.query('SELECT * FROM address ORDER BY region, city');
        return result.rows;
    } catch (err) {
        console.error('❌ Ошибка получения адресов:', err);
        return [];
    }
}

export async function getDepartments() {
    try {
        const result = await pool.query('SELECT * FROM department ORDER BY name');
        return result.rows;
    } catch (err) {
        console.error('❌ Ошибка получения департаментов:', err);
        return [];
    }
}

export async function getCameraStats() {
    try {
        const stats = await pool.query(`
            SELECT 
                cm.name as model_name,
                COUNT(c.id) as camera_count,
                COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_count
            FROM camera_model cm
            LEFT JOIN cameras c ON cm.modelid = c.model_id
            GROUP BY cm.name
            ORDER BY camera_count DESC
        `);
        
        const typeStats = await pool.query(`
            SELECT 
                ct.name as type_name,
                AVG(ct.range) as avg_range,
                COUNT(c.id) as camera_count
            FROM camera_type ct
            LEFT JOIN cameras c ON ct.cameraid = c.type_id
            GROUP BY ct.name
        `);
        
        return {
            byModel: stats.rows,
            byType: typeStats.rows
        };
    } catch (err) {
        console.error('❌ Ошибка получения статистики камер:', err);
        return null;
    }
}

export async function checkUser(login, password) {
    try {
        const result = await pool.query(
            `SELECT phone, name, position, department, login FROM employees 
             WHERE login = $1 AND password = $2`,
            [login, password]
        );
        if (result.rows.length > 0) {
            await pool.query('UPDATE employees SET last_login = CURRENT_TIMESTAMP WHERE login = $1', [login]);
            return result.rows[0];
        }
        return null;
    } catch (err) {
        console.error('❌ Ошибка проверки пользователя:', err);
        return null;
    }
}

export function createSession(user) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    activeSessions.set(token, user);
    return token;
}

export function getUserByToken(token) {
    return activeSessions.get(token) || null;
}

export function removeSession(token) {
    activeSessions.delete(token);
}

export async function closeDb() {
    await pool.end();
    console.log('📁 Соединение с БД закрыто');
}

export { pool };