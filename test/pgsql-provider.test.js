'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { QueryBuilder } = require('@romatech/orm');
const { PgSqlProvider } = require('../dist');

/** Provider whose pg client is replaced by a stub that records every statement. */
function stubProvider(columns) {
  const statements = [];
  const provider = new PgSqlProvider('postgresql://unused');
  provider.client = {
    async query(sql, params) {
      statements.push({ sql, params });
      return { rows: /information_schema\.columns/.test(sql) ? columns : [] };
    }
  };
  return { provider, statements };
}

const singleKey = [
  { name: 'id', type: 'integer', primary_key: true },
  { name: 'name', type: 'text', primary_key: false }
];
const compositeKey = [
  { name: 'orderId', type: 'integer', primary_key: true },
  { name: 'lineNo', type: 'integer', primary_key: true },
  { name: 'qty', type: 'integer', primary_key: false }
];

describe('primary key handling', () => {
  for (const method of ['update', 'remove', 'find']) {
    test(`${method}() refuses a composite primary key instead of matching on its first column`, async () => {
      const { provider, statements } = stubProvider(compositeKey);
      await assert.rejects(() => provider[method]({ orderId: 1, lineNo: 1, qty: 5 }, 'lines'), /composite primary key/);
      assert.ok(statements.every(s => !/^(UPDATE|DELETE|SELECT \*)/.test(s.sql)), 'no DML must be sent');
    });
  }

  test('update() with only undefined values besides the key sends nothing', async () => {
    const { provider, statements } = stubProvider(singleKey);
    await provider.update({ id: 1, name: undefined }, 'items');
    assert.ok(statements.every(s => !s.sql.startsWith('UPDATE')));
  });

  test('update() uses the introspected key', async () => {
    const { provider, statements } = stubProvider(singleKey);
    await provider.update({ id: 1, name: 'x' }, 'items');
    assert.deepEqual(statements.at(-1), { sql: 'UPDATE "items" SET "name" = $1 WHERE "id" = $2', params: ['x', 1] });
  });
});

test('column introspection is limited to the schema the name resolves to', async () => {
  const { provider, statements } = stubProvider(singleKey);
  await provider.getColumnsForTable('items');
  assert.match(statements[0].sql, /to_regclass\(quote_ident\(\$1\)\)/);
  assert.match(statements[0].sql, /tc\.table_schema = c\.table_schema/);
  assert.deepEqual(statements[0].params, ['items']);
});

describe('primary key cache', () => {
  const introspections = statements => statements.filter(s => /information_schema\.columns/.test(s.sql)).length;

  test('the primary key is introspected once per table, not on every operation', async () => {
    const { provider, statements } = stubProvider(singleKey);
    await provider.update({ id: 1, name: 'a' }, 'items');
    await provider.remove({ id: 1 }, 'items');
    await provider.find({ id: 1 }, 'items');
    assert.equal(introspections(statements), 1);
  });

  test('DDL and raw non-SELECT statements invalidate the cached key; SELECT does not', async () => {
    const { provider, statements } = stubProvider(singleKey);
    await provider.remove({ id: 1 }, 'items');
    await provider.executeQuery('SELECT 1', []);
    await provider.remove({ id: 1 }, 'items');
    assert.equal(introspections(statements), 1);
    await provider.dropTable('items');
    await provider.remove({ id: 1 }, 'items');
    assert.equal(introspections(statements), 2);
    await provider.executeQuery('ROLLBACK', []);
    await provider.remove({ id: 1 }, 'items');
    assert.equal(introspections(statements), 3);
    provider.clearMetadataCache();
    await provider.remove({ id: 1 }, 'items');
    assert.equal(introspections(statements), 4);
  });

  test('a failed key lookup is not cached', async () => {
    const { provider, statements } = stubProvider(singleKey);
    const query = provider.client.query;
    let fail = true;
    provider.client.query = async (sql, params) => {
      if (fail && /information_schema/.test(sql)) { fail = false; throw new Error('lookup failed'); }
      return query(sql, params);
    };
    await assert.rejects(() => provider.remove({ id: 1 }, 'items'), /lookup failed/);
    await provider.remove({ id: 1 }, 'items');
    assert.ok(statements.some(s => s.sql.startsWith('DELETE')));
  });
});

