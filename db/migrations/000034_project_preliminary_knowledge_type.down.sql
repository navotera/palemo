UPDATE wiki_pages w SET knowledge_type_id = wiki.id, knowledge_types = array_remove(w.knowledge_types,'project_preliminary_notes')
FROM knowledge_types source, knowledge_types wiki
WHERE source.id=w.knowledge_type_id AND source.slug='project_preliminary_notes'
  AND wiki.tenant_id=w.tenant_id AND wiki.slug='wiki';
DELETE FROM knowledge_types WHERE slug='project_preliminary_notes' AND is_system=true;