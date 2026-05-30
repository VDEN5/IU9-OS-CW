import express from 'express';
import { createServer } from 'http';
import { config } from './config/index.js';
import { testConnection, closeDb } from './database/db.js';
import { initWebSocketServer } from './websocket/index.js';
import apiRouter from './routes/api.js';
import { eventService } from './services/eventService.js';

const app = express();
const server = createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(config.publicDir));

app.use('/api', apiRouter);

initWebSocketServer(server);

server.listen(config.port, async () => {
  console.log(`🚀 Сервер запущен на http://localhost:${config.port}`);
  const dbOk = await testConnection();
  if (!dbOk) {
    console.log('⚠️ Работа без БД, функционал ограничен');
  }
  await eventService.saveEvent('system', 'system', { message: 'Сервер мониторинга запущен' });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Остановка сервера...');
  await eventService.saveEvent('system', 'system', { message: 'Сервер мониторинга остановлен' });
  await closeDb();
  process.exit();
});