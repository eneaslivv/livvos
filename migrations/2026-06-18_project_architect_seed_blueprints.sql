-- ============================================================
-- Project Architect: seed starter blueprints
-- Date: 2026-06-18
-- ============================================================
-- These are PROVISIONAL shared templates (tenant_id NULL) so the
-- architect has something to apply on day one. The stage names,
-- effort weights, and default tasks are a reasonable starting
-- point, NOT a measured process.
--
-- TODO (calibrate to the real Livv delivery process):
--   - replace stage names + order with how work actually flows
--   - set effort_weight from real time logs (weights sum to ~1)
--   - replace default_tasks with the tasks each stage really has
--   - set honest estimate_hours per task
-- A tenant can override any of these by inserting its own row for
-- the same type; get_blueprint prefers the tenant's row.
-- ============================================================

-- web_framer ------------------------------------------------------
INSERT INTO project_blueprints (tenant_id, type, name, stages)
SELECT NULL, 'web_framer', 'Web in Framer (provisional)', '[
  { "name": "discovery", "order": 1, "effort_weight": 0.08, "default_tasks": [
    { "title": "Kickoff call and goals", "estimate_hours": 3, "depends_on": null },
    { "title": "Audit references and competitors", "estimate_hours": 3, "depends_on": null }
  ]},
  { "name": "architecture_wireframe", "order": 2, "effort_weight": 0.10, "default_tasks": [
    { "title": "Sitemap and page inventory", "estimate_hours": 4, "depends_on": null },
    { "title": "Low-fi wireframes", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "design", "order": 3, "effort_weight": 0.16, "default_tasks": [
    { "title": "Design system and key pages", "estimate_hours": 12, "depends_on": null },
    { "title": "Responsive states", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "build", "order": 4, "effort_weight": 0.24, "default_tasks": [
    { "title": "Build pages in Framer", "estimate_hours": 20, "depends_on": null },
    { "title": "Animations and interactions", "estimate_hours": 8, "depends_on": "Build pages in Framer" }
  ]},
  { "name": "integration", "order": 5, "effort_weight": 0.12, "default_tasks": [
    { "title": "Framer CMS and forms", "estimate_hours": 8, "depends_on": null },
    { "title": "Analytics and SEO basics", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "qa", "order": 6, "effort_weight": 0.10, "default_tasks": [
    { "title": "Cross-browser and device QA", "estimate_hours": 6, "depends_on": null },
    { "title": "Performance pass", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "client_review", "order": 7, "effort_weight": 0.06, "default_tasks": [
    { "title": "Share staging and collect feedback", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "adjustments", "order": 8, "effort_weight": 0.07, "default_tasks": [
    { "title": "Apply review changes", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "delivery", "order": 9, "effort_weight": 0.04, "default_tasks": [
    { "title": "Final checks and go live", "estimate_hours": 3, "depends_on": null }
  ]},
  { "name": "handoff", "order": 10, "effort_weight": 0.03, "default_tasks": [
    { "title": "Handoff docs and credentials", "estimate_hours": 2, "depends_on": null }
  ]}
]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM project_blueprints WHERE tenant_id IS NULL AND type = 'web_framer'
);

-- web_webflow -----------------------------------------------------
INSERT INTO project_blueprints (tenant_id, type, name, stages)
SELECT NULL, 'web_webflow', 'Web in Webflow (provisional)', '[
  { "name": "discovery", "order": 1, "effort_weight": 0.08, "default_tasks": [
    { "title": "Kickoff call and goals", "estimate_hours": 3, "depends_on": null },
    { "title": "Audit references and competitors", "estimate_hours": 3, "depends_on": null }
  ]},
  { "name": "architecture_wireframe", "order": 2, "effort_weight": 0.10, "default_tasks": [
    { "title": "Sitemap and page inventory", "estimate_hours": 4, "depends_on": null },
    { "title": "Low-fi wireframes", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "design", "order": 3, "effort_weight": 0.16, "default_tasks": [
    { "title": "Design system and key pages", "estimate_hours": 12, "depends_on": null },
    { "title": "Responsive states", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "build", "order": 4, "effort_weight": 0.24, "default_tasks": [
    { "title": "Build pages in Webflow Designer", "estimate_hours": 20, "depends_on": null },
    { "title": "Animations and interactions", "estimate_hours": 8, "depends_on": "Build pages in Webflow Designer" }
  ]},
  { "name": "integration", "order": 5, "effort_weight": 0.12, "default_tasks": [
    { "title": "Webflow CMS collections and forms", "estimate_hours": 8, "depends_on": null },
    { "title": "Analytics and SEO basics", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "qa", "order": 6, "effort_weight": 0.10, "default_tasks": [
    { "title": "Cross-browser and device QA", "estimate_hours": 6, "depends_on": null },
    { "title": "Performance pass", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "client_review", "order": 7, "effort_weight": 0.06, "default_tasks": [
    { "title": "Share staging and collect feedback", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "adjustments", "order": 8, "effort_weight": 0.07, "default_tasks": [
    { "title": "Apply review changes", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "delivery", "order": 9, "effort_weight": 0.04, "default_tasks": [
    { "title": "Final checks and publish", "estimate_hours": 3, "depends_on": null }
  ]},
  { "name": "handoff", "order": 10, "effort_weight": 0.03, "default_tasks": [
    { "title": "Handoff docs and credentials", "estimate_hours": 2, "depends_on": null }
  ]}
]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM project_blueprints WHERE tenant_id IS NULL AND type = 'web_webflow'
);

-- app_react_native ------------------------------------------------
INSERT INTO project_blueprints (tenant_id, type, name, stages)
SELECT NULL, 'app_react_native', 'App in React Native (provisional)', '[
  { "name": "discovery", "order": 1, "effort_weight": 0.08, "default_tasks": [
    { "title": "Kickoff and product goals", "estimate_hours": 3, "depends_on": null }
  ]},
  { "name": "architecture", "order": 2, "effort_weight": 0.10, "default_tasks": [
    { "title": "App architecture and navigation", "estimate_hours": 6, "depends_on": null },
    { "title": "Data model and API contract", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "design", "order": 3, "effort_weight": 0.16, "default_tasks": [
    { "title": "Design system and core screens", "estimate_hours": 12, "depends_on": null }
  ]},
  { "name": "build_core", "order": 4, "effort_weight": 0.24, "default_tasks": [
    { "title": "Build core screens and navigation", "estimate_hours": 20, "depends_on": null }
  ]},
  { "name": "api_integration", "order": 5, "effort_weight": 0.14, "default_tasks": [
    { "title": "Wire API and state management", "estimate_hours": 10, "depends_on": "Build core screens and navigation" }
  ]},
  { "name": "qa", "order": 6, "effort_weight": 0.10, "default_tasks": [
    { "title": "Device QA iOS and Android", "estimate_hours": 8, "depends_on": null }
  ]},
  { "name": "store_prep", "order": 7, "effort_weight": 0.08, "default_tasks": [
    { "title": "Store assets and metadata", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "launch", "order": 8, "effort_weight": 0.06, "default_tasks": [
    { "title": "Submit to App Store and Play", "estimate_hours": 3, "depends_on": null }
  ]},
  { "name": "handoff", "order": 9, "effort_weight": 0.04, "default_tasks": [
    { "title": "Handoff docs and repo access", "estimate_hours": 2, "depends_on": null }
  ]}
]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM project_blueprints WHERE tenant_id IS NULL AND type = 'app_react_native'
);

-- ai_integration --------------------------------------------------
INSERT INTO project_blueprints (tenant_id, type, name, stages)
SELECT NULL, 'ai_integration', 'AI integration (provisional)', '[
  { "name": "discovery", "order": 1, "effort_weight": 0.10, "default_tasks": [
    { "title": "Define use case and success metric", "estimate_hours": 4, "depends_on": null }
  ]},
  { "name": "data_audit", "order": 2, "effort_weight": 0.12, "default_tasks": [
    { "title": "Audit data sources and access", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "solution_design", "order": 3, "effort_weight": 0.16, "default_tasks": [
    { "title": "Design pipeline and prompts", "estimate_hours": 10, "depends_on": null }
  ]},
  { "name": "prototype", "order": 4, "effort_weight": 0.20, "default_tasks": [
    { "title": "Build prototype", "estimate_hours": 16, "depends_on": null }
  ]},
  { "name": "integration", "order": 5, "effort_weight": 0.16, "default_tasks": [
    { "title": "Integrate into product", "estimate_hours": 12, "depends_on": "Build prototype" }
  ]},
  { "name": "evaluation", "order": 6, "effort_weight": 0.12, "default_tasks": [
    { "title": "Evaluate quality and cost", "estimate_hours": 8, "depends_on": null }
  ]},
  { "name": "hardening", "order": 7, "effort_weight": 0.08, "default_tasks": [
    { "title": "Add guardrails and error handling", "estimate_hours": 6, "depends_on": null }
  ]},
  { "name": "deployment", "order": 8, "effort_weight": 0.04, "default_tasks": [
    { "title": "Deploy to production", "estimate_hours": 3, "depends_on": null }
  ]},
  { "name": "handoff", "order": 9, "effort_weight": 0.02, "default_tasks": [
    { "title": "Handoff docs and runbook", "estimate_hours": 2, "depends_on": null }
  ]}
]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM project_blueprints WHERE tenant_id IS NULL AND type = 'ai_integration'
);

NOTIFY pgrst, 'reload config';
