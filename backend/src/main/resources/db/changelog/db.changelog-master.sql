--liquibase formatted sql

-- bookanything baseline schema. See docs/architecture.md section 4.
-- Every business-owned table carries business_id and exposes UNIQUE (business_id, id)
-- so that child tables can use composite foreign keys: cross-tenant references are
-- impossible at the database level.
--
-- Applied changesets are never edited (their comments are part of the checksum), so section numbers cited inside
-- 0011-0013 are those in force when they were written: there "section 16" is now section 18 (marketplace),
-- "section 17" is section 19 (deals) and "section 18" is section 20 (OAuth and the customer MCP).

--changeset bookanything:0001-extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

--changeset bookanything:0002-enums
CREATE TYPE business_status AS ENUM ('draft', 'active', 'suspended');
CREATE TYPE business_plan AS ENUM ('free', 'pro', 'business');
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'staff');
CREATE TYPE member_status AS ENUM ('invited', 'active', 'removed');
CREATE TYPE resource_kind AS ENUM ('person', 'space', 'equipment');
CREATE TYPE payment_mode AS ENUM ('full', 'deposit', 'at_venue', 'free');
CREATE TYPE location_type AS ENUM ('business', 'customer', 'online');
CREATE TYPE question_kind AS ENUM ('text', 'textarea', 'select', 'checkbox', 'number', 'phone', 'email');
CREATE TYPE booking_status AS ENUM ('held', 'pending_approval', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired');
CREATE TYPE payment_status AS ENUM ('not_required', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'pay_at_venue');
CREATE TYPE booking_source AS ENUM ('public', 'dashboard', 'api', 'ai');
CREATE TYPE cancelled_by AS ENUM ('customer', 'business', 'system');
CREATE TYPE payment_kind AS ENUM ('charge', 'refund');
CREATE TYPE payment_record_status AS ENUM ('pending', 'succeeded', 'failed', 'cancelled');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'done', 'failed');
CREATE TYPE actor_type AS ENUM ('owner', 'member', 'customer', 'guest', 'system', 'ai', 'api');

--changeset bookanything:0003-users-businesses
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL UNIQUE,
    email CITEXT,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX users_email_idx ON users (email);

CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    industry TEXT NOT NULL DEFAULT 'generic',
    timezone TEXT NOT NULL DEFAULT 'Europe/Dublin',
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    locale TEXT NOT NULL DEFAULT 'en-IE',
    country CHAR(2) NOT NULL DEFAULT 'IE',
    status business_status NOT NULL DEFAULT 'draft',
    contact_email TEXT,
    contact_phone TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    postcode TEXT,
    website_url TEXT,
    branding JSONB NOT NULL DEFAULT '{"primaryColor":"#4f46e5","logoUrl":null,"coverImageUrl":null}',
    vocabulary JSONB NOT NULL DEFAULT '{"resource":"Staff member","resources":"Staff","customer":"Customer","customers":"Customers","booking":"Booking","bookings":"Bookings"}',
    min_notice_minutes INT NOT NULL DEFAULT 60 CHECK (min_notice_minutes >= 0),
    max_advance_days INT NOT NULL DEFAULT 60 CHECK (max_advance_days BETWEEN 1 AND 730),
    cancellation_notice_hours INT NOT NULL DEFAULT 24 CHECK (cancellation_notice_hours >= 0),
    late_cancellation_refund_percent INT NOT NULL DEFAULT 0 CHECK (late_cancellation_refund_percent BETWEEN 0 AND 100),
    allow_customer_cancel BOOLEAN NOT NULL DEFAULT true,
    allow_customer_reschedule BOOLEAN NOT NULL DEFAULT true,
    hold_minutes INT NOT NULL DEFAULT 30 CHECK (hold_minutes BETWEEN 5 AND 1440),
    require_customer_phone BOOLEAN NOT NULL DEFAULT false,
    stripe_account_id TEXT,
    stripe_charges_enabled BOOLEAN NOT NULL DEFAULT false,
    stripe_details_submitted BOOLEAN NOT NULL DEFAULT false,
    plan business_plan NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT businesses_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
);

CREATE TABLE business_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role member_role NOT NULL,
    invited_email CITEXT,
    invite_token_hash TEXT UNIQUE,
    status member_status NOT NULL DEFAULT 'invited',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    UNIQUE (business_id, user_id),
    CONSTRAINT business_members_identity CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);
CREATE INDEX business_members_user_idx ON business_members (user_id) WHERE status = 'active';
CREATE INDEX business_members_invited_email_idx ON business_members (invited_email) WHERE status = 'invited';

--changeset bookanything:0004-resources-availability
CREATE TABLE customer_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    restricted BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id)
);

CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind resource_kind NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#64748b',
    capacity INT NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 1000),
    member_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, member_id) REFERENCES business_members(business_id, id) ON DELETE SET NULL (member_id)
);
CREATE INDEX resources_member_idx ON resources (member_id) WHERE member_id IS NOT NULL;

CREATE TABLE availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    valid_from DATE,
    valid_until DATE,
    audience_group_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, resource_id) REFERENCES resources(business_id, id) ON DELETE CASCADE,
    CHECK (end_time > start_time),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE INDEX availability_rules_resource_idx ON availability_rules (business_id, resource_id);

