import 'dotenv/config';
import pg from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set DATABASE_URL in .env first');
  const targetUrl = new URL(connectionString);
  const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseName)) throw new Error('Invalid database name in DATABASE_URL');

  targetUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: targetUrl.toString(), connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (existing.rowCount) {
      console.log(`Database ${databaseName} already exists.`);
      return;
    }
    await client.query(`CREATE DATABASE "${databaseName}"`);
    console.log(`Created database ${databaseName}.`);
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
