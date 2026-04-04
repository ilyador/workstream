ALTER TABLE flows ADD COLUMN IF NOT EXISTS default_types text[] NOT NULL DEFAULT '{}';

-- Populate for existing flows (Doc Search excluded -- only enabled when RAG is configured)
UPDATE flows SET default_types = '{bug-fix}' WHERE name = 'Bug Hunter';
UPDATE flows SET default_types = '{feature,ui-fix,design,chore}' WHERE name = 'Developer';
UPDATE flows SET default_types = '{refactor}' WHERE name = 'Refactorer';
UPDATE flows SET default_types = '{test}' WHERE name = 'Tester';