CREATE TABLE availability_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    resource_id UUID,
    date DATE NOT NULL,
    is_available BOOLEAN NOT NULL,
    start_time TIME,
    end_time TIME,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, resource_id) REFERENCES resources(business_id, id) ON DELETE CASCADE,
    CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)),
    CHECK (NOT is_available OR start_time IS NOT NULL)
);
CREATE INDEX availability_overrides_date_idx ON availability_overrides (business_id, date);

--changeset bookanything:0005-services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    color TEXT NOT NULL DEFAULT '#4f46e5',
    duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
    buffer_before_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 480),
    buffer_after_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 480),
    slot_interval_minutes INT CHECK (slot_interval_minutes IS NULL OR slot_interval_minutes BETWEEN 5 AND 1440),
    min_notice_minutes INT CHECK (min_notice_minutes IS NULL OR min_notice_minutes >= 0),
    max_advance_days INT CHECK (max_advance_days IS NULL OR max_advance_days BETWEEN 1 AND 730),
    capacity INT NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 1000),
    price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    payment_mode payment_mode NOT NULL DEFAULT 'full',
    deposit_cents INT CHECK (deposit_cents IS NULL OR deposit_cents >= 0),
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    location_type location_type NOT NULL DEFAULT 'business',
    allowed_group_ids UUID[] NOT NULL DEFAULT '{}',
    is_public BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id)
);

CREATE TABLE service_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
    price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, service_id) REFERENCES services(business_id, id) ON DELETE CASCADE
);

CREATE TABLE service_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    extra_minutes INT NOT NULL DEFAULT 0 CHECK (extra_minutes BETWEEN 0 AND 480),
    price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, service_id) REFERENCES services(business_id, id) ON DELETE CASCADE
);

CREATE TABLE service_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id UUID NOT NULL,
    label TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
    customer_selectable BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, service_id) REFERENCES services(business_id, id) ON DELETE CASCADE
);

CREATE TABLE service_requirement_resources (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL,
    resource_id UUID NOT NULL,
    PRIMARY KEY (requirement_id, resource_id),
    FOREIGN KEY (business_id, requirement_id) REFERENCES service_requirements(business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, resource_id) REFERENCES resources(business_id, id) ON DELETE CASCADE
);

CREATE TABLE form_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id UUID,
    label TEXT NOT NULL,
    help_text TEXT,
    kind question_kind NOT NULL DEFAULT 'text',
    options TEXT[] NOT NULL DEFAULT '{}',
    required BOOLEAN NOT NULL DEFAULT false,
    sensitive BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, service_id) REFERENCES services(business_id, id) ON DELETE CASCADE
);

--changeset bookanything:0006-customers-bookings
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email CITEXT,
    phone TEXT,
    notes TEXT,
    group_id UUID,
    marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    erased_at TIMESTAMPTZ,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, group_id) REFERENCES customer_groups(business_id, id) ON DELETE SET NULL (group_id)
);
CREATE UNIQUE INDEX customers_business_email_uq ON customers (business_id, email) WHERE email IS NOT NULL AND erased_at IS NULL;
CREATE INDEX customers_user_idx ON customers (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX customers_email_idx ON customers (email) WHERE user_id IS NULL AND erased_at IS NULL;

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    reference TEXT NOT NULL,
    customer_id UUID NOT NULL,
    service_id UUID NOT NULL,
    option_id UUID,
    option_name TEXT,
    addons JSONB NOT NULL DEFAULT '[]',
    group_id UUID,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status booking_status NOT NULL,
    hold_expires_at TIMESTAMPTZ,
    price_cents INT NOT NULL DEFAULT 0,
    deposit_cents INT,
    currency CHAR(3) NOT NULL,
    amount_paid_cents INT NOT NULL DEFAULT 0,
    amount_refunded_cents INT NOT NULL DEFAULT 0,
    payment_status payment_status NOT NULL DEFAULT 'not_required',
    answers JSONB NOT NULL DEFAULT '[]',
    customer_notes TEXT,
    internal_notes TEXT,
    source booking_source NOT NULL DEFAULT 'public',
    manage_token_hash TEXT UNIQUE,
    idempotency_key TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by cancelled_by,
    cancellation_reason TEXT,
    reminder_sent_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    UNIQUE (business_id, reference),
    UNIQUE (business_id, idempotency_key),
    FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, service_id) REFERENCES services(business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, option_id) REFERENCES service_options(business_id, id) ON DELETE SET NULL (option_id),
    FOREIGN KEY (business_id, group_id) REFERENCES customer_groups(business_id, id) ON DELETE SET NULL (group_id),
    CHECK (end_at > start_at),
    CHECK (amount_paid_cents >= 0 AND amount_refunded_cents >= 0 AND amount_refunded_cents <= amount_paid_cents)
);
CREATE INDEX bookings_business_start_idx ON bookings (business_id, start_at);
CREATE INDEX bookings_customer_idx ON bookings (business_id, customer_id);
CREATE INDEX bookings_held_idx ON bookings (hold_expires_at) WHERE status = 'held';
CREATE INDEX bookings_confirmed_start_idx ON bookings (start_at) WHERE status = 'confirmed';
CREATE INDEX bookings_created_idx ON bookings (business_id, created_at);

