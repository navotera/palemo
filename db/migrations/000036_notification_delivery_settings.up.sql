CREATE TABLE notification_delivery_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    provider text NOT NULL DEFAULT 'ecopa' CHECK (provider IN ('ecopa','palemo_smtp')),
    ecopa_base_url text,
    ecopa_client_id text,
    ecopa_secret_ciphertext text,
    smtp_host text,
    smtp_port integer CHECK (smtp_port BETWEEN 1 AND 65535),
    smtp_encryption text CHECK (smtp_encryption IN ('tls','ssl','none')),
    smtp_username text,
    smtp_password_ciphertext text,
    smtp_from_email text,
    smtp_from_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id)
);
CREATE INDEX notification_delivery_settings_tenant_idx ON notification_delivery_settings (tenant_id);