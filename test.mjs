import pg from 'pg';


const client = new pg.Client('postgresql://myuser:mypassword@127.0.0.1:5433/fire_monitoring?sslmode=disable');

await client.connect();
console.log('✅ Подключение успешно!');
const res = await client.query('SELECT NOW()');
console.log('🕒 Время на сервере:', res.rows[0]);
await client.end();