CREATE TABLE booking_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL,
    resource_id UUID NOT NULL,
    requirement_id UUID,
    time_range TSTZRANGE NOT NULL,
    exclusive BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, booking_id) REFERENCES bookings(business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, resource_id) REFERENCES resources(business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, requirement_id) REFERENCES service_requirements(business_id, id) ON DELETE SET NULL (requirement_id),
    CONSTRAINT booking_allocations_no_overlap
        EXCLUDE USING gist (resource_id WITH =, time_range WITH &&) WHERE (active AND exclusive)
);
CREATE INDEX booking_allocations_booking_idx ON booking_allocations (booking_id);
CREATE INDEX booking_allocations_resource_range_idx ON booking_allocations USING gist (resource_id, time_range) WHERE active;

--changeset bookanything:0007-payments-platform
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL,
    provider TEXT NOT NULL,
    kind payment_kind NOT NULL,
    provider_ref TEXT,
    checkout_url TEXT,
    return_url TEXT,
    amount_cents INT NOT NULL CHECK (amount_cents >= 0),
    currency CHAR(3) NOT NULL,
    status payment_record_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, booking_id) REFERENCES bookings(business_id, id) ON DELETE CASCADE
);
CREATE INDEX payments_booking_idx ON payments (business_id, booking_id);
CREATE INDEX payments_provider_ref_idx ON payments (provider, provider_ref);

CREATE TABLE provider_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error TEXT
);

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status job_status NOT NULL DEFAULT 'pending',
    run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 8,
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_pending_idx ON jobs (run_at) WHERE status = 'pending';
CREATE INDEX jobs_running_idx ON jobs (locked_at) WHERE status = 'running';

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    actor_type actor_type NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    summary JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_business_idx ON audit_events (business_id, occurred_at DESC, id DESC);
CREATE INDEX audit_events_entity_idx ON audit_events (business_id, entity_id);

CREATE TABLE rate_limit_buckets (
    key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);
CREATE INDEX rate_limit_buckets_window_idx ON rate_limit_buckets (window_start);

CREATE TABLE email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    template TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_log_business_idx ON email_log (business_id, created_at DESC);

--changeset bookanything:0008-row-level-security
-- Defence in depth. The repository layer runs tenant-scoped transactions with
-- SET LOCAL app.business_id = '<uuid>'; inside such a transaction only that
-- tenant's rows are visible/writable. Platform-level work (public slug lookup,
-- /v1/me, the job worker) runs without the setting and is unrestricted.
-- NOTE: superusers and BYPASSRLS roles are never subject to RLS; run the app
-- as a regular role in production for this to take effect.
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business_members USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE customer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer_groups USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON resources USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON availability_rules USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON availability_overrides USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON services USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE service_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_options FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_options USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE service_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_addons FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_addons USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE service_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_requirements USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE service_requirement_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requirement_resources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_requirement_resources USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON form_questions USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customers USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bookings USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE booking_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON booking_allocations USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);

--changeset bookanything:0009-sites
-- Public sites (docs/architecture.md section 15): the draft and published site plan per business,
-- every saved version, and metering of AI site generations and edits.
CREATE TABLE business_sites (
    business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    draft JSONB NOT NULL,
    draft_version INT NOT NULL CHECK (draft_version > 0),
    published JSONB,
    published_version INT,
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT business_sites_published_consistent CHECK ((published IS NULL) = (published_version IS NULL))
);

CREATE TABLE site_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    version INT NOT NULL CHECK (version > 0),
    plan JSONB NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('owner', 'ai_generate', 'ai_edit', 'restore', 'template', 'seed')),
    instruction TEXT,
    changes JSONB NOT NULL DEFAULT '[]',
    actor_type actor_type NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Unique per business; DESC so "newest first" lists and pruning read the index in order.
CREATE UNIQUE INDEX site_versions_business_version_idx ON site_versions (business_id, version DESC);

CREATE TABLE ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('site_generate', 'site_edit')),
    source TEXT NOT NULL CHECK (source IN ('ai', 'template')),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_business_kind_idx ON ai_usage (business_id, kind, created_at);

ALTER TABLE business_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_sites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business_sites USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE site_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_versions USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_usage USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);

--changeset bookanything:0010a-ai-usage-ledger
--validCheckSum: 9:ee90921ace09d52fbace684a748776d8
-- (The checksum above is this changeset before a comment was reworded; databases migrated then still validate.)
-- AI usage ledger (docs/architecture.md section 16): one row per model call, created as a reservation before the call
-- and settled with the provider's token counts afterwards. Cost is in micro-cents (1e-6 US cent) from the versioned
-- price table; credits are derived from it at the configured credit value. business_id is NULL only for platform-level
-- calls (the onboarding business draft, before a business exists). Replaces the per-feature counters of 0009.
DROP TABLE ai_usage;
CREATE TABLE ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    feature TEXT NOT NULL CHECK (feature IN ('business_draft', 'site_generate', 'site_edit', 'assistant')),
    model TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released')),
    input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    cache_write_tokens BIGINT NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
    cache_read_tokens BIGINT NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
    output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    reserved_micro_cents BIGINT NOT NULL DEFAULT 0 CHECK (reserved_micro_cents >= 0),
    cost_micro_cents BIGINT NOT NULL DEFAULT 0 CHECK (cost_micro_cents >= 0),
    overage_micro_cents BIGINT NOT NULL DEFAULT 0 CHECK (overage_micro_cents >= 0),
    price_version TEXT NOT NULL,
    request_id TEXT,
    provider_message_id TEXT,
    stop_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    overage_reported_at TIMESTAMPTZ
);
CREATE INDEX ai_usage_business_created_idx ON ai_usage (business_id, created_at);
CREATE INDEX ai_usage_reserved_idx ON ai_usage (created_at) WHERE status = 'reserved';
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_usage USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);

