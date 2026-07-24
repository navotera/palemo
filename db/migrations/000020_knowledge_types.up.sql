CREATE TABLE knowledge_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    slug text NOT NULL CHECK (slug IN ('wiki','meetings','decisions','lessons')),
    label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 50),
    description text,
    color text NOT NULL DEFAULT '#3b9a68' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX knowledge_types_tenant_order_idx ON knowledge_types(tenant_id, sort_order);
INSERT INTO knowledge_types(tenant_id,slug,label,description,color,sort_order)
SELECT id, v.slug, v.label, v.description, v.color, v.sort_order
FROM tenants CROSS JOIN (VALUES
 ('wiki','Wiki','Structured company and team documentation','#3b9a68',10),
 ('meetings','Meetings','Meeting notes and follow-up context','#4774b8',20),
 ('decisions','Decisions','Decision records and consequences','#b47a32',30),
 ('lessons','Lessons learned','Reusable lessons from completed work','#7c5dba',40)
) AS v(slug,label,description,color,sort_order);