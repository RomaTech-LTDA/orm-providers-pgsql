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
- Scaffold (introspect via `pg_tables` and `information_schema.columns`)
- Parameterised queries (SQL injection safe)

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
