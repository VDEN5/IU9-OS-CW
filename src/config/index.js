import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: process.env.PORT || 8081,
  db: {
    user: 'postgres',
    host: 'localhost',
    database: 'fire_monitoring',
    password: 'postgres',
    port: 5432,
  },
  uploadsDir: path.join(__dirname, '../../uploads'),
  publicDir: path.join(__dirname, '../public'),
};