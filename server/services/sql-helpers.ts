import "server-only";
import { getTableName, sql, type Column } from "drizzle-orm";

/**
 * Fully-qualified column reference ("table"."column").
 * Drizzle omits the table qualifier for columns inside the selected fields of
 * single-table queries, which silently re-binds outer references in
 * correlated subqueries (e.g. "id" resolving to the inner table). Always use
 * this helper for column references inside raw correlated subqueries.
 */
export function qc(column: Column) {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}
