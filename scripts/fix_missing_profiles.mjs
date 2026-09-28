const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_TARGET_REF || 'fdsuyqbscrnityotpmbc';

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  const data = await res.json();
  if (data.message) {
    console.error('SQL Error:', data.message);
  }
  return data;
}

async function main() {
  console.log("1. Fixing sequence on public.profiles...");
  await query(`SELECT setval('public.profiles_id_seq1', GREATEST(COALESCE((SELECT max(id) FROM public.profiles), 1), 116) + 1, false);`);

  console.log("2. Creating trigger on auth.users...");
  await query(`
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.create_profile();
  `);

  console.log("3. Updating RLS policy on public.profiles...");
  await query(`
    DROP POLICY IF EXISTS "Active staff can read profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Users can read own profile and staff can read all" ON public.profiles;
    CREATE POLICY "Users can read own profile and staff can read all"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid() OR public.current_user_is_active_staff());
  `);

  console.log("4. Backfilling missing profiles for existing auth.users...");
  const insertResult = await query(`
    INSERT INTO public.profiles (user_id, email, firstname, name, role)
    SELECT
      u.id as user_id,
      u.email as email,
      COALESCE(u.raw_user_meta_data->>'firstname', 'Agent') as firstname,
      COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'lastname', '') as name,
      3 as role -- Default to Agent role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE p.id IS NULL
    RETURNING id, user_id, email, firstname, name, role;
  `);
  console.log("Inserted profiles count:", insertResult.length || 0);
  console.log("Sample inserted:", JSON.stringify((insertResult || []).slice(0, 5), null, 2));

  console.log("5. Checking Filias profiles specifically...");
  const filias = await query(`
    SELECT p.id, p.user_id, p.email, p.firstname, p.name, p.role
    FROM public.profiles p
    WHERE p.email ILIKE '%fili%' OR p.firstname ILIKE '%fili%' OR p.name ILIKE '%fili%';
  `);
  console.log("Filias profiles in database:", JSON.stringify(filias, null, 2));
}

main().catch(console.error);
