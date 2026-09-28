import process from 'node:process';

const sourceRef = process.env.SUPABASE_SOURCE_REF || 'cdfqltezhcssutyjtyjb';
const targetRef = process.env.SUPABASE_TARGET_REF || 'fdsuyqbscrnityotpmbc';
const sourceToken = process.env.SUPABASE_SOURCE_TOKEN;
const targetToken = process.env.SUPABASE_TARGET_TOKEN;
const sourceUrl = `https://${sourceRef}.supabase.co`;
const targetUrl = `https://${targetRef}.supabase.co`;

if (!sourceToken || !targetToken) {
  throw new Error('Definir SUPABASE_SOURCE_TOKEN et SUPABASE_TARGET_TOKEN.');
}

async function managementQuery(token, ref, sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Réponse Supabase non JSON (${response.status}).`);
  }
  if (!response.ok || body?.error) {
    throw new Error(`Erreur SQL Supabase (${response.status}): ${body?.message || body?.error || 'inconnue'}`);
  }
  return body;
}

async function sourceQuery(sql) {
  const rows = await managementQuery(sourceToken, sourceRef, sql);
  return rows?.[0] || {};
}

async function targetQuery(sql) {
  return managementQuery(targetToken, targetRef, sql);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function qualified(schema, name) {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function dollarLiteral(value) {
  const tag = '$bso_clone$';
  return `${tag}${String(value).replaceAll(tag, '$bso_clone_escaped$')}${tag}`;
}

function policySql(policy) {
  const roles = (policy.roles || []).map((role) => role === 'public' ? 'public' : quoteIdent(role)).join(', ');
  const parts = [
    `CREATE POLICY ${quoteIdent(policy.name)} ON ${qualified(policy.schema, policy.table)}`,
    `AS ${policy.permissive === 'RESTRICTIVE' ? 'RESTRICTIVE' : 'PERMISSIVE'}`,
    `FOR ${policy.cmd}`,
    roles ? `TO ${roles}` : '',
    policy.qual ? `USING (${policy.qual})` : '',
    policy.with_check ? `WITH CHECK (${policy.with_check})` : '',
  ];
  return `${parts.filter(Boolean).join(' ')};`;
}

async function loadSnapshot() {
  const [base, routines, views, policies, triggers, grants, buckets] = await Promise.all([
    sourceQuery(`select json_build_object(
      'extensions',(select coalesce(json_agg(extname order by extname),'[]'::json) from pg_extension where extname in ('pgcrypto','pg_trgm','unaccent','fuzzystrmatch')),
      'sequences',(select coalesce(json_agg(json_build_object('schema',schemaname,'name',sequencename,'last_value',last_value::text,'start_value',start_value::text,'increment_by',increment_by::text,'min_value',min_value::text,'max_value',max_value::text,'cache_size',cache_size::text,'cycle',cycle) order by schemaname,sequencename),'[]'::json) from pg_sequences where schemaname='public'),
      'tables',(select coalesce(json_agg(json_build_object(
        'schema','public','name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
        'columns',(select coalesce(json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'generation',case when a.attgenerated <> '' then pg_get_expr(d.adbin,d.adrelid) else null end) order by a.attnum),'[]'::json) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)
      ) order by c.relname),'[]'::json) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
      'constraints',(select coalesce(json_agg(json_build_object('schema','public','table',c.relname,'name',con.conname,'definition',pg_get_constraintdef(con.oid,true)) order by c.relname,con.conname),'[]'::json) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
      'indexes',(select coalesce(json_agg(indexdef order by tablename,indexname),'[]'::json) from pg_indexes i where schemaname='public' and not exists (select 1 from pg_constraint con join pg_class ic on ic.oid=con.conindid where con.connamespace='public'::regnamespace and ic.relname=i.indexname)),
      'primary_keys',(select coalesce(json_agg(json_build_object('table',c.relname,'columns',(select array_agg(a.attname order by x.ord) from unnest(i.indkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.oid and a.attnum=x.attnum)) order by c.relname),'[]'::json) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and i.indisprimary)
    ) as snapshot`),
    sourceQuery(`select coalesce(json_agg(pg_get_functiondef(p.oid) order by p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::json) as routines from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and p.prokind='f' and l.lanname in ('plpgsql','sql')`),
    sourceQuery(`select coalesce(json_agg(json_build_object('schema','public','name',c.relname,'definition',pg_get_viewdef(c.oid,true)) order by c.relname),'[]'::json) as views from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'`),
    sourceQuery(`select coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,'permissive',permissive,'cmd',cmd,'roles',roles,'qual',qual,'with_check',with_check) order by schemaname,tablename,policyname),'[]'::json) as policies from pg_policies where schemaname in ('public','storage')`),
    sourceQuery(`select coalesce(json_agg(pg_get_triggerdef(t.oid,true) order by n.nspname,c.relname,t.tgname),'[]'::json) as triggers from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgparentid=0`),
    sourceQuery(`select coalesce(json_agg(json_build_object('grantee',grantee,'table',table_name,'privilege',privilege_type) order by grantee,table_name,privilege_type),'[]'::json) as grants from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')`),
    sourceQuery(`select coalesce(json_agg(json_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) order by id),'[]'::json) as buckets from storage.buckets`),
  ]);
  return {
    ...base.snapshot,
    routines: routines.routines || [],
    views: views.views || [],
    policies: policies.policies || [],
    triggers: triggers.triggers || [],
    grants: grants.grants || [],
    buckets: buckets.buckets || [],
  };
}

