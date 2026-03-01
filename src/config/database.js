import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('connect', () => {
    console.log('Conectado ao banco');
});

pool.on('error', (err) => {
    console.error('Erro:', err);
    process.exit(-1);
});

export default pool;