describe('client-side predicates on driver values', () => {
  // pg type OIDs: int8 20, numeric 1700, timestamp 1114
  const fields = [
    { name: 'id', dataTypeID: 20 },
    { name: 'price', dataTypeID: 1700 },
    { name: 'born', dataTypeID: 1114 }
  ];
  const rows = [
    { id: '1', price: '12.50', born: new Date(2024, 0, 2) },
    { id: '2', price: '9.99', born: new Date(2023, 5, 1) },
    { id: '9007199254740993', price: '1', born: new Date(2020, 0, 1) }
  ];
  function selectStub(result) {
    const stub = stubProvider(singleKey);
    const query = stub.provider.client.query;
    stub.provider.client.query = async (sql, params) => /^SELECT \* FROM/.test(sql)
      ? (stub.statements.push({ sql, params }), { rows: result.map(row => ({ ...row })), fields })
      : query(sql, params);
    return stub;
  }
  const query = provider => new QueryBuilder(class Item {}, provider, 'items');

  test('bigint and numeric strings match number predicates; the driver rows are returned', async () => {
    const { provider } = selectStub(rows);
    assert.deepEqual((await query(provider).where(x => x.id === 2).toList()).map(r => r.id), ['2']);
    assert.deepEqual((await query(provider).where(x => x.price > 10).toList()).map(r => r.id), ['1']);
    // Beyond Number.MAX_SAFE_INTEGER the value stays a string.
    assert.deepEqual((await query(provider).where(x => x.id === '9007199254740993').toList()).map(r => r.id), ['9007199254740993']);
  });

  test('predicates written against the driver values (2.0.0 style) still match the rows PostgreSQL returned', async () => {
    // PostgreSQL applied `id = '2'` / `price = '9.99'`; the re-check must not drop the row.
    const { provider } = selectStub([rows[1]]);
    assert.deepEqual((await query(provider).where(x => x.id === '2').toList()).map(r => r.id), ['2']);
    assert.deepEqual((await query(provider).where(x => x.price === '9.99').toList()).map(r => r.id), ['2']);
  });

  test('numeric strings sort as numbers', async () => {
    const { provider } = selectStub(rows.slice(0, 2));
    assert.deepEqual((await query(provider).orderByDescending(x => x.price).toList()).map(r => r.id), ['1', '2']);
  });

  test('a timestamp compared with a string literal is left to PostgreSQL', async () => {
    const { provider, statements } = selectStub([rows[0]]);
    const matched = await query(provider).where(x => x.born >= '2024-01-01').toList();
    assert.match(statements.at(-1).sql, /WHERE "born" >= \$1/);
    assert.deepEqual(matched.map(r => r.id), ['1']);
  });
});

// ─── Integration (PG_TEST_URL=postgresql://user:pass@host:port/db) ────────────

const url = process.env.PG_TEST_URL;