--changeset bookanything:0010b-assistant
-- Bo, the business assistant (docs/architecture.md section 17): conversations per user per business, proposals
-- (write actions awaiting confirmation), owner-editable business memory and deterministic nudges.
CREATE TABLE assistant_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 120),
    -- Hash of the business context last sent in this thread; the full context is resent only when it changes.
    context_hash TEXT,
    -- Set while a turn is running, so two turns never interleave in one thread.
    busy_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id)
);
CREATE INDEX assistant_threads_user_idx ON assistant_threads (business_id, user_id, updated_at DESC);

CREATE TABLE assistant_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL,
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    kind TEXT NOT NULL CHECK (kind IN ('message', 'tool_results', 'event', 'refusal', 'truncated', 'error')),
    -- The exact content blocks sent to or received from the model (so history replays byte-identically).
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (business_id, thread_id) REFERENCES assistant_threads(business_id, id) ON DELETE CASCADE
);
CREATE INDEX assistant_messages_thread_idx ON assistant_messages (thread_id, seq);

CREATE TABLE assistant_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool TEXT NOT NULL,
    tool_use_id TEXT NOT NULL,
    input JSONB NOT NULL,
    preview JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'failed')),
    result JSONB,
    error TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ,
    FOREIGN KEY (business_id, thread_id) REFERENCES assistant_threads(business_id, id) ON DELETE CASCADE
);
CREATE INDEX assistant_actions_thread_idx ON assistant_actions (thread_id, created_at);

CREATE TABLE assistant_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 280),
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assistant_memory_business_idx ON assistant_memory (business_id, created_at);

CREATE TABLE assistant_nudges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    -- Rule key plus a fingerprint of the facts (e.g. a date), so a dismissed nudge returns when the situation changes.
    key TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    UNIQUE (business_id, key)
);

ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assistant_threads USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assistant_messages USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE assistant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assistant_actions USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE assistant_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_memory FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assistant_memory USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE assistant_nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_nudges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assistant_nudges USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);

--changeset bookanything:0011-marketplace-geo
-- Marketplace (docs/architecture.md section 16): opt-in listings and geocoded business locations,
-- in their own tables so the businesses row stays unchanged.
CREATE TABLE business_locations (
    business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    -- The normalised address the point was computed from; a different address triggers a new geocode.
    address_key TEXT NOT NULL,
    -- 'none' records that the address could not be located (no coordinates).
    precision TEXT NOT NULL CHECK (precision IN ('address', 'postcode', 'city', 'none')),
    source TEXT NOT NULL,
    geocoded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((precision = 'none') = (latitude IS NULL) AND (latitude IS NULL) = (longitude IS NULL))
);
-- Bounding-box prefilter for distance search (exact haversine on the survivors).
CREATE INDEX business_locations_lat_lng_idx ON business_locations (latitude, longitude);

CREATE TABLE marketplace_listings (
    business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    listed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_listings_category_idx ON marketplace_listings (category);

ALTER TABLE business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business_locations USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marketplace_listings USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);

--changeset bookanything:0012-offers
-- Deals: off-peak and last-minute offers applied automatically to the booking price (section 17).
CREATE TABLE offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value INT NOT NULL CHECK (discount_value > 0),
    -- ISO days (Mon=1); empty = every day.
    days_of_week SMALLINT[] NOT NULL DEFAULT '{}',
    -- [{"start":"HH:mm","end":"HH:mm"}]; empty = all day. A slot matches when its start is inside a window.
    time_windows JSONB NOT NULL DEFAULT '[]',
    -- Slots starting within this many hours of now; NULL = no last-minute condition.
    last_minute_hours INT CHECK (last_minute_hours IS NULL OR last_minute_hours BETWEEN 1 AND 168),
    valid_from DATE,
    valid_until DATE,
    max_redemptions INT CHECK (max_redemptions IS NULL OR max_redemptions > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    CHECK (discount_type <> 'percent' OR discount_value <= 100),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE INDEX offers_business_idx ON offers (business_id) WHERE status = 'active';

CREATE TABLE offer_services (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL,
    service_id UUID NOT NULL,
    PRIMARY KEY (offer_id, service_id),
    FOREIGN KEY (business_id, offer_id) REFERENCES offers(business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, service_id) REFERENCES services(business_id, id) ON DELETE CASCADE
);

-- The price snapshot records the applied offer; price_cents stays what the customer owes (after the discount).
ALTER TABLE bookings ADD COLUMN offer_id UUID;
ALTER TABLE bookings ADD COLUMN original_price_cents INT CHECK (original_price_cents IS NULL OR original_price_cents >= 0);
ALTER TABLE bookings ADD COLUMN offer_snapshot JSONB;
ALTER TABLE bookings ADD CONSTRAINT bookings_offer_fk FOREIGN KEY (business_id, offer_id) REFERENCES offers(business_id, id) ON DELETE SET NULL (offer_id);
CREATE INDEX bookings_offer_idx ON bookings (business_id, offer_id) WHERE offer_id IS NOT NULL;

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON offers USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);
ALTER TABLE offer_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_services FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON offer_services USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);

