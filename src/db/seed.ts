import bcrypt from 'bcryptjs';
import { getDb, execute, queryOne } from './connection.js';
import type { PersonRow } from '../types/index.js';

async function seed() {
    let db;
    try {
        db = await getDb();
        await db.authenticate();
        console.log('✅  Connected to database');

        /* ---------------------------------------------------------------- */
        /*  1. Create person records                                         */
        /* ---------------------------------------------------------------- */

        // Azhar Mahmood (the logged-in admin user)
        const azhar = await queryOne<PersonRow>(
            `INSERT INTO person (first_name, last_name, gender, is_deceased, created_by)
       VALUES (:firstName, :lastName, :gender, false, 'system')
       ON CONFLICT DO NOTHING
       RETURNING *`,
            { firstName: 'Azhar', lastName: 'Mahmood', gender: 'male' },
        );

        // Tahir Mahmood (father)
        const tahir = await queryOne<PersonRow>(
            `INSERT INTO person (first_name, last_name, gender, is_deceased, created_by)
       VALUES (:firstName, :lastName, :gender, false, 'system')
       ON CONFLICT DO NOTHING
       RETURNING *`,
            { firstName: 'Tahir', lastName: 'Mahmood', gender: 'male' },
        );

        // Shabnam (mother)
        const shabnam = await queryOne<PersonRow>(
            `INSERT INTO person (first_name, last_name, gender, is_deceased, created_by)
       VALUES (:firstName, :lastName, :gender, false, 'system')
       ON CONFLICT DO NOTHING
       RETURNING *`,
            { firstName: 'Shabnam', lastName: '', gender: 'female' },
        );

        if (!azhar || !tahir || !shabnam) {
            console.log(
                '⚠️  Some person records already existed or failed to insert.',
            );
            console.log('   Run migration with --fresh first if you want a clean seed.');
            if (db) await db.close();
            return;
        }

        console.log(`👤  Created Azhar  (${azhar.id})`);
        console.log(`👤  Created Tahir  (${tahir.id})`);
        console.log(`👤  Created Shabnam (${shabnam.id})`);

        /* ---------------------------------------------------------------- */
        /*  2. Create relationships                                          */
        /* ---------------------------------------------------------------- */

        // Tahir is PARENT of Azhar  ↔  Azhar is CHILD of Tahir
        await execute(
            `INSERT INTO relationship (source_person_id, target_person_id, relationship_type, created_by)
       VALUES (:source, :target, 'PARENT', 'system')
       ON CONFLICT DO NOTHING`,
            { source: tahir.id, target: azhar.id },
        );
        await execute(
            `INSERT INTO relationship (source_person_id, target_person_id, relationship_type, created_by)
       VALUES (:source, :target, 'CHILD', 'system')
       ON CONFLICT DO NOTHING`,
            { source: azhar.id, target: tahir.id },
        );

        // Shabnam is PARENT of Azhar  ↔  Azhar is CHILD of Shabnam
        await execute(
            `INSERT INTO relationship (source_person_id, target_person_id, relationship_type, created_by)
       VALUES (:source, :target, 'PARENT', 'system')
       ON CONFLICT DO NOTHING`,
            { source: shabnam.id, target: azhar.id },
        );
        await execute(
            `INSERT INTO relationship (source_person_id, target_person_id, relationship_type, created_by)
       VALUES (:source, :target, 'CHILD', 'system')
       ON CONFLICT DO NOTHING`,
            { source: azhar.id, target: shabnam.id },
        );

        // Tahir SPOUSE Shabnam  ↔  Shabnam SPOUSE Tahir
        await execute(
            `INSERT INTO relationship (source_person_id, target_person_id, relationship_type, created_by)
       VALUES (:source, :target, 'SPOUSE', 'system')
       ON CONFLICT DO NOTHING`,
            { source: tahir.id, target: shabnam.id },
        );
        await execute(
            `INSERT INTO relationship (source_person_id, target_person_id, relationship_type, created_by)
       VALUES (:source, :target, 'SPOUSE', 'system')
       ON CONFLICT DO NOTHING`,
            { source: shabnam.id, target: tahir.id },
        );

        console.log('🔗  Created all relationships');

        /* ---------------------------------------------------------------- */
        /*  3. Create admin user for Azhar                                   */
        /* ---------------------------------------------------------------- */

        const passwordHash = await bcrypt.hash('admin123', 12);

        await execute(
            `INSERT INTO app_user (username, password_hash, role, person_id)
       VALUES (:username, :passwordHash, 'admin', :personId)
       ON CONFLICT DO NOTHING`,
            { username: 'azhar', passwordHash, personId: azhar.id },
        );

        console.log('🔑  Created admin user: azhar / admin123');
        console.log('');
        console.log('✅  Seed complete!');
    } catch (err) {
        console.error('❌  Seed failed:', err);
        process.exit(1);
    } finally {
        if (db) await db.close();
    }
}

seed();
