import pkg from 'pg';
const { Pool } = pkg;
import { config } from '../config/index.js';

export const pool = new Pool(config.db);

export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL подключена');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Ошибка PostgreSQL:', err.message);
    return false;
  }
}

export async function closeDb() {
  await pool.end();
  console.log('📁 Соединение с БД закрыто');
}