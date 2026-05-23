'use strict';

// DB-first local/Render startup wrapper.
// It intentionally does not contain any database credentials. Put DATABASE_URL in .env or in Render env vars.
function setDefault(name, value) {
  if (process.env[name] === undefined || process.env[name] === '') process.env[name] = value;
}

require('./load-local-env').loadLocalEnvFile();

setDefault('USE_HTTPS', 'false');
setDefault('PUBLIC_BASE_URL', `http://localhost:${process.env.PORT || 3443}`);
setDefault('ENABLE_APP_DB', 'true');
setDefault('ENABLE_POSTGRES_STORAGE', 'true');
setDefault('AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH', 'true');
setDefault('POSTGRES_AUTO_MIGRATE', 'true');
setDefault('POSTGRES_BOOTSTRAP_FROM_JSON', 'true');
setDefault('POSTGRES_DIRECT_EVENT_WRITE', 'true');
setDefault('POSTGRES_SYNC_CONFIG', 'true');
setDefault('POSTGRES_SYNC_ANALYTICS', 'true');
setDefault('PERSIST_EVENT_STATS_IN_JSON', 'false');
setDefault('LOCAL_EVENT_LOG_ENABLED', 'false');
setDefault('LOCAL_STATE_WRITE_ENABLED', 'false');
setDefault('LOCAL_RUNTIME_WRITE_ENABLED', 'false');
setDefault('KEEP_IN_MEMORY_EVENT_STATS', 'true');
setDefault('AUTH_DEBUG_LOGS', process.env.NODE_ENV === 'production' ? 'false' : 'true');

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
if (/render\.com/i.test(url) || /sslmode=require/i.test(url)) process.env.POSTGRES_SSL = 'true';

if (!url) {
  console.error('[db-first] DATABASE_URL or POSTGRES_URL is missing. Create .env or set it in Render Environment.');
  process.exit(1);
}

require('../server');
