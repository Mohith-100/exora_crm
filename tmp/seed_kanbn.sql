INSERT INTO public.user (id, name, email, "emailVerified", "createdAt", "updatedAt") 
VALUES ('00000000-0000-0000-0000-000000000000', 'Admin', 'admin@local.com', true, NOW(), NOW()) 
ON CONFLICT DO NOTHING;

INSERT INTO workspace (id, "publicId", name, slug, "createdBy", "createdAt") 
VALUES (1, 'default', 'Main Workspace', 'main-workspace', '00000000-0000-0000-0000-000000000000', NOW()) 
ON CONFLICT DO NOTHING;