async function applyStructure(snapshot) {
  console.log(`Structure: ${snapshot.tables.length} tables, ${snapshot.routines.length} fonctions, ${snapshot.views.length} vues.`);
  const ddl = [];
  for (const ext of snapshot.extensions || []) ddl.push(`CREATE EXTENSION IF NOT EXISTS ${quoteIdent(ext)};`);
  for (const sequence of snapshot.sequences || []) {
    const q = qualified(sequence.schema, sequence.name);
    ddl.push(`CREATE SEQUENCE IF NOT EXISTS ${q} INCREMENT BY ${sequence.increment_by} MINVALUE ${sequence.min_value} MAXVALUE ${sequence.max_value} START WITH ${sequence.start_value} CACHE ${sequence.cache_size}${sequence.cycle ? ' CYCLE' : ''};`);
  }
  for (const table of snapshot.tables) {
    const columns = table.columns.map((column) => {
      let definition = `${quoteIdent(column.name)} ${column.type}`;
      if (column.identity) definition += ` GENERATED ${column.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
      else if (column.generated) definition += ` GENERATED ALWAYS AS (${column.generation}) STORED`;
      else if (column.default) definition += ` DEFAULT ${column.default}`;
      if (column.not_null) definition += ' NOT NULL';
      return definition;
    });
    ddl.push(`CREATE TABLE IF NOT EXISTS ${qualified(table.schema, table.name)} (${columns.join(', ')});`);
  }
  const nonForeignConstraints = snapshot.constraints.filter((constraint) => !constraint.definition.startsWith('FOREIGN KEY'));
  const foreignKeys = snapshot.constraints.filter((constraint) => constraint.definition.startsWith('FOREIGN KEY'));
  for (const constraint of nonForeignConstraints) ddl.push(`ALTER TABLE ${qualified(constraint.schema, constraint.table)} ADD CONSTRAINT ${quoteIdent(constraint.name)} ${constraint.definition};`);
  for (const index of snapshot.indexes) ddl.push(`${index.endsWith(';') ? index : `${index};`}`);
  ddl.push('ALTER TABLE public."comptes_epargne" ADD CONSTRAINT "comptes_epargne_no_compte_compat_unique" UNIQUE ("no_compte");');
  for (const constraint of foreignKeys) ddl.push(`ALTER TABLE ${qualified(constraint.schema, constraint.table)} ADD CONSTRAINT ${quoteIdent(constraint.name)} ${constraint.definition};`);
  for (const routine of snapshot.routines) ddl.push(routine.endsWith(';') ? routine : `${routine};`);
  for (const view of snapshot.views) ddl.push(`CREATE OR REPLACE VIEW ${qualified(view.schema, view.name)} AS ${view.definition};`);
  for (const table of snapshot.tables) {
    if (table.rls) ddl.push(`ALTER TABLE ${qualified(table.schema, table.name)} ENABLE ROW LEVEL SECURITY;`);
    if (table.force_rls) ddl.push(`ALTER TABLE ${qualified(table.schema, table.name)} FORCE ROW LEVEL SECURITY;`);
  }
  for (const policy of snapshot.policies) ddl.push(policySql(policy));
  for (const trigger of snapshot.triggers) ddl.push(trigger.endsWith(';') ? trigger : `${trigger};`);
  ddl.push('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;');
  for (const grant of snapshot.grants) ddl.push(`GRANT ${grant.privilege} ON TABLE ${qualified('public', grant.table)} TO ${quoteIdent(grant.grantee)};`);
  for (const bucket of snapshot.buckets) {
    ddl.push(`INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES (${sqlLiteral(bucket.id)},${sqlLiteral(bucket.name)},${bucket.public ? 'true' : 'false'},${bucket.file_size_limit ?? 'NULL'},${bucket.allowed_mime_types ? `${sqlLiteral(JSON.stringify(bucket.allowed_mime_types))}::jsonb` : 'NULL'}) ON CONFLICT (id) DO UPDATE SET name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;`);
  }
  await targetQuery(`BEGIN;\n${ddl.join('\n')}\nCOMMIT;`);
  console.log('Structure appliquée.');
}

async function fetchJsonRows(schema, table, orderColumn, offset, limit, columns) {
  const selectList = columns?.length ? columns.map(quoteIdent).join(', ') : '*';
  const sql = `select coalesce(json_agg(to_jsonb(t)), '[]'::json) as rows from (select ${selectList} from ${qualified(schema, table)} order by ${quoteIdent(orderColumn)} limit ${limit} offset ${offset}) t;`;
  const result = await sourceQuery(sql);
  return result.rows || [];
}

async function countRows(schema, table) {
  const result = await sourceQuery(`select count(*)::bigint as count from ${qualified(schema, table)};`);
  return Number(result.count || 0);
}

async function copyTable({ schema, table, columns, orderColumn, identity = false, skip = false }) {
  if (skip) return;
  const count = await countRows(schema, table);
  if (!count) return;
  console.log(`Données ${schema}.${table}: ${count} lignes.`);
  const targetType = `${qualified(schema, table)}`;
  for (let offset = 0; offset < count; offset += 200) {
    const insertColumns = columns.filter((column) => column.generated !== 's' && column.generated !== 'a').map((column) => typeof column === 'string' ? column : column.name);
    const rows = await fetchJsonRows(schema, table, orderColumn, offset, 200, insertColumns);
    if (!rows.length) break;
    const json = JSON.stringify(rows);
    const columnList = insertColumns.map(quoteIdent).join(', ');
    const insert = `insert into ${targetType} (${columnList}) ${identity ? 'overriding system value ' : ''}select ${columnList} from jsonb_populate_recordset(null::${targetType}, ${dollarLiteral(json)}::jsonb);`;
    await targetQuery(`begin; set local session_replication_role = 'replica'; ${insert} commit;`);
    process.stdout.write('.');
  }
  process.stdout.write('\n');
}

async function copyData(snapshot) {
  const targetAuthState = await targetQuery('select (select count(*) from auth.users)::bigint as users, (select count(*) from auth.identities)::bigint as identities;');
  const targetAuth = targetAuthState?.[0] || {};
  if (Number(targetAuth.users || 0) !== 0 || Number(targetAuth.identities || 0) !== 0) {
    throw new Error('La cible Auth n’est plus vide; arrêt préventif pour éviter un écrasement.');
  }
  const authUsersColumns = await sourceQuery(`select coalesce(json_agg(column_name order by ordinal_position),'[]'::json) as columns from information_schema.columns where table_schema='auth' and table_name='users' and is_generated='NEVER';`);
  const authIdentitiesColumns = await sourceQuery(`select coalesce(json_agg(column_name order by ordinal_position),'[]'::json) as columns from information_schema.columns where table_schema='auth' and table_name='identities' and is_generated='NEVER';`);
  await copyTable({ schema: 'auth', table: 'users', columns: authUsersColumns.columns || [], orderColumn: 'id' });
  await copyTable({ schema: 'auth', table: 'identities', columns: authIdentitiesColumns.columns || [], orderColumn: 'id' });
  for (const table of snapshot.tables) {
    const primary = snapshot.primary_keys.find((key) => key.table === table.name);
    const orderColumn = primary?.columns?.[0] || table.columns[0]?.name;
    if (!orderColumn) continue;
    await copyTable({
      schema: table.schema,
      table: table.name,
      columns: table.columns,
      orderColumn,
      identity: table.columns.some((column) => column.identity),
      skip: table.name === 'active_sessions',
    });
  }
  console.log('Données applicatives copiées. Les sessions actives ont été volontairement exclues.');
}

async function syncSequences(snapshot) {
  for (const sequence of snapshot.sequences || []) {
    if (sequence.last_value === null || sequence.last_value === undefined) continue;
    const sequenceRef = `${sequence.schema}.${quoteIdent(sequence.name)}`;
    await targetQuery(`select setval(${sqlLiteral(sequenceRef)}::regclass, ${sequence.last_value}, true);`);
  }
  console.log('Séquences PostgreSQL alignées.');
}

async function targetServiceRoleKey() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/api-keys`, { headers: { Authorization: `Bearer ${targetToken}` } });
  const body = await response.json();
  const key = body.find((item) => item.name === 'service_role')?.api_key || body.find((item) => item.name === 'service_role')?.key;
  if (!key) throw new Error('Clé service_role cible introuvable via l’API Supabase.');
  return key;
}

async function copyStorage(snapshot) {
  const serviceKey = await targetServiceRoleKey();
  for (const bucket of snapshot.buckets || []) {
    const body = { id: bucket.id, name: bucket.name, public: bucket.public, file_size_limit: bucket.file_size_limit, allowed_mime_types: bucket.allowed_mime_types };
    const response = await fetch(`${targetUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok && response.status !== 409 && response.status !== 400) throw new Error(`Création du bucket ${bucket.id} impossible (${response.status}).`);
  }
  const objects = await sourceQuery(`select coalesce(json_agg(json_build_object('bucket_id',bucket_id,'name',name,'metadata',metadata) order by bucket_id,name),'[]'::json) as objects from storage.objects;`);
  const files = objects.objects || [];
  if (!files.length) return;
  console.log(`Storage: ${files.length} fichiers à recopier.`);
  let completed = 0;
  for (let index = 0; index < files.length; index += 4) {
    const batch = files.slice(index, index + 4);
    await Promise.all(batch.map(async (file) => {
      const encodedPath = file.name.split('/').map(encodeURIComponent).join('/');
      const sourceResponse = await fetch(`${sourceUrl}/storage/v1/object/public/${encodeURIComponent(file.bucket_id)}/${encodedPath}`);
      if (!sourceResponse.ok) throw new Error(`Téléchargement impossible pour ${file.bucket_id}/${file.name} (${sourceResponse.status}).`);
      const data = await sourceResponse.arrayBuffer();
      const contentType = file.metadata?.mimetype || sourceResponse.headers.get('content-type') || 'application/octet-stream';
      const targetResponse = await fetch(`${targetUrl}/storage/v1/object/${encodeURIComponent(file.bucket_id)}/${encodedPath}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: data,
      });
      if (!targetResponse.ok) throw new Error(`Envoi impossible pour ${file.bucket_id}/${file.name} (${targetResponse.status}).`);
      completed += 1;
    }));
    if (completed % 100 < 4 || completed === files.length) console.log(`Storage: ${completed}/${files.length}.`);
  }
}

