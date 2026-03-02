/**
 * Migration runner — reads numbered .up.sql / .down.sql files
 * from the migrations/ folder and executes them in order.
 *
 * Usage:
 *   npm run migrate            # run all UP migrations
 *   npm run migrate -- --fresh  # run all DOWN then UP (destructive!)
 *   npm run migrate -- --down   # run all DOWN migrations only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, execute } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function getMigrationFiles(direction: 'up' | 'down'): string[] {
    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(`.${direction}.sql`))
        .sort();

    // down migrations run in reverse order
    if (direction === 'down') files.reverse();

    return files;
}

async function runMigrations(direction: 'up' | 'down') {
    const files = getMigrationFiles(direction);

    if (files.length === 0) {
        console.log(`ℹ️   No ${direction} migration files found.`);
        return;
    }

    for (const file of files) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
        console.log(`  ▶ ${file}`);
        await execute(sql);
    }
}

async function migrate() {
    let db;
    try {
        db = await getDb();
        await db.authenticate();
        console.log('✅  Connected to database');

        const isFresh = process.argv.includes('--fresh');
        const isDown = process.argv.includes('--down');

        if (isFresh) {
            console.log('🗑️   Running DOWN migrations (--fresh)…');
            await runMigrations('down');
            console.log('🔨  Running UP migrations…');
            await runMigrations('up');
        } else if (isDown) {
            console.log('🗑️   Running DOWN migrations…');
            await runMigrations('down');
        } else {
            console.log('🔨  Running UP migrations…');
            await runMigrations('up');
        }

        console.log('✅  Migration complete');
    } catch (err) {
        console.error('❌  Migration failed:', err);
        process.exit(1);
    } finally {
        if (db) await db.close();
    }
}

migrate();
