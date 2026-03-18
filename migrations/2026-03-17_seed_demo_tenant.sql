-- =============================================
-- Platform Admin: Seed Demo Data
-- Populates a tenant with realistic fake data
-- for client demos and presentations.
-- =============================================

CREATE OR REPLACE FUNCTION platform_seed_demo_data(p_tenant_slug TEXT, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tid UUID; -- tenant_id
  v_uid UUID := p_user_id; -- owner/creator for all records
  -- Client IDs
  c1 UUID := gen_random_uuid();
  c2 UUID := gen_random_uuid();
  c3 UUID := gen_random_uuid();
  c4 UUID := gen_random_uuid();
  c5 UUID := gen_random_uuid();
  c6 UUID := gen_random_uuid();
  c7 UUID := gen_random_uuid();
  c8 UUID := gen_random_uuid();
  c9 UUID := gen_random_uuid();
  c10 UUID := gen_random_uuid();
  -- Project IDs
  p1 UUID := gen_random_uuid();
  p2 UUID := gen_random_uuid();
  p3 UUID := gen_random_uuid();
  p4 UUID := gen_random_uuid();
  p5 UUID := gen_random_uuid();
  p6 UUID := gen_random_uuid();
  p7 UUID := gen_random_uuid();
  p8 UUID := gen_random_uuid();
  -- Folder IDs
  f1 UUID := gen_random_uuid();
  f2 UUID := gen_random_uuid();
  f3 UUID := gen_random_uuid();
  f4 UUID := gen_random_uuid();
  f5 UUID := gen_random_uuid();
  -- Budget IDs
  b1 UUID := gen_random_uuid();
  b2 UUID := gen_random_uuid();
  b3 UUID := gen_random_uuid();
  b4 UUID := gen_random_uuid();
  b5 UUID := gen_random_uuid();
  b6 UUID := gen_random_uuid();
  b7 UUID := gen_random_uuid();
  -- Income IDs
  i1 UUID := gen_random_uuid();
  i2 UUID := gen_random_uuid();
  i3 UUID := gen_random_uuid();
  i4 UUID := gen_random_uuid();
  i5 UUID := gen_random_uuid();
  i6 UUID := gen_random_uuid();
  i7 UUID := gen_random_uuid();
  i8 UUID := gen_random_uuid();
  i9 UUID := gen_random_uuid();
  i10 UUID := gen_random_uuid();
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  -- Resolve tenant
  SELECT id INTO v_tid FROM tenants WHERE slug = p_tenant_slug;
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'Tenant not found with slug: %', p_tenant_slug;
  END IF;

  -- ========== CLIENTS (10) ==========
  INSERT INTO clients (id, tenant_id, owner_id, name, email, company, phone, status, industry, color, notes, created_at, updated_at) VALUES
    (c1, v_tid, v_uid, 'Meridian Studios', 'hello@meridianstudios.com', 'Meridian Studios', '+1 (555) 234-5678', 'active', 'Entertainment', '#6366f1', 'Premium video production studio. Key account for Q1.', now()-interval '55 days', now()-interval '2 days'),
    (c2, v_tid, v_uid, 'NovaTech Solutions', 'info@novatech.io', 'NovaTech Solutions', '+1 (555) 345-6789', 'active', 'Technology', '#3b82f6', 'SaaS platform migration project. CTO is main contact.', now()-interval '48 days', now()-interval '1 day'),
    (c3, v_tid, v_uid, 'Bloom & Branch', 'sarah@bloomandbranch.co', 'Bloom & Branch Co.', '+1 (555) 456-7890', 'active', 'Retail', '#10b981', 'E-commerce rebrand. Launching new product line in Q2.', now()-interval '40 days', now()-interval '5 days'),
    (c4, v_tid, v_uid, 'Catalyst Digital', 'team@catalystdigital.com', 'Catalyst Digital Agency', '+1 (555) 567-8901', 'active', 'Marketing', '#f59e0b', 'Digital marketing agency partnership. Refer clients both ways.', now()-interval '35 days', now()-interval '3 days'),
    (c5, v_tid, v_uid, 'Artisan Coffee Co.', 'orders@artisancoffee.com', 'Artisan Coffee Co.', '+1 (555) 678-9012', 'active', 'Food & Beverage', '#ef4444', 'Complete brand identity + website. Owner very detail-oriented.', now()-interval '30 days', now()-interval '7 days'),
    (c6, v_tid, v_uid, 'Skyline Architecture', 'projects@skylinearch.com', 'Skyline Architecture LLC', '+1 (555) 789-0123', 'active', 'Architecture', '#8b5cf6', 'Portfolio website + project management tools.', now()-interval '25 days', now()-interval '4 days'),
    (c7, v_tid, v_uid, 'Verdant Gardens', 'contact@verdantgardens.com', 'Verdant Gardens Inc.', '+1 (555) 890-1234', 'prospect', 'Agriculture', '#22c55e', 'Interested in e-commerce platform. Following up next week.', now()-interval '15 days', now()-interval '1 day'),
    (c8, v_tid, v_uid, 'Peak Performance', 'info@peakperformance.fit', 'Peak Performance Gym', '+1 (555) 901-2345', 'active', 'Fitness', '#f97316', 'Membership platform + mobile app. Phase 2 starting.', now()-interval '50 days', now()-interval '6 days'),
    (c9, v_tid, v_uid, 'Harbor Analytics', 'data@harboranalytics.com', 'Harbor Analytics Corp.', '+1 (555) 012-3456', 'inactive', 'Data & Analytics', '#64748b', 'Dashboard project completed. May return for phase 2.', now()-interval '60 days', now()-interval '20 days'),
    (c10, v_tid, v_uid, 'Luna Creative', 'hello@lunacreative.agency', 'Luna Creative Agency', '+1 (555) 123-4567', 'prospect', 'Design', '#ec4899', 'Referred by Catalyst Digital. Initial meeting scheduled.', now()-interval '5 days', now()-interval '1 day');

  -- ========== PROJECTS (8) ==========
  INSERT INTO projects (id, tenant_id, owner_id, client_id, title, description, status, progress, client_name, deadline, tags, color, budget, currency, created_at, updated_at) VALUES
    (p1, v_tid, v_uid, c1, 'Meridian Brand Refresh', 'Complete visual identity overhaul including logo, brand guidelines, website redesign, and marketing collateral.', 'Active', 65, 'Meridian Studios', (now()+interval '25 days')::date, ARRAY['branding','design','web'], '#6366f1', 28000, 'USD', now()-interval '50 days', now()-interval '1 day'),
    (p2, v_tid, v_uid, c2, 'NovaTech Platform Migration', 'Migrate legacy PHP application to modern React + Node.js stack with CI/CD pipeline setup.', 'Active', 40, 'NovaTech Solutions', (now()+interval '45 days')::date, ARRAY['development','migration','devops'], '#3b82f6', 52000, 'USD', now()-interval '45 days', now()-interval '2 days'),
    (p3, v_tid, v_uid, c3, 'Bloom E-Commerce Store', 'Shopify Plus store with custom theme, product catalog integration, and inventory management.', 'Active', 80, 'Bloom & Branch', (now()+interval '10 days')::date, ARRAY['ecommerce','shopify','design'], '#10b981', 18500, 'USD', now()-interval '38 days', now()-interval '3 days'),
    (p4, v_tid, v_uid, c5, 'Artisan Coffee Website', 'Single-page website with online ordering, location finder, and loyalty program integration.', 'Active', 25, 'Artisan Coffee Co.', (now()+interval '35 days')::date, ARRAY['web','design','ordering'], '#ef4444', 12000, 'USD', now()-interval '28 days', now()-interval '5 days'),
    (p5, v_tid, v_uid, c6, 'Skyline Portfolio Site', 'Architecture portfolio with 3D project viewer, team profiles, and contact system.', 'Review', 90, 'Skyline Architecture', (now()+interval '5 days')::date, ARRAY['web','portfolio','3d'], '#8b5cf6', 15000, 'USD', now()-interval '35 days', now()-interval '1 day'),
    (p6, v_tid, v_uid, c8, 'Peak Fitness App', 'Cross-platform mobile app for class booking, workout tracking, and membership management.', 'Active', 55, 'Peak Performance', (now()+interval '60 days')::date, ARRAY['mobile','app','fitness'], '#f97316', 45000, 'USD', now()-interval '48 days', now()-interval '4 days'),
    (p7, v_tid, v_uid, c9, 'Harbor Dashboard v1', 'Real-time analytics dashboard with data visualization, custom reports, and alert system.', 'Completed', 100, 'Harbor Analytics', (now()-interval '15 days')::date, ARRAY['dashboard','analytics','data'], '#64748b', 35000, 'USD', now()-interval '58 days', now()-interval '15 days'),
    (p8, v_tid, v_uid, c4, 'Catalyst SEO Campaign', 'Technical SEO audit, content strategy, link building campaign, and monthly reporting.', 'Active', 45, 'Catalyst Digital', (now()+interval '30 days')::date, ARRAY['seo','marketing','content'], '#f59e0b', 8500, 'USD', now()-interval '20 days', now()-interval '2 days');

  -- ========== TASKS (40) ==========
  INSERT INTO tasks (tenant_id, title, description, status, priority, owner_id, assignee_ids, project_id, client_id, due_date, group_name, completed, completed_at, created_at, updated_at) VALUES
    -- Meridian Brand Refresh tasks
    (v_tid, 'Brand discovery workshop', 'Conduct stakeholder interviews and competitive analysis', 'done', 'high', v_uid, ARRAY[v_uid], p1, c1, (now()-interval '40 days')::date, 'Discovery', true, now()-interval '38 days', now()-interval '48 days', now()-interval '38 days'),
    (v_tid, 'Moodboard & visual direction', 'Create 3 moodboard options with typography and color palettes', 'done', 'high', v_uid, ARRAY[v_uid], p1, c1, (now()-interval '35 days')::date, 'Design', true, now()-interval '34 days', now()-interval '42 days', now()-interval '34 days'),
    (v_tid, 'Logo design concepts', 'Develop 5 logo concepts based on approved direction', 'done', 'high', v_uid, ARRAY[v_uid], p1, c1, (now()-interval '28 days')::date, 'Design', true, now()-interval '27 days', now()-interval '36 days', now()-interval '27 days'),
    (v_tid, 'Brand guidelines document', 'Compile comprehensive brand guidelines PDF', 'in_progress', 'medium', v_uid, ARRAY[v_uid], p1, c1, (now()+interval '5 days')::date, 'Deliverables', false, NULL, now()-interval '20 days', now()-interval '2 days'),
    (v_tid, 'Website wireframes', 'Create wireframes for all key pages', 'in_progress', 'high', v_uid, ARRAY[v_uid], p1, c1, (now()+interval '8 days')::date, 'Web Design', false, NULL, now()-interval '15 days', now()-interval '1 day'),
    (v_tid, 'Website high-fidelity mockups', 'Design pixel-perfect mockups in Figma', 'todo', 'high', v_uid, ARRAY[v_uid], p1, c1, (now()+interval '15 days')::date, 'Web Design', false, NULL, now()-interval '10 days', now()-interval '10 days'),
    -- NovaTech Platform tasks
    (v_tid, 'Technical architecture document', 'Define system architecture, tech stack, and deployment strategy', 'done', 'high', v_uid, ARRAY[v_uid], p2, c2, (now()-interval '38 days')::date, 'Planning', true, now()-interval '37 days', now()-interval '44 days', now()-interval '37 days'),
    (v_tid, 'Database schema design', 'Design PostgreSQL schema with migration scripts', 'done', 'high', v_uid, ARRAY[v_uid], p2, c2, (now()-interval '30 days')::date, 'Backend', true, now()-interval '29 days', now()-interval '40 days', now()-interval '29 days'),
    (v_tid, 'API endpoints development', 'Build REST API with authentication and rate limiting', 'in_progress', 'high', v_uid, ARRAY[v_uid], p2, c2, (now()+interval '10 days')::date, 'Backend', false, NULL, now()-interval '25 days', now()-interval '3 days'),
    (v_tid, 'Frontend component library', 'Create reusable React component library with Storybook', 'in_progress', 'medium', v_uid, ARRAY[v_uid], p2, c2, (now()+interval '20 days')::date, 'Frontend', false, NULL, now()-interval '20 days', now()-interval '5 days'),
    (v_tid, 'Data migration scripts', 'Write scripts to migrate data from legacy PHP/MySQL', 'todo', 'high', v_uid, ARRAY[v_uid], p2, c2, (now()+interval '30 days')::date, 'Migration', false, NULL, now()-interval '15 days', now()-interval '15 days'),
    (v_tid, 'CI/CD pipeline setup', 'Configure GitHub Actions with staging and production deploys', 'todo', 'medium', v_uid, ARRAY[v_uid], p2, c2, (now()+interval '35 days')::date, 'DevOps', false, NULL, now()-interval '10 days', now()-interval '10 days'),
    -- Bloom E-Commerce tasks
    (v_tid, 'Shopify store setup', 'Configure Shopify Plus, install apps, set up payments', 'done', 'high', v_uid, ARRAY[v_uid], p3, c3, (now()-interval '30 days')::date, 'Setup', true, now()-interval '28 days', now()-interval '36 days', now()-interval '28 days'),
    (v_tid, 'Custom theme development', 'Build custom Shopify theme with brand guidelines', 'done', 'high', v_uid, ARRAY[v_uid], p3, c3, (now()-interval '18 days')::date, 'Development', true, now()-interval '16 days', now()-interval '30 days', now()-interval '16 days'),
    (v_tid, 'Product catalog import', 'Import 500+ products with images, variants, and SEO metadata', 'done', 'medium', v_uid, ARRAY[v_uid], p3, c3, (now()-interval '10 days')::date, 'Content', true, now()-interval '9 days', now()-interval '22 days', now()-interval '9 days'),
    (v_tid, 'QA testing & bug fixes', 'Cross-browser testing, mobile responsiveness, checkout flow', 'in_progress', 'high', v_uid, ARRAY[v_uid], p3, c3, (now()+interval '5 days')::date, 'QA', false, NULL, now()-interval '8 days', now()-interval '2 days'),
    (v_tid, 'Launch checklist & go-live', 'DNS, SSL, analytics, monitoring, launch announcement', 'todo', 'high', v_uid, ARRAY[v_uid], p3, c3, (now()+interval '10 days')::date, 'Launch', false, NULL, now()-interval '5 days', now()-interval '5 days'),
    -- Artisan Coffee tasks
    (v_tid, 'Content strategy & sitemap', 'Define page structure, content hierarchy, and user flows', 'done', 'medium', v_uid, ARRAY[v_uid], p4, c5, (now()-interval '20 days')::date, 'Planning', true, now()-interval '18 days', now()-interval '26 days', now()-interval '18 days'),
    (v_tid, 'Photography direction', 'Plan and brief product/lifestyle photography shoot', 'in_progress', 'medium', v_uid, ARRAY[v_uid], p4, c5, (now()+interval '5 days')::date, 'Content', false, NULL, now()-interval '12 days', now()-interval '3 days'),
    (v_tid, 'Online ordering integration', 'Integrate Square POS with website ordering system', 'todo', 'high', v_uid, ARRAY[v_uid], p4, c5, (now()+interval '20 days')::date, 'Development', false, NULL, now()-interval '8 days', now()-interval '8 days'),
    (v_tid, 'Location finder with maps', 'Build interactive store locator with Google Maps API', 'todo', 'low', v_uid, ARRAY[v_uid], p4, c5, (now()+interval '25 days')::date, 'Development', false, NULL, now()-interval '5 days', now()-interval '5 days'),
    -- Skyline Portfolio tasks
    (v_tid, 'Portfolio page design', 'Design project showcase with filtering and 3D viewer', 'done', 'high', v_uid, ARRAY[v_uid], p5, c6, (now()-interval '25 days')::date, 'Design', true, now()-interval '22 days', now()-interval '33 days', now()-interval '22 days'),
    (v_tid, '3D model integration', 'Integrate Three.js viewer for architecture models', 'done', 'high', v_uid, ARRAY[v_uid], p5, c6, (now()-interval '15 days')::date, 'Development', true, now()-interval '13 days', now()-interval '28 days', now()-interval '13 days'),
    (v_tid, 'Contact form & CRM integration', 'Build contact system with HubSpot integration', 'done', 'medium', v_uid, ARRAY[v_uid], p5, c6, (now()-interval '8 days')::date, 'Development', true, now()-interval '6 days', now()-interval '20 days', now()-interval '6 days'),
    (v_tid, 'Client review & final adjustments', 'Address client feedback from review session', 'in_progress', 'high', v_uid, ARRAY[v_uid], p5, c6, (now()+interval '3 days')::date, 'Review', false, NULL, now()-interval '5 days', now()-interval '1 day'),
    -- Peak Fitness App tasks
    (v_tid, 'User research & personas', 'Interview gym members, create user personas and journey maps', 'done', 'high', v_uid, ARRAY[v_uid], p6, c8, (now()-interval '42 days')::date, 'Research', true, now()-interval '40 days', now()-interval '46 days', now()-interval '40 days'),
    (v_tid, 'App wireframes', 'Create wireframes for all screens (iOS + Android)', 'done', 'high', v_uid, ARRAY[v_uid], p6, c8, (now()-interval '32 days')::date, 'Design', true, now()-interval '30 days', now()-interval '40 days', now()-interval '30 days'),
    (v_tid, 'UI design system', 'Create design system with components, colors, typography', 'done', 'medium', v_uid, ARRAY[v_uid], p6, c8, (now()-interval '22 days')::date, 'Design', true, now()-interval '20 days', now()-interval '34 days', now()-interval '20 days'),
    (v_tid, 'Class booking feature', 'Build real-time class schedule, booking, and waitlist', 'in_progress', 'high', v_uid, ARRAY[v_uid], p6, c8, (now()+interval '15 days')::date, 'Development', false, NULL, now()-interval '18 days', now()-interval '4 days'),
    (v_tid, 'Workout tracking module', 'Exercise library, workout logging, progress charts', 'todo', 'medium', v_uid, ARRAY[v_uid], p6, c8, (now()+interval '35 days')::date, 'Development', false, NULL, now()-interval '12 days', now()-interval '12 days'),
    (v_tid, 'Push notifications system', 'Class reminders, workout prompts, achievement alerts', 'todo', 'low', v_uid, ARRAY[v_uid], p6, c8, (now()+interval '45 days')::date, 'Development', false, NULL, now()-interval '8 days', now()-interval '8 days'),
    (v_tid, 'Membership payment integration', 'Stripe subscription billing with plan management', 'todo', 'high', v_uid, ARRAY[v_uid], p6, c8, (now()+interval '50 days')::date, 'Payments', false, NULL, now()-interval '5 days', now()-interval '5 days'),
    -- Catalyst SEO tasks
    (v_tid, 'Technical SEO audit', 'Run crawl, identify issues, create priority fix list', 'done', 'high', v_uid, ARRAY[v_uid], p8, c4, (now()-interval '15 days')::date, 'Audit', true, now()-interval '13 days', now()-interval '19 days', now()-interval '13 days'),
    (v_tid, 'Keyword research & mapping', 'Research target keywords, map to pages and content plan', 'done', 'high', v_uid, ARRAY[v_uid], p8, c4, (now()-interval '10 days')::date, 'Strategy', true, now()-interval '8 days', now()-interval '16 days', now()-interval '8 days'),
    (v_tid, 'On-page optimization', 'Optimize meta tags, headings, internal links for top 20 pages', 'in_progress', 'high', v_uid, ARRAY[v_uid], p8, c4, (now()+interval '5 days')::date, 'Implementation', false, NULL, now()-interval '8 days', now()-interval '2 days'),
    (v_tid, 'Content calendar creation', 'Plan 3 months of blog content targeting key topics', 'in_progress', 'medium', v_uid, ARRAY[v_uid], p8, c4, (now()+interval '7 days')::date, 'Content', false, NULL, now()-interval '6 days', now()-interval '1 day'),
    (v_tid, 'Link building outreach', 'Identify prospects, create outreach templates, begin campaign', 'todo', 'medium', v_uid, ARRAY[v_uid], p8, c4, (now()+interval '20 days')::date, 'Outreach', false, NULL, now()-interval '3 days', now()-interval '3 days'),
    -- Standalone tasks
    (v_tid, 'Update portfolio with recent work', 'Add Bloom and Skyline projects to agency portfolio', 'todo', 'low', v_uid, ARRAY[v_uid], NULL, NULL, (now()+interval '14 days')::date, 'Internal', false, NULL, now()-interval '3 days', now()-interval '3 days'),
    (v_tid, 'Quarterly client satisfaction survey', 'Send NPS survey to all active clients', 'todo', 'medium', v_uid, ARRAY[v_uid], NULL, NULL, (now()+interval '21 days')::date, 'Internal', false, NULL, now()-interval '2 days', now()-interval '2 days'),
    (v_tid, 'Review freelancer contracts', 'Review and renew contractor agreements for Q2', 'in_progress', 'medium', v_uid, ARRAY[v_uid], NULL, NULL, (now()+interval '10 days')::date, 'Admin', false, NULL, now()-interval '5 days', now()-interval '1 day');

  -- ========== CALENDAR EVENTS (25) ==========
  INSERT INTO calendar_events (tenant_id, owner_id, title, description, start_date, start_time, duration, type, color, location, client_id, project_id, created_at) VALUES
    (v_tid, v_uid, 'Team standup', 'Daily 15-min sync', (now())::date, '09:00', 15, 'meeting', '#6366f1', 'Zoom', NULL, NULL, now()-interval '30 days'),
    (v_tid, v_uid, 'Meridian review call', 'Present brand concepts to client', (now()+interval '1 day')::date, '14:00', 60, 'call', '#6366f1', 'Google Meet', c1, p1, now()-interval '5 days'),
    (v_tid, v_uid, 'NovaTech sprint planning', 'Plan sprint 4 tasks and priorities', (now()+interval '2 days')::date, '10:00', 90, 'meeting', '#3b82f6', 'Office', c2, p2, now()-interval '3 days'),
    (v_tid, v_uid, 'Bloom launch prep', 'Final checks before store launch', (now()+interval '8 days')::date, '11:00', 120, 'meeting', '#10b981', 'Zoom', c3, p3, now()-interval '2 days'),
    (v_tid, v_uid, 'Artisan Coffee photo shoot', 'On-site product photography', (now()+interval '4 days')::date, '09:00', 240, 'meeting', '#ef4444', '123 Main St, Portland', c5, p4, now()-interval '10 days'),
    (v_tid, v_uid, 'Skyline final presentation', 'Present completed portfolio site', (now()+interval '3 days')::date, '15:00', 60, 'call', '#8b5cf6', 'Zoom', c6, p5, now()-interval '3 days'),
    (v_tid, v_uid, 'Peak app demo', 'Show progress on booking feature', (now()+interval '5 days')::date, '13:00', 45, 'call', '#f97316', 'Google Meet', c8, p6, now()-interval '4 days'),
    (v_tid, v_uid, 'Catalyst SEO report', 'Monthly SEO performance review', (now()+interval '7 days')::date, '11:00', 60, 'meeting', '#f59e0b', 'Zoom', c4, p8, now()-interval '2 days'),
    (v_tid, v_uid, 'Verdant Gardens intro call', 'Discovery call for potential e-commerce project', (now()+interval '6 days')::date, '10:00', 30, 'call', '#22c55e', 'Phone', c7, NULL, now()-interval '1 day'),
    (v_tid, v_uid, 'Luna Creative meeting', 'Initial meeting — referred by Catalyst', (now()+interval '9 days')::date, '14:00', 45, 'meeting', '#ec4899', 'Coffee shop', c10, NULL, now()),
    (v_tid, v_uid, 'Invoice review', 'Review pending invoices and follow up', (now()+interval '3 days')::date, '16:00', 30, 'deadline', '#64748b', NULL, NULL, NULL, now()-interval '7 days'),
    (v_tid, v_uid, 'Design team sync', 'Weekly design review and feedback', (now()+interval '2 days')::date, '14:00', 60, 'meeting', '#a855f7', 'Office', NULL, NULL, now()-interval '14 days'),
    (v_tid, v_uid, 'Content planning session', 'Plan blog and social media content', (now()+interval '4 days')::date, '10:30', 90, 'meeting', '#f43f5e', 'Office', NULL, NULL, now()-interval '5 days'),
    -- Past events
    (v_tid, v_uid, 'Meridian kickoff', 'Project kickoff meeting', (now()-interval '48 days')::date, '10:00', 120, 'meeting', '#6366f1', 'Client office', c1, p1, now()-interval '50 days'),
    (v_tid, v_uid, 'NovaTech architecture review', 'Technical architecture deep dive', (now()-interval '36 days')::date, '09:00', 180, 'meeting', '#3b82f6', 'Office', c2, p2, now()-interval '40 days'),
    (v_tid, v_uid, 'Bloom design review', 'Theme design approval', (now()-interval '20 days')::date, '14:00', 60, 'call', '#10b981', 'Zoom', c3, p3, now()-interval '25 days'),
    (v_tid, v_uid, 'Peak app kickoff', 'Project kickoff with gym owner', (now()-interval '44 days')::date, '11:00', 90, 'meeting', '#f97316', 'Gym location', c8, p6, now()-interval '46 days'),
    (v_tid, v_uid, 'Harbor dashboard handoff', 'Final delivery and training', (now()-interval '16 days')::date, '10:00', 120, 'meeting', '#64748b', 'Client office', c9, p7, now()-interval '20 days'),
    (v_tid, v_uid, 'Q1 retrospective', 'Team quarterly review', (now()-interval '10 days')::date, '13:00', 120, 'meeting', '#f59e0b', 'Office', NULL, NULL, now()-interval '15 days'),
    (v_tid, v_uid, 'Catalyst SEO kickoff', 'Campaign kickoff and goal setting', (now()-interval '18 days')::date, '10:00', 60, 'meeting', '#f59e0b', 'Zoom', c4, p8, now()-interval '20 days'),
    -- Future deadlines
    (v_tid, v_uid, 'Bloom store launch', 'GO LIVE!', (now()+interval '10 days')::date, '08:00', 480, 'deadline', '#10b981', NULL, c3, p3, now()-interval '30 days'),
    (v_tid, v_uid, 'Skyline site delivery', 'Final delivery deadline', (now()+interval '5 days')::date, NULL, NULL, 'deadline', '#8b5cf6', NULL, c6, p5, now()-interval '30 days'),
    (v_tid, v_uid, 'Meridian brand delivery', 'Brand guidelines due', (now()+interval '25 days')::date, NULL, NULL, 'deadline', '#6366f1', NULL, c1, p1, now()-interval '45 days'),
    (v_tid, v_uid, 'Peak app beta release', 'Internal beta for testing', (now()+interval '40 days')::date, NULL, NULL, 'deadline', '#f97316', NULL, c8, p6, now()-interval '30 days'),
    (v_tid, v_uid, 'NovaTech MVP launch', 'First release to production', (now()+interval '45 days')::date, NULL, NULL, 'deadline', '#3b82f6', NULL, c2, p2, now()-interval '40 days');

  -- ========== FOLDERS (5) ==========
  INSERT INTO folders (id, tenant_id, owner_id, name, color, created_at) VALUES
    (f1, v_tid, v_uid, 'Client Projects', '#3b82f6', now()-interval '55 days'),
    (f2, v_tid, v_uid, 'Finance & Invoices', '#10b981', now()-interval '55 days'),
    (f3, v_tid, v_uid, 'Legal & Contracts', '#ef4444', now()-interval '55 days'),
    (f4, v_tid, v_uid, 'Templates', '#f59e0b', now()-interval '55 days'),
    (f5, v_tid, v_uid, 'Archive', '#64748b', now()-interval '55 days');

  -- ========== DOCUMENTS (10) ==========
  INSERT INTO documents (tenant_id, owner_id, client_id, project_id, title, content, content_text, status, created_at, updated_at) VALUES
    (v_tid, v_uid, c1, p1, 'Meridian Brand Strategy', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Meridian Studios — Brand Strategy"}]},{"type":"paragraph","content":[{"type":"text","text":"This document outlines the strategic direction for Meridian Studios'' brand refresh, including positioning, messaging, and visual identity guidelines."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Brand Positioning"}]},{"type":"paragraph","content":[{"type":"text","text":"Meridian Studios positions itself as a premium video production studio that blends cinematic storytelling with cutting-edge technology. Target audience: mid-to-large brands seeking high-end commercial content."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Key Messages"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Cinematic quality meets digital innovation"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Stories that move audiences and drive results"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"From concept to screen — full-service production"}]}]}]}]}', 'Meridian Studios Brand Strategy. Brand positioning, key messages, and visual identity direction.', 'final', now()-interval '45 days', now()-interval '5 days'),
    (v_tid, v_uid, c2, p2, 'NovaTech Technical Spec', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"NovaTech Platform — Technical Specification"}]},{"type":"paragraph","content":[{"type":"text","text":"Architecture overview and technical requirements for the platform migration from PHP to React + Node.js."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Stack"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Frontend: React 19 + TypeScript + Tailwind CSS"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Backend: Node.js + Express + PostgreSQL"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Infrastructure: AWS ECS + RDS + CloudFront"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Migration Plan"}]},{"type":"paragraph","content":[{"type":"text","text":"Phase 1: Core API + Auth. Phase 2: Data migration. Phase 3: Frontend rebuild. Phase 4: Testing & cutover."}]}]}', 'NovaTech Platform Technical Specification. Architecture overview and migration plan.', 'final', now()-interval '40 days', now()-interval '10 days'),
    (v_tid, v_uid, c3, p3, 'Bloom Launch Checklist', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Bloom & Branch — Launch Checklist"}]},{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"DNS configuration"}]}]},{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"SSL certificate installed"}]}]},{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"Payment gateway tested (Stripe)"}]}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Google Analytics + Tag Manager"}]}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Email notifications configured"}]}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"404 page and redirects"}]}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Launch announcement email"}]}]}]}]}', 'Bloom & Branch Launch Checklist. Pre-launch tasks and verification items.', 'draft', now()-interval '8 days', now()-interval '2 days'),
    (v_tid, v_uid, NULL, NULL, 'Q1 2026 Financial Summary', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Q1 2026 — Financial Summary"}]},{"type":"paragraph","content":[{"type":"text","text":"Overview of revenue, expenses, and profitability for January through March 2026."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Revenue"}]},{"type":"paragraph","content":[{"type":"text","text":"Total invoiced: $214,000. Collected: $168,500 (79% collection rate). Outstanding: $45,500."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Top Clients by Revenue"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"NovaTech Solutions — $52,000"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Peak Performance — $45,000"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Harbor Analytics — $35,000"}]}]}]}]}', 'Q1 2026 Financial Summary. Revenue, expenses, and profitability overview.', 'final', now()-interval '5 days', now()-interval '1 day'),
    (v_tid, v_uid, NULL, NULL, 'Standard Client Agreement', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Client Service Agreement — Template"}]},{"type":"paragraph","content":[{"type":"text","text":"This agreement outlines the terms and conditions for creative and development services provided by the agency."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Scope of Work"}]},{"type":"paragraph","content":[{"type":"text","text":"Services will be provided as outlined in the attached project proposal and statement of work."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Payment Terms"}]},{"type":"paragraph","content":[{"type":"text","text":"50% deposit upon signing. Remaining 50% due upon project completion. Net 30 payment terms."}]}]}', 'Standard Client Service Agreement template. Scope, payment terms, and conditions.', 'final', now()-interval '50 days', now()-interval '50 days'),
    (v_tid, v_uid, NULL, NULL, 'Project Proposal Template', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Project Proposal — [Client Name]"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Executive Summary"}]},{"type":"paragraph","content":[{"type":"text","text":"[Brief overview of the project, objectives, and expected outcomes]"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Scope & Deliverables"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"[Deliverable 1]"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"[Deliverable 2]"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"[Deliverable 3]"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Timeline & Investment"}]},{"type":"paragraph","content":[{"type":"text","text":"Estimated duration: [X weeks]. Total investment: $[amount]."}]}]}', 'Project Proposal Template. Executive summary, scope, deliverables, timeline.', 'final', now()-interval '55 days', now()-interval '55 days'),
    (v_tid, v_uid, c6, p5, 'Skyline Review Notes', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Skyline Architecture — Client Review Notes"}]},{"type":"paragraph","content":[{"type":"text","text":"Notes from the client review session on the portfolio website."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Feedback"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Love the 3D viewer — asked to add rotation controls"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Want to add team bios section to About page"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Contact form needs project type dropdown"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Overall very positive — approved for launch after fixes"}]}]}]}]}', 'Skyline Architecture client review notes and feedback.', 'draft', now()-interval '5 days', now()-interval '1 day'),
    (v_tid, v_uid, c8, p6, 'Peak App — User Research Summary', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Peak Performance — User Research Summary"}]},{"type":"paragraph","content":[{"type":"text","text":"Key findings from interviewing 15 gym members about their fitness app needs."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Top Pain Points"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Difficulty booking popular classes (sell out in minutes)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"No way to track workout progress over time"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Want notifications for schedule changes"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Must-Have Features"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Real-time class availability with waitlist"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Personal workout log with charts"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Push notifications for reminders"}]}]}]}]}', 'Peak Performance user research summary. Pain points and must-have features.', 'final', now()-interval '40 days', now()-interval '38 days'),
    (v_tid, v_uid, NULL, NULL, 'Meeting Notes Template', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Meeting Notes — [Date]"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Attendees"}]},{"type":"paragraph","content":[{"type":"text","text":"[List attendees]"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Agenda"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"[Topic 1]"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"[Topic 2]"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Action Items"}]},{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"[Action item — Owner — Due date]"}]}]}]}]}', 'Meeting Notes Template with attendees, agenda, and action items.', 'final', now()-interval '55 days', now()-interval '55 days'),
    (v_tid, v_uid, c4, p8, 'Catalyst SEO Audit Report', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Catalyst Digital — Technical SEO Audit"}]},{"type":"paragraph","content":[{"type":"text","text":"Comprehensive audit findings and recommendations for improving organic search performance."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Critical Issues"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Missing meta descriptions on 45% of pages"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Slow page load (avg 4.2s on mobile)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Broken internal links (23 found)"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Recommendations"}]},{"type":"paragraph","content":[{"type":"text","text":"Priority 1: Fix meta descriptions and page speed. Priority 2: Internal linking structure. Priority 3: Content gap analysis."}]}]}', 'Catalyst Digital Technical SEO Audit. Critical issues and recommendations.', 'final', now()-interval '14 days', now()-interval '10 days');

  -- ========== BUDGETS (7) ==========
  INSERT INTO budgets (id, tenant_id, name, description, allocated_amount, category, color, icon, period, start_date, end_date, is_active, created_by, created_at) VALUES
    (b1, v_tid, 'Software & Tools', 'Design tools, dev tools, hosting, SaaS subscriptions', 2500, 'Software', '#3b82f6', 'monitor', 'monthly', (now()-interval '60 days')::date, (now()+interval '300 days')::date, true, v_uid, now()-interval '55 days'),
    (b2, v_tid, 'Marketing & Ads', 'Google Ads, social media, content promotion', 3000, 'Marketing', '#f59e0b', 'megaphone', 'monthly', (now()-interval '60 days')::date, (now()+interval '300 days')::date, true, v_uid, now()-interval '55 days'),
    (b3, v_tid, 'Office & Workspace', 'Coworking space, supplies, utilities', 1800, 'Office', '#10b981', 'building', 'monthly', (now()-interval '60 days')::date, (now()+interval '300 days')::date, true, v_uid, now()-interval '55 days'),
    (b4, v_tid, 'Contractors', 'Freelance developers, designers, copywriters', 8000, 'Contractors', '#8b5cf6', 'users', 'monthly', (now()-interval '60 days')::date, (now()+interval '300 days')::date, true, v_uid, now()-interval '55 days'),
    (b5, v_tid, 'Training & Education', 'Courses, conferences, books', 500, 'Education', '#ec4899', 'book', 'monthly', (now()-interval '60 days')::date, (now()+interval '300 days')::date, true, v_uid, now()-interval '55 days'),
    (b6, v_tid, 'Equipment', 'Hardware, cameras, monitors, accessories', 5000, 'Equipment', '#ef4444', 'laptop', 'quarterly', (now()-interval '60 days')::date, (now()+interval '300 days')::date, true, v_uid, now()-interval '55 days'),
    (b7, v_tid, 'Travel & Entertainment', 'Client meetings, team events, travel', 2000, 'Travel', '#f97316', 'plane', 'monthly', (now()-interval '60 days')::date, (now()+interval '300 days')::date, true, v_uid, now()-interval '55 days');

  -- ========== INCOMES (10) ==========
  INSERT INTO incomes (id, tenant_id, client_id, project_id, client_name, project_name, concept, total_amount, status, due_date, created_by, created_at) VALUES
    (i1, v_tid, c1, p1, 'Meridian Studios', 'Meridian Brand Refresh', 'Brand refresh — Phase 1 deposit', 14000, 'paid', (now()-interval '48 days')::date, v_uid, now()-interval '50 days'),
    (i2, v_tid, c1, p1, 'Meridian Studios', 'Meridian Brand Refresh', 'Brand refresh — Phase 2 milestone', 14000, 'pending', (now()+interval '25 days')::date, v_uid, now()-interval '20 days'),
    (i3, v_tid, c2, p2, 'NovaTech Solutions', 'NovaTech Platform Migration', 'Platform migration — 50% deposit', 26000, 'paid', (now()-interval '42 days')::date, v_uid, now()-interval '44 days'),
    (i4, v_tid, c2, p2, 'NovaTech Solutions', 'NovaTech Platform Migration', 'Platform migration — milestone 2', 26000, 'pending', (now()+interval '30 days')::date, v_uid, now()-interval '10 days'),
    (i5, v_tid, c3, p3, 'Bloom & Branch', 'Bloom E-Commerce Store', 'E-commerce store — full project', 18500, 'partial', (now()-interval '5 days')::date, v_uid, now()-interval '36 days'),
    (i6, v_tid, c5, p4, 'Artisan Coffee Co.', 'Artisan Coffee Website', 'Website — deposit', 6000, 'paid', (now()-interval '25 days')::date, v_uid, now()-interval '27 days'),
    (i7, v_tid, c6, p5, 'Skyline Architecture', 'Skyline Portfolio Site', 'Portfolio site — full payment', 15000, 'pending', (now()+interval '5 days')::date, v_uid, now()-interval '33 days'),
    (i8, v_tid, c8, p6, 'Peak Performance', 'Peak Fitness App', 'Fitness app — Phase 1', 22500, 'paid', (now()-interval '45 days')::date, v_uid, now()-interval '47 days'),
    (i9, v_tid, c9, p7, 'Harbor Analytics', 'Harbor Dashboard v1', 'Dashboard — final payment', 35000, 'paid', (now()-interval '14 days')::date, v_uid, now()-interval '56 days'),
    (i10, v_tid, c4, p8, 'Catalyst Digital', 'Catalyst SEO Campaign', 'SEO campaign — monthly retainer', 8500, 'pending', (now()+interval '15 days')::date, v_uid, now()-interval '18 days');

  -- ========== INSTALLMENTS (20) ==========
  INSERT INTO installments (income_id, number, amount, due_date, paid_date, status) VALUES
    -- Meridian deposit (paid)
    (i1, 1, 14000, (now()-interval '48 days')::date, (now()-interval '47 days')::date, 'paid'),
    -- Meridian milestone 2
    (i2, 1, 7000, (now()+interval '15 days')::date, NULL, 'pending'),
    (i2, 2, 7000, (now()+interval '25 days')::date, NULL, 'pending'),
    -- NovaTech deposit (paid)
    (i3, 1, 26000, (now()-interval '42 days')::date, (now()-interval '40 days')::date, 'paid'),
    -- NovaTech milestone 2
    (i4, 1, 13000, (now()+interval '20 days')::date, NULL, 'pending'),
    (i4, 2, 13000, (now()+interval '30 days')::date, NULL, 'pending'),
    -- Bloom (partial — 2 of 3 paid)
    (i5, 1, 6000, (now()-interval '34 days')::date, (now()-interval '33 days')::date, 'paid'),
    (i5, 2, 6000, (now()-interval '15 days')::date, (now()-interval '14 days')::date, 'paid'),
    (i5, 3, 6500, (now()+interval '10 days')::date, NULL, 'pending'),
    -- Artisan deposit (paid)
    (i6, 1, 6000, (now()-interval '25 days')::date, (now()-interval '24 days')::date, 'paid'),
    -- Skyline (2 installments)
    (i7, 1, 7500, (now()+interval '5 days')::date, NULL, 'pending'),
    (i7, 2, 7500, (now()+interval '15 days')::date, NULL, 'pending'),
    -- Peak Phase 1 (paid)
    (i8, 1, 11250, (now()-interval '45 days')::date, (now()-interval '44 days')::date, 'paid'),
    (i8, 2, 11250, (now()-interval '25 days')::date, (now()-interval '24 days')::date, 'paid'),
    -- Harbor final (paid)
    (i9, 1, 17500, (now()-interval '50 days')::date, (now()-interval '49 days')::date, 'paid'),
    (i9, 2, 17500, (now()-interval '14 days')::date, (now()-interval '13 days')::date, 'paid'),
    -- Catalyst retainer (3 monthly)
    (i10, 1, 2833, (now()-interval '5 days')::date, NULL, 'overdue'),
    (i10, 2, 2833, (now()+interval '25 days')::date, NULL, 'pending'),
    (i10, 3, 2834, (now()+interval '55 days')::date, NULL, 'pending');

  -- ========== EXPENSES (40) ==========
  INSERT INTO expenses (tenant_id, category, subcategory, concept, amount, date, project_id, project_name, vendor, recurring, status, budget_id, created_by, created_at) VALUES
    -- Software & Tools
    (v_tid, 'Software', 'Design', 'Figma Business Plan', 75, (now()-interval '30 days')::date, NULL, 'General', 'Figma', true, 'paid', b1, v_uid, now()-interval '30 days'),
    (v_tid, 'Software', 'Design', 'Adobe Creative Cloud', 89.99, (now()-interval '28 days')::date, NULL, 'General', 'Adobe', true, 'paid', b1, v_uid, now()-interval '28 days'),
    (v_tid, 'Software', 'Development', 'GitHub Team', 44, (now()-interval '30 days')::date, NULL, 'General', 'GitHub', true, 'paid', b1, v_uid, now()-interval '30 days'),
    (v_tid, 'Software', 'Hosting', 'Vercel Pro', 20, (now()-interval '25 days')::date, NULL, 'General', 'Vercel', true, 'paid', b1, v_uid, now()-interval '25 days'),
    (v_tid, 'Software', 'Hosting', 'AWS hosting (NovaTech)', 340, (now()-interval '15 days')::date, p2, 'NovaTech Platform Migration', 'Amazon Web Services', true, 'paid', b1, v_uid, now()-interval '15 days'),
    (v_tid, 'Software', 'Communication', 'Slack Business+', 25, (now()-interval '30 days')::date, NULL, 'General', 'Slack', true, 'paid', b1, v_uid, now()-interval '30 days'),
    (v_tid, 'Software', 'Project Management', 'Notion Team', 16, (now()-interval '30 days')::date, NULL, 'General', 'Notion', true, 'paid', b1, v_uid, now()-interval '30 days'),
    (v_tid, 'Software', 'Analytics', 'SEMrush Pro', 129.95, (now()-interval '20 days')::date, p8, 'Catalyst SEO Campaign', 'SEMrush', true, 'paid', b1, v_uid, now()-interval '20 days'),
    -- Marketing
    (v_tid, 'Marketing', 'Ads', 'Google Ads — agency brand', 850, (now()-interval '30 days')::date, NULL, 'General', 'Google', true, 'paid', b2, v_uid, now()-interval '30 days'),
    (v_tid, 'Marketing', 'Ads', 'LinkedIn Ads campaign', 500, (now()-interval '22 days')::date, NULL, 'General', 'LinkedIn', false, 'paid', b2, v_uid, now()-interval '22 days'),
    (v_tid, 'Marketing', 'Content', 'Blog post copywriting (3 articles)', 750, (now()-interval '18 days')::date, NULL, 'General', 'ContentFly', false, 'paid', b2, v_uid, now()-interval '18 days'),
    (v_tid, 'Marketing', 'Social', 'Social media management', 400, (now()-interval '30 days')::date, NULL, 'General', 'Buffer', true, 'paid', b2, v_uid, now()-interval '30 days'),
    -- Office
    (v_tid, 'Office', 'Workspace', 'Coworking membership (4 desks)', 1200, (now()-interval '30 days')::date, NULL, 'General', 'WeWork', true, 'paid', b3, v_uid, now()-interval '30 days'),
    (v_tid, 'Office', 'Supplies', 'Office supplies & stationery', 145, (now()-interval '20 days')::date, NULL, 'General', 'Amazon', false, 'paid', b3, v_uid, now()-interval '20 days'),
    (v_tid, 'Office', 'Internet', 'Business fiber internet', 199, (now()-interval '30 days')::date, NULL, 'General', 'AT&T Business', true, 'paid', b3, v_uid, now()-interval '30 days'),
    -- Contractors
    (v_tid, 'Contractors', 'Development', 'Backend dev — NovaTech API', 4500, (now()-interval '20 days')::date, p2, 'NovaTech Platform Migration', 'Alex Torres (Freelance)', false, 'paid', b4, v_uid, now()-interval '20 days'),
    (v_tid, 'Contractors', 'Development', 'React Native dev — Peak app', 3800, (now()-interval '15 days')::date, p6, 'Peak Fitness App', 'Maria Chen (Freelance)', false, 'paid', b4, v_uid, now()-interval '15 days'),
    (v_tid, 'Contractors', 'Design', 'Illustration set — Meridian', 1200, (now()-interval '25 days')::date, p1, 'Meridian Brand Refresh', 'Ink & Pixel Studio', false, 'paid', b4, v_uid, now()-interval '25 days'),
    (v_tid, 'Contractors', 'Copywriting', 'Website copy — Artisan Coffee', 800, (now()-interval '12 days')::date, p4, 'Artisan Coffee Website', 'Sarah Williams (Freelance)', false, 'paid', b4, v_uid, now()-interval '12 days'),
    (v_tid, 'Contractors', 'Development', 'Shopify theme customization', 2200, (now()-interval '22 days')::date, p3, 'Bloom E-Commerce Store', 'DevCraft Agency', false, 'paid', b4, v_uid, now()-interval '22 days'),
    (v_tid, 'Contractors', 'SEO', 'Link building specialist', 1500, (now()-interval '10 days')::date, p8, 'Catalyst SEO Campaign', 'LinkPro Services', false, 'paid', b4, v_uid, now()-interval '10 days'),
    -- Training
    (v_tid, 'Education', 'Course', 'Advanced React Patterns (Udemy)', 29.99, (now()-interval '35 days')::date, NULL, 'General', 'Udemy', false, 'paid', b5, v_uid, now()-interval '35 days'),
    (v_tid, 'Education', 'Conference', 'Frontend Conf ticket', 299, (now()-interval '40 days')::date, NULL, 'General', 'Frontend Conf', false, 'paid', b5, v_uid, now()-interval '40 days'),
    (v_tid, 'Education', 'Books', 'Design systems book', 45, (now()-interval '25 days')::date, NULL, 'General', 'Amazon', false, 'paid', b5, v_uid, now()-interval '25 days'),
    -- Equipment
    (v_tid, 'Equipment', 'Hardware', 'MacBook Pro M4 (new hire)', 2499, (now()-interval '45 days')::date, NULL, 'General', 'Apple', false, 'paid', b6, v_uid, now()-interval '45 days'),
    (v_tid, 'Equipment', 'Monitor', 'Studio Display', 1599, (now()-interval '45 days')::date, NULL, 'General', 'Apple', false, 'paid', b6, v_uid, now()-interval '45 days'),
    (v_tid, 'Equipment', 'Accessories', 'Mechanical keyboard + mouse', 280, (now()-interval '40 days')::date, NULL, 'General', 'Amazon', false, 'paid', b6, v_uid, now()-interval '40 days'),
    -- Travel
    (v_tid, 'Travel', 'Client Meeting', 'Flight to Portland (Artisan Coffee)', 380, (now()-interval '8 days')::date, p4, 'Artisan Coffee Website', 'United Airlines', false, 'paid', b7, v_uid, now()-interval '8 days'),
    (v_tid, 'Travel', 'Accommodation', 'Hotel — Portland trip (2 nights)', 420, (now()-interval '8 days')::date, p4, 'Artisan Coffee Website', 'Marriott', false, 'paid', b7, v_uid, now()-interval '8 days'),
    (v_tid, 'Travel', 'Client Entertainment', 'Client dinner — Meridian team', 285, (now()-interval '30 days')::date, p1, 'Meridian Brand Refresh', 'Restaurant', false, 'paid', b7, v_uid, now()-interval '30 days'),
    (v_tid, 'Travel', 'Client Meeting', 'Uber rides (client meetings)', 67, (now()-interval '15 days')::date, NULL, 'General', 'Uber', false, 'paid', b7, v_uid, now()-interval '15 days'),
    -- Recent/pending
    (v_tid, 'Software', 'AI', 'ChatGPT Team', 30, (now()-interval '5 days')::date, NULL, 'General', 'OpenAI', true, 'paid', b1, v_uid, now()-interval '5 days'),
    (v_tid, 'Contractors', 'Photography', 'Product photography — Bloom', 1800, (now()-interval '18 days')::date, p3, 'Bloom E-Commerce Store', 'Focus Studio', false, 'paid', b4, v_uid, now()-interval '18 days'),
    (v_tid, 'Marketing', 'Print', 'Business cards (500 qty)', 120, (now()-interval '35 days')::date, NULL, 'General', 'Moo', false, 'paid', b2, v_uid, now()-interval '35 days'),
    (v_tid, 'Software', 'Testing', 'BrowserStack subscription', 39, (now()-interval '30 days')::date, NULL, 'General', 'BrowserStack', true, 'paid', b1, v_uid, now()-interval '30 days'),
    (v_tid, 'Contractors', 'Development', '3D model optimization — Skyline', 950, (now()-interval '20 days')::date, p5, 'Skyline Portfolio Site', 'RenderPro', false, 'paid', b4, v_uid, now()-interval '20 days'),
    (v_tid, 'Office', 'Insurance', 'Business liability insurance', 450, (now()-interval '50 days')::date, NULL, 'General', 'Hiscox', true, 'paid', b3, v_uid, now()-interval '50 days'),
    (v_tid, 'Travel', 'Team Event', 'Team lunch — Q1 celebration', 340, (now()-interval '10 days')::date, NULL, 'General', 'Restaurant', false, 'paid', b7, v_uid, now()-interval '10 days'),
    (v_tid, 'Equipment', 'Camera', 'Sony A7 IV (content shoots)', 2498, (now()-interval '30 days')::date, NULL, 'General', 'B&H Photo', false, 'paid', b6, v_uid, now()-interval '30 days'),
    (v_tid, 'Software', 'Stock Assets', 'Envato Elements annual', 198, (now()-interval '55 days')::date, NULL, 'General', 'Envato', true, 'paid', b1, v_uid, now()-interval '55 days');

  -- ========== FINANCES (8, one per project) ==========
  INSERT INTO finances (tenant_id, project_id, created_by, total_agreed, total_collected, direct_expenses, imputed_expenses, hours_worked, business_model, hourly_rate, health, created_at, updated_at) VALUES
    (v_tid, p1, v_uid, 28000, 14000, 1200, 6500, 85, 'fixed', NULL, 'profitable', now()-interval '50 days', now()-interval '2 days'),
    (v_tid, p2, v_uid, 52000, 26000, 4840, 12000, 120, 'fixed', NULL, 'profitable', now()-interval '45 days', now()-interval '3 days'),
    (v_tid, p3, v_uid, 18500, 12000, 4000, 4200, 65, 'fixed', NULL, 'profitable', now()-interval '38 days', now()-interval '2 days'),
    (v_tid, p4, v_uid, 12000, 6000, 800, 2800, 35, 'fixed', NULL, 'profitable', now()-interval '28 days', now()-interval '5 days'),
    (v_tid, p5, v_uid, 15000, 0, 950, 5500, 72, 'fixed', NULL, 'break-even', now()-interval '35 days', now()-interval '1 day'),
    (v_tid, p6, v_uid, 45000, 22500, 3800, 10500, 110, 'fixed', NULL, 'profitable', now()-interval '48 days', now()-interval '4 days'),
    (v_tid, p7, v_uid, 35000, 35000, 2200, 9800, 145, 'fixed', NULL, 'profitable', now()-interval '58 days', now()-interval '15 days'),
    (v_tid, p8, v_uid, 8500, 0, 1630, 2400, 32, 'retainer', 120, 'profitable', now()-interval '20 days', now()-interval '2 days');

  -- ========== ACTIVITY LOGS (50) ==========
  INSERT INTO activity_logs (tenant_id, user_id, user_name, user_avatar, action, target, type, entity_type, details, created_at) VALUES
    (v_tid, v_uid, 'Admin', 'AD', 'Created project', 'Meridian Brand Refresh', 'project_created', 'project', '{"project":"Meridian Brand Refresh"}'::jsonb, now()-interval '50 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created project', 'NovaTech Platform Migration', 'project_created', 'project', '{"project":"NovaTech Platform Migration"}'::jsonb, now()-interval '45 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Added client', 'Meridian Studios', 'client_added', 'client', '{"client":"Meridian Studios"}'::jsonb, now()-interval '55 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Added client', 'NovaTech Solutions', 'client_added', 'client', '{"client":"NovaTech Solutions"}'::jsonb, now()-interval '48 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Brand discovery workshop', 'task_completed', 'task', '{"task":"Brand discovery workshop","project":"Meridian Brand Refresh"}'::jsonb, now()-interval '38 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Technical architecture document', 'task_completed', 'task', '{"task":"Technical architecture document","project":"NovaTech Platform Migration"}'::jsonb, now()-interval '37 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created project', 'Bloom E-Commerce Store', 'project_created', 'project', '{"project":"Bloom E-Commerce Store"}'::jsonb, now()-interval '38 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Added client', 'Bloom & Branch', 'client_added', 'client', '{"client":"Bloom & Branch"}'::jsonb, now()-interval '40 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Moodboard & visual direction', 'task_completed', 'task', '{"task":"Moodboard & visual direction"}'::jsonb, now()-interval '34 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Logo design concepts', 'task_completed', 'task', '{"task":"Logo design concepts"}'::jsonb, now()-interval '27 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Database schema design', 'task_completed', 'task', '{"task":"Database schema design"}'::jsonb, now()-interval '29 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created project', 'Skyline Portfolio Site', 'project_created', 'project', '{"project":"Skyline Portfolio Site"}'::jsonb, now()-interval '35 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created project', 'Peak Fitness App', 'project_created', 'project', '{"project":"Peak Fitness App"}'::jsonb, now()-interval '48 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Received payment', '$14,000 from Meridian Studios', 'payment_received', 'finance', '{"amount":14000,"client":"Meridian Studios"}'::jsonb, now()-interval '47 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Received payment', '$26,000 from NovaTech Solutions', 'payment_received', 'finance', '{"amount":26000,"client":"NovaTech Solutions"}'::jsonb, now()-interval '40 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Shopify store setup', 'task_completed', 'task', '{"task":"Shopify store setup","project":"Bloom E-Commerce Store"}'::jsonb, now()-interval '28 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Updated project status', 'Skyline Portfolio Site → Review', 'status_change', 'project', '{"project":"Skyline Portfolio Site","status":"Review"}'::jsonb, now()-interval '8 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Custom theme development', 'task_completed', 'task', '{"task":"Custom theme development","project":"Bloom E-Commerce Store"}'::jsonb, now()-interval '16 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Portfolio page design', 'task_completed', 'task', '{"task":"Portfolio page design","project":"Skyline Portfolio Site"}'::jsonb, now()-interval '22 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', '3D model integration', 'task_completed', 'task', '{"task":"3D model integration","project":"Skyline Portfolio Site"}'::jsonb, now()-interval '13 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Received payment', '$22,500 from Peak Performance', 'payment_received', 'finance', '{"amount":22500,"client":"Peak Performance"}'::jsonb, now()-interval '24 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed project', 'Harbor Dashboard v1', 'project_completed', 'project', '{"project":"Harbor Dashboard v1"}'::jsonb, now()-interval '15 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Received payment', '$35,000 from Harbor Analytics', 'payment_received', 'finance', '{"amount":35000,"client":"Harbor Analytics"}'::jsonb, now()-interval '13 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created project', 'Catalyst SEO Campaign', 'project_created', 'project', '{"project":"Catalyst SEO Campaign"}'::jsonb, now()-interval '20 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Technical SEO audit', 'task_completed', 'task', '{"task":"Technical SEO audit","project":"Catalyst SEO Campaign"}'::jsonb, now()-interval '13 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Keyword research & mapping', 'task_completed', 'task', '{"task":"Keyword research & mapping","project":"Catalyst SEO Campaign"}'::jsonb, now()-interval '8 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Added client', 'Verdant Gardens', 'client_added', 'client', '{"client":"Verdant Gardens"}'::jsonb, now()-interval '15 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Added client', 'Luna Creative', 'client_added', 'client', '{"client":"Luna Creative"}'::jsonb, now()-interval '5 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'User research & personas', 'task_completed', 'task', '{"task":"User research & personas","project":"Peak Fitness App"}'::jsonb, now()-interval '40 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Product catalog import', 'task_completed', 'task', '{"task":"Product catalog import","project":"Bloom E-Commerce Store"}'::jsonb, now()-interval '9 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created document', 'Meridian Brand Strategy', 'document_created', 'document', '{"document":"Meridian Brand Strategy"}'::jsonb, now()-interval '45 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created document', 'NovaTech Technical Spec', 'document_created', 'document', '{"document":"NovaTech Technical Spec"}'::jsonb, now()-interval '40 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'Contact form & CRM integration', 'task_completed', 'task', '{"task":"Contact form & CRM integration","project":"Skyline Portfolio Site"}'::jsonb, now()-interval '6 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Updated project progress', 'Bloom E-Commerce Store → 80%', 'progress_update', 'project', '{"project":"Bloom E-Commerce Store","progress":80}'::jsonb, now()-interval '3 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Received payment', '$6,000 from Bloom & Branch', 'payment_received', 'finance', '{"amount":6000,"client":"Bloom & Branch"}'::jsonb, now()-interval '14 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Received payment', '$6,000 from Artisan Coffee Co.', 'payment_received', 'finance', '{"amount":6000,"client":"Artisan Coffee Co."}'::jsonb, now()-interval '24 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Updated project progress', 'Meridian Brand Refresh → 65%', 'progress_update', 'project', '{"project":"Meridian Brand Refresh","progress":65}'::jsonb, now()-interval '2 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'App wireframes', 'task_completed', 'task', '{"task":"App wireframes","project":"Peak Fitness App"}'::jsonb, now()-interval '30 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Completed task', 'UI design system', 'task_completed', 'task', '{"task":"UI design system","project":"Peak Fitness App"}'::jsonb, now()-interval '20 days'),
    (v_tid, v_uid, 'Admin', 'AD', 'Created document', 'Bloom Launch Checklist', 'document_created', 'document', '{"document":"Bloom Launch Checklist"}'::jsonb, now()-interval '8 days');

  -- ========== CLIENT MESSAGES (20) ==========
  INSERT INTO client_messages (tenant_id, client_id, created_by, sender_type, sender_name, message, created_at) VALUES
    (v_tid, c1, v_uid, 'user', 'Admin', 'Hi! Just wanted to share the latest brand concepts with you. Take a look and let us know your thoughts.', now()-interval '30 days'),
    (v_tid, c1, NULL, 'client', 'James (Meridian)', 'These look amazing! Love option B with the bold typography. Can we explore that direction further?', now()-interval '29 days'),
    (v_tid, c1, v_uid, 'user', 'Admin', 'Great choice! We''ll develop option B into a full brand system. Expect the guidelines doc by next week.', now()-interval '28 days'),
    (v_tid, c1, NULL, 'client', 'James (Meridian)', 'Perfect. Also, can we add a dark version of the logo for social media?', now()-interval '27 days'),
    (v_tid, c2, v_uid, 'user', 'Admin', 'The API endpoints for user auth and dashboard are ready for testing. Here''s the staging URL.', now()-interval '12 days'),
    (v_tid, c2, NULL, 'client', 'Tom (NovaTech)', 'Great progress! Found a couple edge cases with the auth flow — sent details via email.', now()-interval '11 days'),
    (v_tid, c2, v_uid, 'user', 'Admin', 'Thanks for the detailed report. We''ve fixed both issues and deployed to staging. Can you re-test?', now()-interval '10 days'),
    (v_tid, c3, v_uid, 'user', 'Admin', 'All 500 products are imported and the theme is live on the staging store. Ready for your review!', now()-interval '8 days'),
    (v_tid, c3, NULL, 'client', 'Sarah (Bloom)', 'Wow, the store looks beautiful! A few products have wrong images though. I''ll send a list.', now()-interval '7 days'),
    (v_tid, c3, v_uid, 'user', 'Admin', 'Fixed all the product images. Also optimized the mobile checkout flow. Launch on track for next week!', now()-interval '5 days'),
    (v_tid, c5, v_uid, 'user', 'Admin', 'The content structure for the website is ready. When can we schedule the photo shoot?', now()-interval '14 days'),
    (v_tid, c5, NULL, 'client', 'Mike (Artisan)', 'How about Thursday? Our roastery looks best in morning light. We can do product shots first.', now()-interval '13 days'),
    (v_tid, c5, v_uid, 'user', 'Admin', 'Thursday works! We''ll bring our photographer at 9 AM. Plan for about 4 hours.', now()-interval '12 days'),
    (v_tid, c6, v_uid, 'user', 'Admin', 'The 3D viewer is integrated! You can rotate and zoom into each project. Check the staging link.', now()-interval '6 days'),
    (v_tid, c6, NULL, 'client', 'Elena (Skyline)', 'This is incredible! The 3D viewer adds so much value. A few small tweaks on the contact page.', now()-interval '5 days'),
    (v_tid, c8, v_uid, 'user', 'Admin', 'Class booking feature is coming along nicely. Quick question — do you want waitlist functionality?', now()-interval '8 days'),
    (v_tid, c8, NULL, 'client', 'Dave (Peak)', 'Absolutely! Our popular classes fill up fast. Automatic waitlist promotion would be a game changer.', now()-interval '7 days'),
    (v_tid, c8, v_uid, 'user', 'Admin', 'On it! We''ll add automatic promotion when a spot opens up, with push notifications.', now()-interval '6 days'),
    (v_tid, c4, v_uid, 'user', 'Admin', 'SEO audit is complete. Found some quick wins that should improve rankings within 2-3 weeks.', now()-interval '13 days'),
    (v_tid, c4, NULL, 'client', 'Rachel (Catalyst)', 'Great report! Let''s prioritize the page speed fixes first — our bounce rate has been climbing.', now()-interval '12 days');

  -- ========== CLIENT HISTORY (35) ==========
  INSERT INTO client_history (tenant_id, client_id, created_by, user_name, action_type, action_description, action_date, created_at) VALUES
    (v_tid, c1, v_uid, 'Admin', 'meeting', 'Project kickoff meeting — discussed brand vision and goals', now()-interval '50 days', now()-interval '50 days'),
    (v_tid, c1, v_uid, 'Admin', 'call', 'Discovery call — reviewed competitor brands', now()-interval '45 days', now()-interval '45 days'),
    (v_tid, c1, v_uid, 'Admin', 'email', 'Sent moodboard options for review', now()-interval '40 days', now()-interval '40 days'),
    (v_tid, c1, v_uid, 'Admin', 'meeting', 'Brand concept presentation — option B selected', now()-interval '32 days', now()-interval '32 days'),
    (v_tid, c1, v_uid, 'Admin', 'status_change', 'Project progressing well, moving to guidelines phase', now()-interval '20 days', now()-interval '20 days'),
    (v_tid, c2, v_uid, 'Admin', 'meeting', 'Technical requirements gathering session', now()-interval '44 days', now()-interval '44 days'),
    (v_tid, c2, v_uid, 'Admin', 'call', 'Architecture review with CTO', now()-interval '36 days', now()-interval '36 days'),
    (v_tid, c2, v_uid, 'Admin', 'email', 'Sent API documentation and staging credentials', now()-interval '18 days', now()-interval '18 days'),
    (v_tid, c2, v_uid, 'Admin', 'meeting', 'Sprint planning — agreed on sprint 4 priorities', now()-interval '8 days', now()-interval '8 days'),
    (v_tid, c3, v_uid, 'Admin', 'meeting', 'Store design review — approved theme direction', now()-interval '30 days', now()-interval '30 days'),
    (v_tid, c3, v_uid, 'Admin', 'call', 'Product catalog structure discussion', now()-interval '25 days', now()-interval '25 days'),
    (v_tid, c3, v_uid, 'Admin', 'email', 'Shared staging store URL for review', now()-interval '10 days', now()-interval '10 days'),
    (v_tid, c3, v_uid, 'Admin', 'task_created', 'Created QA testing tasks for launch prep', now()-interval '8 days', now()-interval '8 days'),
    (v_tid, c4, v_uid, 'Admin', 'meeting', 'SEO campaign kickoff and goal setting', now()-interval '18 days', now()-interval '18 days'),
    (v_tid, c4, v_uid, 'Admin', 'email', 'Sent SEO audit report', now()-interval '13 days', now()-interval '13 days'),
    (v_tid, c4, v_uid, 'Admin', 'call', 'Discussed keyword priorities and content plan', now()-interval '8 days', now()-interval '8 days'),
    (v_tid, c5, v_uid, 'Admin', 'meeting', 'Initial consultation — discussed brand and website needs', now()-interval '28 days', now()-interval '28 days'),
    (v_tid, c5, v_uid, 'Admin', 'email', 'Sent proposal and quote for website project', now()-interval '26 days', now()-interval '26 days'),
    (v_tid, c5, v_uid, 'Admin', 'call', 'Confirmed project scope and timeline', now()-interval '24 days', now()-interval '24 days'),
    (v_tid, c5, v_uid, 'Admin', 'meeting', 'Content strategy session', now()-interval '20 days', now()-interval '20 days'),
    (v_tid, c6, v_uid, 'Admin', 'meeting', 'Portfolio review — selected 12 projects to feature', now()-interval '33 days', now()-interval '33 days'),
    (v_tid, c6, v_uid, 'Admin', 'call', '3D viewer demo — client very impressed', now()-interval '18 days', now()-interval '18 days'),
    (v_tid, c6, v_uid, 'Admin', 'meeting', 'Final review session — minor feedback gathered', now()-interval '5 days', now()-interval '5 days'),
    (v_tid, c7, v_uid, 'Admin', 'note', 'Referred by existing client. Interested in e-commerce solution.', now()-interval '15 days', now()-interval '15 days'),
    (v_tid, c7, v_uid, 'Admin', 'email', 'Sent capabilities deck and case studies', now()-interval '12 days', now()-interval '12 days'),
    (v_tid, c8, v_uid, 'Admin', 'meeting', 'App kickoff — toured gym facilities and interviewed staff', now()-interval '46 days', now()-interval '46 days'),
    (v_tid, c8, v_uid, 'Admin', 'call', 'User research findings presentation', now()-interval '38 days', now()-interval '38 days'),
    (v_tid, c8, v_uid, 'Admin', 'meeting', 'Design review — approved wireframes and UI system', now()-interval '28 days', now()-interval '28 days'),
    (v_tid, c8, v_uid, 'Admin', 'email', 'Shared beta build for internal testing', now()-interval '10 days', now()-interval '10 days'),
    (v_tid, c9, v_uid, 'Admin', 'meeting', 'Dashboard handoff and training session', now()-interval '16 days', now()-interval '16 days'),
    (v_tid, c9, v_uid, 'Admin', 'email', 'Sent documentation and support contact info', now()-interval '14 days', now()-interval '14 days'),
    (v_tid, c9, v_uid, 'Admin', 'note', 'Project completed. Client may return for phase 2 analytics expansion.', now()-interval '14 days', now()-interval '14 days'),
    (v_tid, c10, v_uid, 'Admin', 'note', 'Referred by Rachel at Catalyst Digital. Creative agency looking for dev partner.', now()-interval '5 days', now()-interval '5 days'),
    (v_tid, c10, v_uid, 'Admin', 'email', 'Sent intro email and portfolio link', now()-interval '4 days', now()-interval '4 days'),
    (v_tid, c10, v_uid, 'Admin', 'call', 'Quick intro call — very interested, meeting scheduled', now()-interval '2 days', now()-interval '2 days');

  RETURN format('Demo data seeded for tenant "%s": 10 clients, 8 projects, 40 tasks, 25 events, 10 documents, 5 folders, 7 budgets, 10 incomes, 19 installments, 40 expenses, 8 finances, 40 activity logs, 20 messages, 35 history entries', p_tenant_slug);
END;
$$;

GRANT EXECUTE ON FUNCTION platform_seed_demo_data(TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload config';
