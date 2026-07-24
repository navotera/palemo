CREATE TABLE ai_integration_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 is_enabled boolean NOT NULL DEFAULT false, provider text NOT NULL DEFAULT 'openai' CHECK(provider IN('openai','anthropic','gemini','custom')),
 model text, base_url text, api_key_ciphertext text,
 project_data_access text NOT NULL DEFAULT 'summary' CHECK(project_data_access IN('summary','summary_and_activities','full_project')),
 auto_report_enabled boolean NOT NULL DEFAULT false, report_frequency text NOT NULL DEFAULT 'weekly' CHECK(report_frequency IN('weekly','monthly','on_completion')),
 delivery_mode text NOT NULL DEFAULT 'review' CHECK(delivery_mode IN('review','send_to_client')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id)
);
CREATE INDEX ai_integration_settings_tenant_idx ON ai_integration_settings(tenant_id);

CREATE TABLE github_integration_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 is_enabled boolean NOT NULL DEFAULT false, api_base_url text NOT NULL DEFAULT 'https://api.github.com',
 access_token_ciphertext text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id)
);
CREATE INDEX github_integration_settings_tenant_idx ON github_integration_settings(tenant_id);