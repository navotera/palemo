CREATE TABLE project_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    color text NOT NULL DEFAULT '#60766a',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX project_types_tenant_id_idx ON project_types (tenant_id);
CREATE UNIQUE INDEX project_types_tenant_name_ci_idx ON project_types (tenant_id, lower(name));

CREATE TABLE project_metadata_fields (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    field_key text NOT NULL,
    field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select')),
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_required boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, field_key)
);
CREATE INDEX project_metadata_fields_tenant_id_idx ON project_metadata_fields (tenant_id);
CREATE UNIQUE INDEX project_metadata_fields_tenant_key_ci_idx ON project_metadata_fields (tenant_id, lower(field_key));