async function syncAuthConfig() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${sourceRef}/config/auth`, { headers: { Authorization: `Bearer ${sourceToken}` } });
  if (!response.ok) return;
  const source = await response.json();
  const safeFields = [
    'site_url', 'additional_redirect_urls', 'disable_signup', 'mailer_autoconfirm',
    'security_captcha_enabled', 'jwt_expiry', 'refresh_token_rotation_enabled',
    'refresh_token_reuse_interval', 'password_min_length', 'password_required_characters',
  ];
  const config = Object.fromEntries(safeFields.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  if (!Object.keys(config).length) return;
  const update = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${targetToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!update.ok) throw new Error(`Réglages Auth non appliqués (${update.status}).`);
  console.log('Réglages Auth compatibles recopiés; aucun secret SMTP ou token de session n’a été copié.');
}

async function main() {
  console.log(`Clone Supabase ${sourceRef} -> ${targetRef}`);
  const snapshot = await loadSnapshot();
  if (process.env.SUPABASE_SKIP_STRUCTURE !== 'true') await applyStructure(snapshot);
  else console.log('Structure déjà appliquée; reprise en phase données.');
  if (process.env.SUPABASE_SKIP_DATA !== 'true') await copyData(snapshot);
  else console.log('Données déjà appliquées; reprise sans recopie.');
  await syncSequences(snapshot);
  if (process.env.SUPABASE_SKIP_STORAGE !== 'true') await copyStorage(snapshot);
  else console.log('Storage déjà appliqué; reprise sans recopie.');
  await syncAuthConfig();
  console.log('Clone terminé. Contrôle final recommandé: npm run check puis tests SQL sur la cible.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
