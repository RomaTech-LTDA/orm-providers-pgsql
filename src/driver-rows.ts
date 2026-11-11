/**
 * @module driver-rows
 *
 * Re-applies a {@link QueryObject} to rows returned by a database driver.
 *
 * Drivers return some column types as JS values that differ from the types
 * the entity (and therefore the query predicates) were written for: a MySQL
 * `BOOLEAN` arrives as `1`, a `DECIMAL` as the string `'12.50'`, a
 * PostgreSQL `bigint` as `'5'`. Re-running `x => x.active === true` on such a
 * row silently drops a row the database already matched. This module runs
 * the predicates, ordering and paging on converted copies of the rows and
 * returns the original rows.
 */

import { applyClientSideQuery, QueryExpression, QueryObject } from '@romatech/orm';

/** Converts a driver value to the JS type predicates expect (or returns it unchanged). */
export type ValueConverter = (value: unknown) => unknown;

/** What the provider knows about the columns of a result set. */
export interface DriverColumns {
  /** Converter per column name, applied before predicates and ordering run. */
  converters: Record<string, ValueConverter>;
  /** Date/time columns (the driver returns `Date` objects or date strings). */
  temporal: Set<string>;
}

/**
 * Runs the query's predicates, ordering, paging and projection on the
 * driver rows (see the module description).
 *
 * A predicate the database already applied (every predicate of the query was
 * translated to SQL) and that compares a date/time column with a string
 * literal, such as `x => x.born >= '2024-01-01'`, is not re-run: JS cannot
 * compare a `Date` with a string, and the database comparison is exact.
 * Every other predicate is re-run, which also trims rows a `LIKE` pattern
 * matched loosely.
 */
export function applyQueryToDriverRows<T, TResult>(
  rows: T[],
  query: QueryObject<T, TResult>,
  columns: DriverColumns
): TResult[] {
  const converterEntries = Object.entries(columns.converters);
  const originals = new Map<T, T>();
  let current: T[] = rows.map(row => {
    if (converterEntries.length === 0 || row === null || typeof row !== 'object') {
      originals.set(row, row);
      return row;
    }
    const copy: any = { ...(row as any) };
    for (const [name, convert] of converterEntries) {
      if (name in copy) {
        copy[name] = convert(copy[name]);
      }
    }
    originals.set(copy, row);
    return copy as T;
  });

  const appliedByServer = query.predicates.length > 0 && query.predicates.length === query.whereExpressions.length;
  query.predicates.forEach((predicate, index) => {
    if (appliedByServer && comparesTemporalWithString(query.whereExpressions[index], columns.temporal)) {
      return;
    }
    current = current.filter(predicate);
  });
  if (query.where && !query.predicates.includes(query.where)) {
    current = current.filter(query.where);
  }

  const ordered = applyClientSideQuery(current, {
    ...query,
    predicates: [],
    whereExpressions: [],
    where: undefined,
    selector: undefined
  }) as unknown as T[];
  const result = ordered.map(row => originals.get(row) as T);
  return query.selector ? result.map(query.selector) : (result as unknown as TResult[]);
}

/** Whether `expression` compares one of the `temporal` columns with a string literal. */
function comparesTemporalWithString(expression: QueryExpression | undefined, temporal: Set<string>): boolean {
  if (!expression || temporal.size === 0) {
    return false;
  }
  if (expression.kind === 'logical') {
    return expression.expressions.some(inner => comparesTemporalWithString(inner, temporal));
  }
  return typeof expression.value === 'string' && temporal.has(expression.field);
}

/**
 * Numeric strings (`DECIMAL`, `NUMERIC`, `BIGINT`) to numbers. An integer
 * string beyond `Number.MAX_SAFE_INTEGER` is left as a string.
 */
export const toNumber: ValueConverter = value => {
  if (typeof value !== 'string' || !/^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(value)) {
    return value;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return value;
  }
  if (/^\s*-?\d+\s*$/.test(value) && !Number.isSafeInteger(number)) {
    return value;
  }
  return number;
};

/** `1`/`0` (and a one-byte `BIT` buffer) to `true`/`false`. */
export const toBoolean: ValueConverter = value => {
  if (value === 1 || value === 0) {
    return value === 1;
  }
  if (value instanceof Uint8Array && value.length === 1 && (value[0] === 0 || value[0] === 1)) {
    return value[0] === 1;
  }
  return value;
};

/**
 * Date strings (`'2024-01-02'`, `'2024-01-02 03:04:05'`, as returned when
 * the driver is configured to return dates as strings) to `Date` objects in
 * local time, like the drivers' own date parsing. Other values are unchanged.
 */
export const toDate: ValueConverter = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value;
  }
  const text = value.length === 10 ? `${value}T00:00:00` : value.replace(' ', 'T');
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? value : date;
};
