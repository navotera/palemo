ALTER TABLE divisions
    ADD CONSTRAINT divisions_tenant_id_id_unique UNIQUE (tenant_id, id);

CREATE TABLE team_divisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    team_id uuid NOT NULL,
    division_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT team_divisions_tenant_team_fk
        FOREIGN KEY (tenant_id, team_id) REFERENCES teams(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT team_divisions_tenant_division_fk
        FOREIGN KEY (tenant_id, division_id) REFERENCES divisions(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT team_divisions_tenant_team_division_unique
        UNIQUE (tenant_id, team_id, division_id)
);

CREATE INDEX team_divisions_tenant_division_idx
    ON team_divisions (tenant_id, division_id, team_id);

CREATE TABLE division_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    division_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT division_members_tenant_division_fk
        FOREIGN KEY (tenant_id, division_id) REFERENCES divisions(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT division_members_tenant_user_fk
        FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT division_members_tenant_division_user_unique
        UNIQUE (tenant_id, division_id, user_id)
);

CREATE INDEX division_members_tenant_user_idx
    ON division_members (tenant_id, user_id, division_id);

INSERT INTO team_divisions (tenant_id, team_id, division_id)
SELECT tenant_id, id, division_id
FROM teams
WHERE division_id IS NOT NULL
ON CONFLICT (tenant_id, team_id, division_id) DO NOTHING;

INSERT INTO division_members (tenant_id, division_id, user_id)
SELECT u.tenant_id, t.division_id, u.id
FROM users u
JOIN teams t ON t.tenant_id = u.tenant_id AND t.id = u.team_id
WHERE t.division_id IS NOT NULL
ON CONFLICT (tenant_id, division_id, user_id) DO NOTHING;
