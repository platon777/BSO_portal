// global fetch is available in Node 18+

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_TARGET_REF || 'fdsuyqbscrnityotpmbc';

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  return res.json();
}

async function main() {
  const users = await query(`
    SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
           u.raw_user_meta_data->>'firstname' as meta_first,
           u.raw_user_meta_data->>'name' as meta_name,
           u.raw_user_meta_data->>'lastname' as meta_last,
           p.id as profile_id, p.role as profile_role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    ORDER BY u.email;
  `);
  console.log("ALL AUTH USERS (" + users.length + "):");
  for (const u of users) {
    console.log(`${u.email.padEnd(35)} | profile: ${String(u.profile_id).padEnd(5)} | role: ${String(u.profile_role).padEnd(5)} | name: ${u.meta_first || ''} ${u.meta_last || u.meta_name || ''} | last_login: ${u.last_sign_in_at || 'never'}`);
  }
}

main().catch(console.error);
