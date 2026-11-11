# @romatech/orm-providers-pgsql

[![npm](https://img.shields.io/npm/v/@romatech%2Form-providers-pgsql)](https://www.npmjs.com/package/@romatech/orm-providers-pgsql)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/RomaTech-LTDA/orm-providers-pgsql/blob/main/LICENSE)

<p align="center">
  <img src="logo.png" width="120" alt="RomaTech ORM – PostgreSQL Provider" />
</p>

PostgreSQL provider for [@romatech/orm](https://www.npmjs.com/package/@romatech/orm).

---

## Installation

```bash
npm install @romatech/orm @romatech/orm-providers-pgsql reflect-metadata
```

---

## Quick Start

```ts
import 'reflect-metadata';
import { DbContext, DbContextOptions } from '@romatech/orm';
import { PgSqlProvider } from '@romatech/orm-providers-pgsql';

class AppDbContext extends DbContext {
    users = this.set(User);

    constructor() {
        super(
            new DbContextOptions().useProvider(
                new PgSqlProvider({
                    host: 'localhost',
                    port: 5432,
                    user: 'postgres',
                    password: 'yourPassword',
                    database: 'mydb'
                })
            )
        );
    }
}
```

---

## Configuration Options

### Object-style (recommended)

```ts
new PgSqlProvider({
    host: 'localhost',
    port: 5432,           // optional, defaults to 5432
    user: 'postgres',
    password: 'yourPassword',
    database: 'mydb'
})
```

### Connection string

```ts
new PgSqlProvider('postgresql://postgres:password@localhost:5432/mydb')
```

---

## SQL Dialect

| Feature | Syntax |
|---------|--------|
| Identifier quoting | `"columnName"` |
| Parameters | `$1`, `$2`, ... (positional) |
| IF NOT EXISTS | `CREATE TABLE IF NOT EXISTS` |

---

## Supported Features

- Full CRUD (add, addRange, update, remove, removeRange, find, getAll)
- Server-side WHERE clause generation from predicates
- Server-side ORDER BY generation
- Migration history table (`"__roma_migrations"`)
- Schema management (createTable, dropTable, addColumn, removeColumn)
- Scaffold (introspect via `pg_class`/`current_schemas` and `information_schema.columns`)
- Parameterised queries (SQL injection safe)
- Transactions through `DbContext.beginTransaction()`

### Notes

- The provider uses **one connection** (`pg.Client`): a transaction covers
  every statement sent through the provider meanwhile, so use one `DbContext`
  per unit of work when requests run concurrently.
- Unqualified table names resolve through the `search_path`, like the
  provider's DML: introspection only reads the schema the name resolves to.
- `update`, `remove` and `find` locate the row by the table's single-column
  primary key (or `id` when the table has none). Tables with a **composite**
  primary key are rejected with an error, instead of matching every row that
  shares the first key column.
- The primary key of each table is introspected once and cached. The cache is
  cleared after the provider's own DDL and after raw statements that are not
  `SELECT`/`WITH`/`SHOW`/`EXPLAIN` (a `ROLLBACK` can undo DDL); call
  `provider.clearMetadataCache()` if another process changes the schema while
  the provider is connected.
- Query predicates are evaluated by PostgreSQL and then re-checked in
  JavaScript on converted copies of the rows: `bigint` and `numeric` (strings
  in `pg`) are compared as numbers, so `x => x.id === 5` works on a `bigserial`
  key. The rows you get back are the driver's rows, unchanged (`bigint` stays
  a string; values beyond `Number.MAX_SAFE_INTEGER` are compared as strings).
  A comparison of a date column with a string literal
  (`x => x.createdAt >= '2024-01-01'`) is left to PostgreSQL.

---

## Type Mappings

| TypeScript Type | PostgreSQL Type |
|-----------------|-----------------|
| `number` | `DOUBLE PRECISION` |
| `boolean` | `BOOLEAN` |
| `Date` | `TIMESTAMPTZ` |
| `string` | `TEXT` |
| `unknown` | `JSONB` |

---

## Requirements

- Node.js >= 18
- PostgreSQL 12 or later
- The [`pg`](https://www.npmjs.com/package/pg) npm package (installed automatically)

---

## License

MIT © RomaTech / Leandro Romanelli