--changeset bookanything:0013-oauth
-- OAuth 2.1 authorization server for the signed-in customer MCP (section 18). Per user (not tenant data), so no RLS.
-- Codes and tokens are stored as SHA-256 hashes only.
CREATE TABLE oauth_clients (
    client_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('dynamic', 'metadata_document')),
    client_name TEXT NOT NULL,
    client_uri TEXT,
    redirect_uris TEXT[] NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Client ID Metadata Documents are cached until then, then fetched again.
    refresh_after TIMESTAMPTZ
);

CREATE TABLE oauth_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    scopes TEXT[] NOT NULL,
    resource TEXT NOT NULL,
    -- Consent record: what the user approved, when, and for which redirect.
    consented_redirect_uri TEXT NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX oauth_grants_active_uq ON oauth_grants (user_id, client_id) WHERE revoked_at IS NULL;

CREATE TABLE oauth_codes (
    code_hash TEXT PRIMARY KEY,
    grant_id UUID NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    resource TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    grant_id UUID NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
    scopes TEXT[] NOT NULL,
    resource TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    -- Refresh tokens are single use (set when rotated); presenting a used one revokes the whole grant.
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX oauth_tokens_grant_idx ON oauth_tokens (grant_id);
CREATE INDEX oauth_tokens_expiry_idx ON oauth_tokens (expires_at);

--changeset bookanything:0014-email-log-rls
-- email_log rows belong to a business (recipient addresses and subjects), so they get the same tenant isolation as every
-- other table with business_id. The notification worker writes them outside a tenant scope, as before.
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON email_log USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = current_setting('app.business_id', true)::uuid);

--changeset bookanything:0015-next-available-only
-- "Offer the next available time only": customers are shown one free time at a time (the earliest, then the next
-- after it on request) instead of the full grid. Staff availability and booking itself are unaffected.
ALTER TABLE businesses ADD COLUMN next_available_only BOOLEAN NOT NULL DEFAULT false;

--changeset bookanything:0016-list-indexes
-- Indexes for reads that otherwise go through every row a business has. The customer list pages through
-- (lower(name), id) with a keyset cursor; the dashboard overview sums the last 30 days of succeeded payments; the reports
-- count customers created in a period.
CREATE INDEX customers_business_name_idx ON customers (business_id, lower(name), id) WHERE erased_at IS NULL;
CREATE INDEX customers_business_created_idx ON customers (business_id, created_at);
CREATE INDEX payments_business_succeeded_idx ON payments (business_id, created_at) WHERE status = 'succeeded';

--changeset bookanything:0017-allow-pay-at-venue
-- A service paid online (in full or a deposit) may also let the customer pay at the venue instead: they choose when
-- they book. Only meaningful for those two modes; the repository stores false for the others.
ALTER TABLE services ADD COLUMN allow_pay_at_venue BOOLEAN NOT NULL DEFAULT false;

--changeset bookanything:0018-paid-in-person
-- Staff record that a booking due at the venue (or a deposit booking's balance) was paid in person. It counts in
-- amount_paid_cents like any payment; this keeps the in-person part apart, because online refunds can only return what
-- was charged online.
ALTER TABLE bookings ADD COLUMN amount_paid_in_person_cents INT NOT NULL DEFAULT 0 CHECK (amount_paid_in_person_cents >= 0);

--changeset bookanything:0019-tenant-policy-unset-setting
-- After a tenant-scoped transaction (set_config(..., true)) app.business_id reads '' rather than NULL for the rest of
-- the session, and the policies cast it to uuid whatever their first arm says (the planner evaluates the cast for its
-- estimates). So as an ordinary role (production; superusers skip row-level security) every unscoped query on a pooled
-- connection that once ran a scoped transaction failed with "invalid input syntax for type uuid". nullif reads '' as
-- unset, as the first arm already does; scoped transactions see exactly the rows they did.
ALTER POLICY tenant_isolation ON ai_usage USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON assistant_actions USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON assistant_memory USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON assistant_messages USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON assistant_nudges USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON assistant_threads USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON audit_events USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON availability_overrides USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON availability_rules USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON booking_allocations USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON bookings USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON business_locations USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON business_members USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON business_sites USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON customer_groups USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON customers USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON email_log USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON form_questions USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON marketplace_listings USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON offer_services USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON offers USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON payments USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON resources USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON service_addons USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON service_options USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON service_requirement_resources USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON service_requirements USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON services USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON site_versions USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);

--changeset bookanything:0020-pending-charges-index
-- Cancelling the pending charges of expired holds (several bookings across businesses, by the job worker) looked them
-- up by booking id among every payment: the (business_id, booking_id) index needs the business first.
CREATE INDEX payments_pending_charge_idx ON payments (booking_id) WHERE kind = 'charge' AND status = 'pending';

--changeset bookanything:0021-active-allocations-by-resource
-- Availability reads the active allocations of some resources overlapping a window (resource_id = ANY(...)). The gist
-- index on (resource_id, time_range) can't take an array, and under row-level security the range overlap (&&) is not
-- leakproof, so it read every allocation of the business. Active allocations are the current and future ones, so by
-- resource they stay few.
CREATE INDEX booking_allocations_resource_active_idx ON booking_allocations (resource_id) WHERE active;

