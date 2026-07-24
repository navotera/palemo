CREATE TABLE sso_role_mappings (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    external_role text NOT NULL,
    npms_role text NOT NULL CHECK (npms_role IN ('admin','manager','supervisor','staff')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, external_role)
);
INSERT INTO sso_role_mappings(tenant_id,external_role,npms_role)
SELECT id, role, role FROM tenants CROSS JOIN (VALUES ('admin'),('manager'),('supervisor'),('staff')) AS roles(role);
