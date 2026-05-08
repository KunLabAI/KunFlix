-- =============================================================================
-- KunFlix - PostgreSQL 初始化脚本
-- 由 postgres:16-alpine 官方镜像自动执行（/docker-entrypoint-initdb.d/）
-- 仅在 pgdata 卷为空的首次启动时运行一次
-- =============================================================================

-- 数据库由 POSTGRES_DB 环境变量自动创建，这里只做扩展 / 字符集兜底

-- 常用扩展（按需启用，当前业务未依赖，可保留空）
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 时区 / 字符集（Postgres 16 默认即 UTF-8，这里仅作显式声明参考）
SELECT current_setting('server_encoding') AS server_encoding,
       current_setting('timezone')        AS timezone;
