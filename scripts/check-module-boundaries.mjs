#!/usr/bin/env node
/**
 * Проверка правила «одна таблица — один владелец» (docs/ARCHITECTURE.md §2.1).
 *
 * Источник истины — аннотации `/// @owner: <модуль>` над моделями в schema.prisma.
 * Скрипт находит все обращения вида `prisma.<model>` / `tx.<model>` в коде модулей
 * и падает, если модуль трогает таблицу, которой не владеет.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(root, 'apps/api/prisma/schema.prisma');
const modulesDir = join(root, 'apps/api/src/modules');

/** @returns {Map<string, string>} модель (в camelCase, как в клиенте) → модуль-владелец */
function readOwners() {
  const schema = readFileSync(schemaPath, 'utf8');
  const owners = new Map();
  const re = /\/\/\/\s*@owner:\s*(\w+)[\s\S]*?\nmodel\s+(\w+)\s*\{/g;
  let m;
  while ((m = re.exec(schema)) !== null) {
    const [, owner, model] = m;
    owners.set(model.charAt(0).toLowerCase() + model.slice(1), owner);
  }
  return owners;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const owners = readOwners();
if (owners.size === 0) {
  console.error('check-module-boundaries: не найдено ни одной аннотации @owner в schema.prisma');
  process.exit(1);
}

const violations = [];
for (const file of walk(modulesDir)) {
  const moduleName = relative(modulesDir, file).split(/[\\/]/)[0];
  const source = readFileSync(file, 'utf8');
  const re =
    /\b(?:prisma|tx|client|db)\.([a-z][A-Za-z0-9]*)\.(?:find|create|update|upsert|delete|count|aggregate|groupBy)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const model = m[1];
    const owner = owners.get(model);
    if (!owner) continue;
    if (owner !== moduleName) {
      violations.push(
        `${relative(root, file)}: модуль "${moduleName}" обращается к таблице "${model}", владелец — "${owner}"`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Нарушены границы владения таблицами:\n' + violations.map((v) => '  - ' + v).join('\n'),
  );
  process.exit(1);
}
console.warn(`check-module-boundaries: OK (${owners.size} таблиц, владельцы соблюдены)`);
