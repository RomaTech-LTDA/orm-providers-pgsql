# Changelog

All notable changes to @romatech/orm-providers-pgsql will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.1.0] - 2026-11-11

### Fixed
- Query predicates re-checked in JavaScript run on copies of the rows converted to the entity's types: `bigint` and `numeric` (strings in `pg`) as numbers, date strings as `Date`. `where(x => x.id === 5)` on a `bigint`/`bigserial` key, or `where(x => x.price === 12.5)` on a `numeric` column, returned no rows although PostgreSQL matched them, and `numeric` columns sorted as strings client-side. A predicate PostgreSQL already applied that compares a date column with a string literal is no longer re-checked (always false in JS). The returned rows are unchanged driver rows. Predicates written against the driver's own values in 2.0.0 style (for example `x.active === 1` or `x.id === '5'`) keep matching the rows the database returned: when the database already applied the predicate, a row is kept if it holds on either the converted or the original value.
- `update`/`remove`/`find` throw for tables with a composite primary key instead of matching rows by the first key column only (removing one order line deleted every line of the order).
- `getColumnsForTable` (used to find the primary key) only inspects the schema the unqualified table name resolves to through the `search_path` (`to_regclass`); a same-named table in another schema leaked its columns and primary key.
- `getTables` lists the tables reachable through the `search_path` instead of always `public`.
- `update` with only `undefined` values besides the key is a no-op instead of sending invalid SQL (`SET  WHERE`).

### Changed
- The primary key of each table is introspected once and cached (`update`/`remove`/`find` cost one round trip instead of two). The cache is cleared after the provider's DDL, after raw statements other than `SELECT`/`WITH`/`SHOW`/`EXPLAIN` (a `ROLLBACK` can undo DDL), and by the new `clearMetadataCache(tableName?)`.
- CI: `npm ci` (the lockfile had drifted to `@romatech/orm@1.2.0`; re-synced), Node 22 and 24, read-only `permissions`. The publish workflow uses `npm ci` and no longer rewrites the `@romatech/orm` range with `sed` before publishing; the GitHub release runs in a separate job with `contents: write`.
- `npm test` (Node test runner): unit tests, plus integration tests against a real PostgreSQL when `PG_TEST_URL` is set.
- Standardized `index.html` landing page (GitHub Pages).

## [2.0.0] and earlier

Published to npm (1.0.0, 1.2.0, 2.0.0) without changelog entries; see the git history. 1.0.0 was the initial release.
