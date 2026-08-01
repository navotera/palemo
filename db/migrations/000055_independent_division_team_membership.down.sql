DROP TABLE IF EXISTS division_members;
DROP TABLE IF EXISTS team_divisions;

ALTER TABLE divisions
    DROP CONSTRAINT IF EXISTS divisions_tenant_id_id_unique;