--changeset bookanything:0022-email-text-indexes
-- Email lookups compared citext columns, and citext's = is not leakproof: under row-level security (production) it can't
-- be an index condition, so linking a user's guest bookings and finding their invitations read every customer and every
-- invitation, and finding a business's customer by email read all of that business's customers. The app writes emails
-- lower-cased and compares them as text (email::text = ?, leakproof) through these expression indexes; existing rows are
-- lower-cased first (citext already treats both spellings as equal, so no unique index is affected). The citext indexes
-- they replace served only those lookups; the unique (business_id, email) index stays.
UPDATE customers SET email = lower(email::text) WHERE email::text <> lower(email::text);
UPDATE business_members SET invited_email = lower(invited_email::text) WHERE invited_email::text <> lower(invited_email::text);
CREATE INDEX customers_unlinked_email_idx ON customers ((email::text)) WHERE user_id IS NULL AND erased_at IS NULL;
CREATE INDEX customers_business_email_idx ON customers (business_id, (email::text)) WHERE email IS NOT NULL AND erased_at IS NULL;
CREATE INDEX business_members_invited_email_text_idx ON business_members ((invited_email::text)) WHERE status = 'invited';
DROP INDEX customers_email_idx;
DROP INDEX business_members_invited_email_idx;

--changeset bookanything:0023-retention-indexes
-- The daily purge (jobs/Retention) deletes expired OAuth codes, applied webhook events and failed jobs by age (and the
-- worker deletes finished jobs by age every few minutes); these find them without reading the whole table.
-- oauth_tokens already has its expiry index.
CREATE INDEX oauth_codes_expiry_idx ON oauth_codes (expires_at);
CREATE INDEX provider_events_processed_idx ON provider_events (received_at) WHERE processed_at IS NOT NULL;
CREATE INDEX jobs_finished_idx ON jobs (created_at) WHERE status IN ('done', 'failed');

--changeset bookanything:0024-paid-in-person-and-pending-invitation-rules
-- Money taken in person is part of what was paid (amount_paid_cents counts both, and online refunds return at most the
-- rest). Every write keeps it so; the check makes it a rule. Adding it validates the existing rows: a violating row
-- stops the migration rather than being changed, since which amount is wrong can't be told here.
ALTER TABLE bookings ADD CONSTRAINT bookings_paid_in_person_within_paid CHECK (amount_paid_in_person_cents <= amount_paid_cents);
-- One pending invitation per address and business. The application checks first, but two invitations sent at the same
-- moment could both pass the check. Any duplicates already there are retired ('removed'), keeping the first one sent.
UPDATE business_members m SET status = 'removed', updated_at = now()
WHERE m.status = 'invited' AND EXISTS (
    SELECT 1 FROM business_members o
    WHERE o.business_id = m.business_id AND o.status = 'invited' AND o.invited_email = m.invited_email
      AND (o.created_at, o.id) < (m.created_at, m.id)
);
CREATE UNIQUE INDEX business_members_pending_invitation_uq ON business_members (business_id, invited_email) WHERE status = 'invited';

--changeset bookanything:0025-customer-sort-name
-- The customer list pages by lower-cased name, then id. It ordered by lower(name), which is not leakproof, so under
-- row-level security (production) the keyset condition could not use the 0016 index and every page read the business's
-- customers from the start; and the cursor carried the application's lower-casing of the last name, which differs from
-- Postgres's for some letters, so pages skipped or repeated rows. The lower-cased name is now a stored column, the list
-- orders and compares on it (text comparison is leakproof), and the cursor carries the value read from it. Adding the
-- column rewrites the table (customers is locked while it runs).
ALTER TABLE customers ADD COLUMN sort_name TEXT GENERATED ALWAYS AS (lower(name)) STORED;
CREATE INDEX customers_business_sort_name_idx ON customers (business_id, sort_name, id) WHERE erased_at IS NULL;
DROP INDEX customers_business_name_idx;

--changeset bookanything:0026-portal-style
-- Business websites are off by default (SITES_ENABLED); the booking portal took its fonts and shapes from the site's
-- theme, so it now has its own style preset in branding. Businesses with a published site keep the theme they chose.
UPDATE businesses b
SET branding = jsonb_set(b.branding, '{portalStyle}', s.published -> 'theme')
FROM business_sites s
WHERE s.business_id = b.id AND s.published -> 'theme' IS NOT NULL AND b.branding -> 'portalStyle' IS NULL;

--changeset bookanything:0027-release-schedules
-- Release schedules (section 21): when each day's times open for online booking, for some services and customer
-- groups. A day opens at a time worked out from the schedule (day by day: days_before at release_time; week by week: on
-- weekday, weeks_ahead weeks before the day's week); a release change moves one day's opening (opens_at NULL = held until
-- someone opens it). Nothing is stored when a day opens: availability works it out when asked.
CREATE TABLE release_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly')),
    release_time TIME NOT NULL,
    days_before SMALLINT CHECK (days_before IS NULL OR days_before BETWEEN 0 AND 14),
    weekdays_only BOOLEAN NOT NULL DEFAULT false,
    weekday SMALLINT CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7),
    weeks_ahead SMALLINT CHECK (weeks_ahead IS NULL OR weeks_ahead BETWEEN 1 AND 4),
    -- true: every customer, with or without a group; false: the groups in release_schedule_groups.
    everyone BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    CHECK (
        (cadence = 'daily' AND days_before IS NOT NULL AND weekday IS NULL AND weeks_ahead IS NULL)
        OR (cadence = 'weekly' AND days_before IS NULL AND weekday IS NOT NULL AND weeks_ahead IS NOT NULL AND NOT weekdays_only)
    )
);
CREATE INDEX release_schedules_business_idx ON release_schedules (business_id) WHERE status = 'active';