describe('integration with a real PostgreSQL', { skip: !url && 'set PG_TEST_URL to run' }, () => {
  test('composite keys, schema isolation and transactions', async () => {
    const provider = new PgSqlProvider(url);
    await provider.connect('');
    const schema = `roma_other_${process.pid}`;
    try {
      await provider.executeQuery('DROP TABLE IF EXISTS "roma_lines", "roma_items"', []);
      await provider.executeQuery(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`, []);
      await provider.executeQuery(`CREATE SCHEMA "${schema}"`, []);
      await provider.executeQuery('CREATE TABLE "roma_lines" ("orderId" int, "lineNo" int, PRIMARY KEY ("orderId", "lineNo"))', []);
      await provider.executeQuery('CREATE TABLE "roma_items" ("id" int PRIMARY KEY, "name" text)', []);
      await provider.executeQuery(`CREATE TABLE "${schema}"."roma_items" ("code" text PRIMARY KEY, "extra" text)`, []);

      await provider.addRange([{ orderId: 1, lineNo: 1 }, { orderId: 1, lineNo: 2 }], 'roma_lines');
      await assert.rejects(() => provider.remove({ orderId: 1, lineNo: 1 }, 'roma_lines'), /composite primary key/);
      assert.equal((await provider.getAll('roma_lines')).length, 2);

      const columns = await provider.getColumnsForTable('roma_items');
      assert.deepEqual(columns.map(c => [c.name, c.primaryKey]), [['id', true], ['name', false]]);

      await provider.add({ id: 1, name: 'a' }, 'roma_items');
      await provider.executeQuery('BEGIN', []);
      await provider.update({ id: 1, name: 'b' }, 'roma_items');
      await provider.executeQuery('ROLLBACK', []);
      assert.equal((await provider.find({ id: 1 }, 'roma_items')).name, 'a');

      await provider.executeQuery('CREATE TABLE "roma_big" ("id" bigint PRIMARY KEY, "price" numeric(10,2), "born" timestamp)', []);
      await provider.addRange([
        { id: 1, price: 12.5, born: new Date(2024, 0, 2) },
        { id: 2, price: 9.99, born: new Date(2023, 5, 1) }
      ], 'roma_big');
      const q = () => new QueryBuilder(class Big {}, provider, 'roma_big');
      assert.deepEqual((await q().where(x => x.id === 2).toList()).map(r => r.id), ['2']);
      assert.deepEqual((await q().where(x => x.price === 12.5).toList()).map(r => r.id), ['1']);
      assert.deepEqual((await q().where(x => x.born >= '2024-01-01').toList()).map(r => r.id), ['1']);
      await provider.update({ id: 2, price: 1 }, 'roma_big');
      assert.equal((await provider.find({ id: 2 }, 'roma_big')).price, '1.00');
    } finally {
      await provider.executeQuery('DROP TABLE IF EXISTS "roma_lines", "roma_items", "roma_big"', []);
      await provider.executeQuery(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`, []);
      await provider.disconnect();
    }
  });

  test('a table found through a later search_path schema keeps its key', async () => {
    // search_path is "$user", public: once a schema named after the user
    // exists, current_schema() points to it while the table stays in public.
    const provider = new PgSqlProvider(url);
    await provider.connect('');
    const userSchema = `roma_user_${process.pid}`;
    try {
      await provider.executeQuery(`DROP SCHEMA IF EXISTS "${userSchema}" CASCADE`, []);
      await provider.executeQuery('DROP TABLE IF EXISTS public."roma_codes"', []);
      await provider.executeQuery(`CREATE SCHEMA "${userSchema}"`, []);
      await provider.executeQuery(`SET search_path TO "${userSchema}", public`, []);
      await provider.executeQuery('CREATE TABLE public."roma_codes" ("code" text PRIMARY KEY, "label" text)', []);

      const columns = await provider.getColumnsForTable('roma_codes');
      assert.deepEqual(columns.map(c => [c.name, c.primaryKey]), [['code', true], ['label', false]]);
      assert.ok((await provider.getTables()).includes('roma_codes'));

      await provider.add({ code: 'a', label: 'x' }, 'roma_codes');
      await provider.update({ code: 'a', label: 'y' }, 'roma_codes');
      assert.equal((await provider.find({ code: 'a' }, 'roma_codes')).label, 'y');
    } finally {
      await provider.executeQuery('DROP TABLE IF EXISTS public."roma_codes"', []);
      await provider.executeQuery(`DROP SCHEMA IF EXISTS "${userSchema}" CASCADE`, []);
      await provider.disconnect();
    }
  });
});
