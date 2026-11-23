import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RESERVED_USERNAMES, USERNAME_RE } from "@/lib/types";

/** The array inside public.is_reserved_username() in supabase/schema.sql. */
function schemaReservedNames() {
  const sql = readFileSync("supabase/schema.sql", "utf8");
  const fn = sql.match(/create or replace function public\.is_reserved_username\([\s\S]*?\$\$([\s\S]*?)\$\$/);
  assert.ok(fn, "is_reserved_username() is in schema.sql");
  const array = fn[1].match(/array\[([\s\S]*?)\]/);
  assert.ok(array, "it checks against an array literal");
  return [...array[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

test("the database's reserved names are exactly the app's", () => {
  const db = schemaReservedNames();
  assert.equal(new Set(db).size, db.length, "no duplicates in schema.sql");
  assert.deepEqual([...db].sort(), [...RESERVED_USERNAMES].sort());
});

test("every reserved name is otherwise a valid username (so the check actually matters)", () => {
  for (const name of RESERVED_USERNAMES) assert.match(name, USERNAME_RE, name);
});

test("no leftover inline reserved list in the profiles table definition", () => {
  const sql = readFileSync("supabase/schema.sql", "utf8");
  const table = sql.match(/create table if not exists public\.profiles \(([\s\S]*?)\n\);/);
  assert.ok(table);
  assert.ok(!/'dashboard'/.test(table[1]), "the list lives only in is_reserved_username()");
});
