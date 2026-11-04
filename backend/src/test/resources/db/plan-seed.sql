-- Data for PlanTest (support/QueryPlans.kt): enough rows, spread like production's, for the planner to cost index
-- scans as it would there (on a nearly empty table any index looks as good as another). Statements are separated by
-- a line holding only ";". 20 businesses, each with 4 resources, a service, 200 customers (a third with accounts) and
-- 2000 bookings over a year with one allocation and one charge each, and 50 pending invitations; OAuth codes and
-- tokens for every user, webhook events and jobs over a year.
INSERT INTO businesses (id, slug, name) SELECT gen_random_uuid(), 'plan-' || n, 'Plan ' || n FROM generate_series(1, 20) n
;
INSERT INTO resources (business_id, kind, name) SELECT b.id, 'person', 'R' || n FROM businesses b, generate_series(1, 4) n
;
INSERT INTO services (business_id, name, duration_minutes) SELECT b.id, 'Service', 60 FROM businesses b
;
INSERT INTO users (clerk_user_id, email, email_verified)
SELECT 'plan_' || n, 'user' || n || '@example.test', true FROM generate_series(1, 2000) n
;
INSERT INTO customers (business_id, name, email, user_id)
SELECT b.id, 'C' || n, 'customer' || n || '-' || b.slug || '@example.test',
    CASE WHEN n % 3 = 0 THEN (SELECT u.id FROM users u WHERE u.clerk_user_id = 'plan_' || (n * 7 + length(b.slug)) % 2000) END
FROM businesses b, generate_series(1, 200) n
;
INSERT INTO bookings (business_id, reference, customer_id, service_id, start_at, end_at, status, currency)
SELECT c.business_id, 'P' || c.id || '-' || k, c.id, s.id,
    timestamptz '2026-01-01' + make_interval(hours => k * 37 + abs(hashtext(c.id::text)) % 8000),
    timestamptz '2026-01-01' + make_interval(hours => k * 37 + abs(hashtext(c.id::text)) % 8000 + 1),
    (ARRAY['confirmed', 'completed', 'cancelled', 'held', 'no_show', 'expired']::booking_status[])[1 + k % 6], 'EUR'
FROM customers c JOIN services s ON s.business_id = c.business_id, generate_series(1, 10) k
;
INSERT INTO booking_allocations (business_id, booking_id, resource_id, time_range, exclusive, active)
SELECT b.business_id, b.id,
    (SELECT r.id FROM resources r WHERE r.business_id = b.business_id ORDER BY r.id OFFSET abs(hashtext(b.id::text)) % 4 LIMIT 1),
    tstzrange(b.start_at, b.end_at), false, b.status IN ('confirmed', 'held', 'pending_approval')
FROM bookings b
;
INSERT INTO payments (business_id, booking_id, provider, kind, amount_cents, currency, status)
SELECT b.business_id, b.id, 'dev', 'charge', 1000, 'EUR',
    (ARRAY['succeeded', 'failed', 'cancelled', 'succeeded', 'pending']::payment_record_status[])[1 + abs(hashtext(b.id::text)) % 5]
FROM bookings b
;
INSERT INTO business_members (business_id, role, invited_email, status)
SELECT b.id, 'staff', 'invite' || n || '-' || b.slug || '@example.test', 'invited' FROM businesses b, generate_series(1, 50) n
;
INSERT INTO oauth_clients (client_id, kind, client_name, redirect_uris) VALUES ('plan-client', 'dynamic', 'Plan', '{https://example.test/cb}')
;
INSERT INTO oauth_grants (user_id, client_id, scopes, resource, consented_redirect_uri, consented_at)
SELECT id, 'plan-client', '{bookings:read}', 'https://api.example.test/mcp', 'https://example.test/cb', now() FROM users
;
INSERT INTO oauth_codes (code_hash, grant_id, redirect_uri, code_challenge, scopes, resource, expires_at)
SELECT md5(g.id::text || n), g.id, 'https://example.test/cb', 'c', '{bookings:read}', 'r',
    timestamptz '2026-01-01' + make_interval(mins => abs(hashtext(g.id::text || n)) % 400000)
FROM oauth_grants g, generate_series(1, 5) n
;
INSERT INTO oauth_tokens (token_hash, grant_id, kind, scopes, resource, expires_at)
SELECT md5(g.id::text || 't' || n), g.id, CASE WHEN n % 2 = 0 THEN 'access' ELSE 'refresh' END, '{bookings:read}', 'r',
    timestamptz '2026-01-01' + make_interval(mins => abs(hashtext(g.id::text || 't' || n)) % 400000)
FROM oauth_grants g, generate_series(1, 10) n
;
INSERT INTO provider_events (id, provider, type, payload, received_at, processed_at)
SELECT 'evt_' || n, 'stripe', 'checkout.session.completed', '{}', timestamptz '2026-01-01' + make_interval(mins => n * 20),
    CASE WHEN n % 100 <> 0 THEN timestamptz '2026-01-01' + make_interval(mins => n * 20 + 1) END
FROM generate_series(1, 20000) n
;
INSERT INTO jobs (kind, status, created_at)
SELECT 'notify', (ARRAY['done', 'done', 'done', 'done', 'failed', 'pending']::job_status[])[1 + n % 6],
    timestamptz '2026-01-01' + make_interval(mins => n * 20)
FROM generate_series(1, 20000) n
;
-- One business with a long customer list (who has paged through 200 customers?): 5000 more, without bookings.
INSERT INTO customers (business_id, name)
SELECT b.id, 'Guest ' || n FROM businesses b, generate_series(1, 5000) n WHERE b.slug = 'plan-1'
;
ANALYZE
