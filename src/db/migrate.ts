import { getDb, execute } from './connection.js';

const UP = `
  -- Person table (central node of the family graph)
  CREATE TABLE IF NOT EXISTS person (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name    VARCHAR(255) NOT NULL,
    last_name     VARCHAR(255) DEFAULT '',
    gender        VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')) DEFAULT 'other',
    is_deceased   BOOLEAN DEFAULT false,
    birth_date    VARCHAR(50),
    bio           TEXT,
    location      VARCHAR(255),
    is_deleted    BOOLEAN DEFAULT false,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- Relationship table (directed edges of the family graph)
  CREATE TABLE IF NOT EXISTS relationship (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_person_id    UUID NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    target_person_id    UUID NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    relationship_type   VARCHAR(10) NOT NULL CHECK (relationship_type IN ('PARENT', 'CHILD', 'SPOUSE')),
    status              VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
    created_by          VARCHAR(255),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT no_self_relationship CHECK (source_person_id != target_person_id),
    CONSTRAINT unique_relationship UNIQUE (source_person_id, target_person_id, relationship_type)
  );

  -- User table (authentication layer, links to a person)
  CREATE TABLE IF NOT EXISTS app_user (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
    person_id     UUID UNIQUE NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- Indexes for fast lookups
  CREATE INDEX IF NOT EXISTS idx_relationship_source   ON relationship(source_person_id);
  CREATE INDEX IF NOT EXISTS idx_relationship_target   ON relationship(target_person_id);
  CREATE INDEX IF NOT EXISTS idx_relationship_type     ON relationship(relationship_type);
  CREATE INDEX IF NOT EXISTS idx_user_person           ON app_user(person_id);
  CREATE INDEX IF NOT EXISTS idx_person_active         ON person(is_deleted) WHERE is_deleted = false;
`;

const DOWN = `
  DROP TABLE IF EXISTS app_user    CASCADE;
  DROP TABLE IF EXISTS relationship CASCADE;
  DROP TABLE IF EXISTS person       CASCADE;
`;

async function migrate() {
    let db;
    try {
        db = await getDb();
        await db.authenticate();
        console.log('✅  Connected to database');

        // Check for --fresh flag to drop & recreate
        if (process.argv.includes('--fresh')) {
            console.log('🗑️   Dropping existing tables (--fresh)...');
            await execute(DOWN);
        }

        console.log('🔨  Running migration...');
        await execute(UP);
        console.log('✅  Migration complete');
    } catch (err) {
        console.error('❌  Migration failed:', err);
        process.exit(1);
    } finally {
        if (db) await db.close();
    }
}

migrate();
