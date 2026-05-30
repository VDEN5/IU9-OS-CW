import { pool } from '../db.js';

export const userRepository = {
  async checkCredentials(login, password) {
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
  },
};