CREATE TABLE release_schedule_services (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL,
    service_id UUID NOT NULL,
    PRIMARY KEY (schedule_id, service_id),
    FOREIGN KEY (business_id, schedule_id) REFERENCES release_schedules(business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, service_id) REFERENCES services(business_id, id) ON DELETE CASCADE
);

CREATE TABLE release_schedule_groups (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL,
    group_id UUID NOT NULL,
    PRIMARY KEY (schedule_id, group_id),
    FOREIGN KEY (business_id, schedule_id) REFERENCES release_schedules(business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, group_id) REFERENCES customer_groups(business_id, id) ON DELETE CASCADE
);

CREATE TABLE release_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL,
    date DATE NOT NULL,
    opens_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, id),
    UNIQUE (schedule_id, date),
    FOREIGN KEY (business_id, schedule_id) REFERENCES release_schedules(business_id, id) ON DELETE CASCADE
);

ALTER TABLE release_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_schedules USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER TABLE release_schedule_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_schedule_services FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_schedule_services USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER TABLE release_schedule_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_schedule_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_schedule_groups USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);
ALTER TABLE release_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_changes USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);

--changeset bookanything:0028-business-mcp
-- The business MCP (section 20.7): a second OAuth resource, so a person connects an app once per resource (their
-- bookings at /mcp, the businesses they belong to at /mcp/business) and each grant only holds that resource's scopes.
DROP INDEX oauth_grants_active_uq;
CREATE UNIQUE INDEX oauth_grants_active_uq ON oauth_grants (user_id, client_id, resource) WHERE revoked_at IS NULL;

-- A proposal comes from Bo's chat (a thread and the model's tool use) or from a member's connected app (its grant).
ALTER TABLE assistant_actions ALTER COLUMN thread_id DROP NOT NULL;
ALTER TABLE assistant_actions ALTER COLUMN tool_use_id DROP NOT NULL;
ALTER TABLE assistant_actions ADD COLUMN oauth_grant_id UUID REFERENCES oauth_grants(id) ON DELETE CASCADE;
ALTER TABLE assistant_actions ADD CONSTRAINT assistant_actions_origin_ck CHECK (
    (thread_id IS NOT NULL AND tool_use_id IS NOT NULL AND oauth_grant_id IS NULL)
    OR (thread_id IS NULL AND tool_use_id IS NULL AND oauth_grant_id IS NOT NULL)
);
CREATE INDEX assistant_actions_grant_idx ON assistant_actions (oauth_grant_id, created_at) WHERE oauth_grant_id IS NOT NULL;

-- Whether the business's members may use it from their connected AI apps: off until an owner or admin turns it on
-- (connecting a third-party app reaches customers' details, which the business is responsible for). Bo is unaffected.
ALTER TABLE businesses ADD COLUMN ai_agents_enabled BOOLEAN NOT NULL DEFAULT false;

--changeset bookanything:0029-agent-approvals
-- Who may run the business from their own AI apps (section 20.7): off, owners and admins (the default, so whoever runs
-- the business has it from the start), or the whole team. Replaces the on/off switch; only an owner changes it.
ALTER TABLE businesses ADD COLUMN ai_agents_access TEXT NOT NULL DEFAULT 'admins'
    CHECK (ai_agents_access IN ('off', 'admins', 'team'));
-- A business that had turned agents on had them for the whole team.
UPDATE businesses SET ai_agents_access = 'team' WHERE ai_agents_enabled;
ALTER TABLE businesses DROP COLUMN ai_agents_enabled;
-- Kinds of change members' AI apps may make without approval on bookanything (section 20.8): none by default.
ALTER TABLE businesses ADD COLUMN ai_agents_auto_approve TEXT[] NOT NULL DEFAULT '{}';

-- An app's proposal that the member must approve on bookanything (signed in, in the dashboard) before it is carried out:
-- the app can't confirm it itself.
ALTER TABLE assistant_actions ADD COLUMN needs_approval BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assistant_actions ADD CONSTRAINT assistant_actions_approval_ck CHECK (NOT needs_approval OR oauth_grant_id IS NOT NULL);
-- The approvals page: a member's app proposals in a business, newest first.
CREATE INDEX assistant_actions_member_apps_idx ON assistant_actions (business_id, user_id, created_at)
    WHERE oauth_grant_id IS NOT NULL;

--changeset bookanything:0030-notifications
-- What each person is told (section 22): in the app (the bell) and, per their preferences, by email. Per user, across
-- businesses (always read by user_id); business_id names the business it is about, entity_id the booking or
-- proposal, so a customer's erasure can forget them.
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    -- An app path, e.g. /dashboard/lumen-physio/approvals/<id>.
    link TEXT NOT NULL,
    entity_id UUID,
    -- One notification per thing that happened (a retried job doesn't notify twice).
    dedupe_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ,
    emailed_at TIMESTAMPTZ
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_entity_idx ON notifications (business_id, entity_id) WHERE entity_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_dedupe_uq ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Read per person (unscoped); a transaction scoped to a business only ever sees, writes or erases that business's.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);

-- Whether a kind of notification is also emailed, where the person changed it from its default.
CREATE TABLE notification_preferences (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    email BOOLEAN NOT NULL,
    PRIMARY KEY (user_id, kind)
);

--changeset bookanything:0031-customer-agent-approvals
-- A customer's AI app proposes (book, move, cancel) and the customer approves it on bookanything, signed in (section
-- 20.8), unless they let that kind go ahead once the app confirms it. Per user; business_id is the business
-- the booking is with.
CREATE TABLE customer_agent_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    oauth_grant_id UUID NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('book', 'reschedule', 'cancel')),
    input JSONB NOT NULL,
    preview JSONB NOT NULL,
    needs_approval BOOLEAN NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'failed')),
    result JSONB,
    error TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
);
CREATE INDEX customer_agent_requests_user_idx ON customer_agent_requests (user_id, created_at DESC);

