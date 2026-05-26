-- --- 1. NUCLEAR CLEANUP ---
DROP TABLE IF EXISTS ai_token_logs CASCADE;
DROP TABLE IF EXISTS scan_findings CASCADE;
DROP TABLE IF EXISTS scan_reports CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS post_category CASCADE;
DROP TYPE IF EXISTS project_subcategory CASCADE;
DROP TYPE IF EXISTS user_role CASCADE; 
DROP FUNCTION IF EXISTS set_updated_at CASCADE;

-- --- 2. CORE SETUP ---
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum types
CREATE TYPE post_category AS ENUM ('bio-engineering', 'computer-science', 'projects', 'diary'); 
CREATE TYPE project_subcategory AS ENUM ('serious', 'random');
CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin'); 

-- --- 3. UTILITY FUNCTIONS ---
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --- 4. THE USERS TABLE ---
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(20) UNIQUE NOT NULL CHECK (char_length(username) >= 3),
    password_hash VARCHAR(255) NOT NULL CHECK (char_length(password_hash) >= 60),
    role user_role NOT NULL DEFAULT 'user', 
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- --- 4.5. THE REFRESH TOKENS TABLE (SERIOUS AUTH) ---
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    parent_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL, -- Used to track token lineage for rotation breaches
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent VARCHAR(1024),
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- --- 5. THE POSTS TABLE ---
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category post_category NOT NULL,
    subcategory project_subcategory,
    thumbnail VARCHAR(2048) NOT NULL CHECK (char_length(thumbnail) <= 2048),
    post_images TEXT[] NOT NULL CHECK (cardinality(post_images) BETWEEN 1 AND 5),
    title VARCHAR(150) NOT NULL CHECK (char_length(title) BETWEEN 5 AND 150),
    short_description VARCHAR(300) NOT NULL CHECK (char_length(short_description) BETWEEN 10 AND 300),
    main_content TEXT NOT NULL CHECK (char_length(main_content) BETWEEN 50 AND 15000),
    tags TEXT[] NOT NULL CHECK (cardinality(tags) BETWEEN 1 AND 5),
    external_link VARCHAR(2048), 
    github_link VARCHAR(2048),   
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(main_content, '')), 'C')
    ) STORED,

    CONSTRAINT check_project_subcategory CHECK (
        (category = 'projects' AND subcategory IS NOT NULL) OR 
        (category != 'projects' AND subcategory IS NULL)
    ),

    CONSTRAINT check_serious_project_github CHECK (
        (subcategory != 'serious') OR (github_link IS NOT NULL AND github_link <> '')
    )
);

-- --- 5.1. THE SYSTEM SETTINGS TABLE ---
CREATE TABLE system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_maintenance BOOLEAN NOT NULL DEFAULT false,
    maintenance_message VARCHAR(500) NOT NULL 
        CHECK (char_length(maintenance_message) BETWEEN 10 AND 500)
        DEFAULT 'System is under maintenance. Protocols are being updated.',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO system_settings (id, is_maintenance) VALUES (1, false);

-- --- 5.2. THE AUDIT LOGS TABLE ---
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_username VARCHAR(20) NOT NULL,
    action VARCHAR(100) NOT NULL, 
    details TEXT NOT NULL,        
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(action, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(admin_username, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(details, '')), 'C')
    ) STORED
);

-- --- 5.3. THE AI SCAN REPORTS TABLE (UPDATED) ---
CREATE TABLE scan_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_url VARCHAR(2048) NOT NULL CHECK (char_length(target_url) <= 2048),
    scan_type VARCHAR(20) NOT NULL CHECK (scan_type IN ('url', 'repo')),
    ai_provider VARCHAR(50) NOT NULL DEFAULT 'gemini', -- ADDED: Tracks whether Gemini or Claude ran this report
    ai_model VARCHAR(50) NOT NULL DEFAULT 'gemini-2.5-flash', -- ADDED: Specific model used (e.g. claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5)
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    engine_warnings TEXT[] DEFAULT '{}',
    scanned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- --- 5.4. THE AI SCAN FINDINGS TABLE (UPDATED) ---
CREATE TABLE scan_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    file_path VARCHAR(1024) CHECK (char_length(file_path) <= 1024),
    vulnerability_name VARCHAR(150) NOT NULL CHECK (char_length(vulnerability_name) BETWEEN 2 AND 150),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    code_snippet TEXT,
    ai_explanation TEXT NOT NULL,
    how_to_trigger TEXT NOT NULL,
    ai_fix_suggestion TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Dynamic Full-Text Search enabling lookup across vulnerabilities and explanations
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(vulnerability_name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(file_path, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(ai_explanation, '')), 'C')
    ) STORED
);

-- --- 5.5. THE AI TOKEN LOGS TABLE (UPDATED) ---
CREATE TABLE ai_token_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    model_used VARCHAR(50) NOT NULL DEFAULT 'gemini-2.5-flash',
    prompt_tokens INTEGER NOT NULL CHECK (prompt_tokens >= 0),
    completion_tokens INTEGER NOT NULL CHECK (completion_tokens >= 0),
    total_tokens INTEGER NOT NULL CHECK (total_tokens >= 0),
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('URL_SCAN', 'REPO_SCAN')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- --- 6. PERFORMANCE INDEXES ---
CREATE INDEX idx_posts_search ON posts USING GIN(search_vector);
CREATE INDEX idx_posts_category ON posts(category);
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);
CREATE INDEX idx_posts_author ON posts(author_id);

CREATE INDEX idx_audit_logs_search ON audit_logs USING GIN(search_vector);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Scanner Optimization Indexes
CREATE INDEX idx_scan_reports_scanned_by ON scan_reports(scanned_by);
CREATE INDEX idx_scan_reports_created_at ON scan_reports(created_at DESC);
CREATE INDEX idx_scan_reports_status ON scan_reports(status);
CREATE INDEX idx_scan_findings_report_id ON scan_findings(report_id);
CREATE INDEX idx_scan_findings_search ON scan_findings USING GIN(search_vector);
CREATE INDEX idx_ai_token_logs_admin_id ON ai_token_logs(admin_id);

-- Auth Optimization Indexes
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- --- 7. AUTOMATION TRIGGERS ---
CREATE TRIGGER trigger_update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_update_posts_timestamp
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_update_settings_timestamp
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_update_scan_reports_timestamp
    BEFORE UPDATE ON scan_reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();