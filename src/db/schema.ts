export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    context_summary TEXT NOT NULL,
    courses_json TEXT NOT NULL,
    dishes_json TEXT NOT NULL,
    orders_json TEXT NOT NULL,
    validations_json TEXT NOT NULL,
    risks_json TEXT NOT NULL,
    required_packs_json TEXT NOT NULL,
    status TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    menu_id TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    role TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    backend TEXT NOT NULL,
    model TEXT NOT NULL,
    mode TEXT NOT NULL,
    backend_agent TEXT,
    repair_for_order_id TEXT,
    source_run_id TEXT,
    retry_count INTEGER NOT NULL,
    failure_context_json TEXT NOT NULL,
    isolation_strategy TEXT NOT NULL,
    isolation_reason TEXT NOT NULL,
    profile TEXT NOT NULL,
    prompt_template TEXT NOT NULL,
    tools_json TEXT NOT NULL,
    permissions_json TEXT NOT NULL,
    workspace_id TEXT,
    depends_on_json TEXT NOT NULL,
    packs_json TEXT NOT NULL,
    skills_json TEXT NOT NULL,
    routing_reasons_json TEXT NOT NULL,
    knowledge_sources_json TEXT NOT NULL,
    validations_required_json TEXT NOT NULL,
    retry_limit INTEGER NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    role TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    backend TEXT NOT NULL,
    model TEXT NOT NULL,
    mode TEXT NOT NULL,
    backend_agent TEXT,
    command TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    exit_code INTEGER,
    summary TEXT,
    artifact_ids_json TEXT NOT NULL,
    routing_context_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    path TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    base_revision TEXT NOT NULL,
    strategy TEXT NOT NULL,
    cleanup_status TEXT NOT NULL,
    isolation_reason TEXT NOT NULL,
    locked INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL,
    path TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS validations (
    id TEXT PRIMARY KEY,
    menu_id TEXT NOT NULL,
    order_id TEXT,
    run_id TEXT,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL,
    output_path TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    menu_id TEXT,
    order_id TEXT,
    run_id TEXT,
    role TEXT,
    payload_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_documents_fts USING fts5(
    title,
    body,
    path,
    source_type,
    content='knowledge_documents',
    content_rowid='rowid'
  )`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_documents_ai AFTER INSERT ON knowledge_documents BEGIN
    INSERT INTO knowledge_documents_fts(rowid, title, body, path, source_type)
    VALUES (new.rowid, new.title, new.body, new.path, new.source_type);
  END`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_documents_ad AFTER DELETE ON knowledge_documents BEGIN
    INSERT INTO knowledge_documents_fts(knowledge_documents_fts, rowid, title, body, path, source_type)
    VALUES('delete', old.rowid, old.title, old.body, old.path, old.source_type);
  END`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_documents_au AFTER UPDATE ON knowledge_documents BEGIN
    INSERT INTO knowledge_documents_fts(knowledge_documents_fts, rowid, title, body, path, source_type)
    VALUES('delete', old.rowid, old.title, old.body, old.path, old.source_type);
    INSERT INTO knowledge_documents_fts(rowid, title, body, path, source_type)
    VALUES (new.rowid, new.title, new.body, new.path, new.source_type);
  END`,
  `CREATE INDEX IF NOT EXISTS idx_orders_menu_id ON orders(menu_id)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_order_id ON runs(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_menu_id ON events(menu_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_order_id ON events(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_documents_path ON knowledge_documents(path)`,
];