-- Read per person (unscoped), like notifications.
ALTER TABLE customer_agent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_agent_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer_agent_requests USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);

-- Kinds of change a customer lets their AI apps make once the app confirms: bookings (book, move), cancellations.
ALTER TABLE users ADD COLUMN agent_auto_approve TEXT[] NOT NULL DEFAULT '{}';

--changeset bookanything:0032-push-devices
-- Phones that get push notifications (section 22): the mobile app's Expo push token, per install. Per user and never
-- about a business (always read by user_id), so no RLS. A token belongs to whoever signed in on that phone last:
-- registering it again moves it to them. Revoked when they sign out there, when Expo says the app is gone, or when they
-- have too many; purged a while after (Retention).
CREATE TABLE push_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- ExponentPushToken[...]
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    app_variant TEXT NOT NULL CHECK (app_variant IN ('development', 'preview', 'production')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The app registers on every launch and sign-in.
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT CHECK (revoked_reason IN ('signed_out', 'not_registered', 'replaced')),
    CONSTRAINT push_devices_revoked_ck CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
CREATE INDEX push_devices_user_idx ON push_devices (user_id) WHERE revoked_at IS NULL;

--changeset bookanything:0033-oauth-refresh-reuse
-- A rotated refresh token may be presented again for a minute (TokenPolicy.REFRESH_REUSE_GRACE: parallel refreshes, a
-- retry after a lost response). parent_hash links a refresh token to the one it was rotated from, so that grace ends as
-- soon as one of its successors has been used; reuse_count caps how many pairs one token gives that way.
ALTER TABLE oauth_tokens ADD COLUMN parent_hash TEXT, ADD COLUMN reuse_count INT NOT NULL DEFAULT 0;
CREATE INDEX oauth_tokens_parent_idx ON oauth_tokens (parent_hash) WHERE parent_hash IS NOT NULL;

--changeset bookanything:0034-stripe-connect-existing
-- How a business's Stripe account was linked (architecture section 7): 'created' by us (Account Links onboarding) or
-- 'oauth', an account the owner already had. Accounts linked before this column existed were all created by us.
-- stripe_connected_at: when it was linked; a deauthorization Stripe reports from before then is about an earlier link.
-- stripe_account_generation: how many accounts it has forgotten; part of the idempotency key that creates an account, so
-- "create one for me" after disconnecting creates a new one rather than replaying the forgotten one.
ALTER TABLE businesses ADD COLUMN stripe_connect_method TEXT CHECK (stripe_connect_method IN ('created', 'oauth')),
    ADD COLUMN stripe_connected_at TIMESTAMPTZ,
    ADD COLUMN stripe_account_generation INT NOT NULL DEFAULT 0;
UPDATE businesses SET stripe_connect_method = 'created', stripe_connected_at = updated_at WHERE stripe_account_id IS NOT NULL;
-- The provider account a charge was taken on (Stripe: the connected account), copied to its refunds: refunds, closing a
-- checkout and the provider's events about it use that account, whatever the business is connected to now.
ALTER TABLE payments ADD COLUMN provider_account TEXT;
UPDATE payments p SET provider_account = b.stripe_account_id FROM businesses b
WHERE p.business_id = b.id AND p.provider = 'stripe' AND b.stripe_account_id IS NOT NULL;
-- One business per Stripe account: Connect events are matched to the business by account, and disconnecting one
-- business must never cut off another's payments. Also the lookup index for those events.
CREATE UNIQUE INDEX businesses_stripe_account_uq ON businesses (stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- Connect OAuth `state`: single use, short lived, bound to the business and the owner who started it. The signed state
-- carries the nonce; only its SHA-256 is stored. Purged a day after it expires (Retention).
CREATE TABLE stripe_connect_states (
    nonce_hash TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    return_url TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stripe_connect_states_expires_idx ON stripe_connect_states (expires_at);
ALTER TABLE stripe_connect_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_connect_states FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stripe_connect_states USING (coalesce(current_setting('app.business_id', true), '') = '' OR business_id = nullif(current_setting('app.business_id', true), '')::uuid);

--changeset bookanything:0035-expired-holds-owe-nothing
-- A hold that expired unpaid owes nothing (architecture section 7): bookings expired before this was recorded said
-- "pending" still.
UPDATE bookings SET payment_status = 'not_required' WHERE status = 'expired' AND payment_status = 'pending' AND amount_paid_cents = 0;
