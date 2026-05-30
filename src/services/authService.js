import { userRepository } from '../database/repositories/userRepository.js';

const activeSessions = new Map();

export const authService = {
  async login(login, password) {
    const user = await userRepository.checkCredentials(login, password);
    if (!user) return null;
    let departmentTin = null;
    if (user.department) {
      const { pool } = await import('../database/db.js');
      const deptRes = await pool.query('SELECT taxpayerindividualnumber FROM department WHERE name = $1', [user.department]);
      if (deptRes.rows[0]) departmentTin = deptRes.rows[0].taxpayerindividualnumber;
    }
    const sessionUser = { ...user, department_tin: departmentTin };
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    activeSessions.set(token, sessionUser);
    return { token, user: { name: user.name, position: user.position, department: user.department } };
  },

  getUserByToken(token) {
    return activeSessions.get(token) || null;
  },

  logout(token) {
    const user = activeSessions.get(token);
    if (user) activeSessions.delete(token);
    return user;
  },
};