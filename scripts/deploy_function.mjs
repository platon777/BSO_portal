const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_TARGET_REF || 'fdsuyqbscrnityotpmbc';

const functionBody = `
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé: en-tête Authorization manquant' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwtToken = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwtToken);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if caller is Admin (role 1) or Manager (role 2)
    const { data: profile, error: profError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profError || !profile || ![1, 2].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Accès refusé: seuls les administrateurs et managers peuvent générer des liens.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, redirectTo, sendEmail } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Adresse email requise' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. If sendEmail is requested, trigger Supabase Auth reset email
    if (sendEmail) {
      const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo || undefined,
      });
      if (resetErr) {
        return new Response(JSON.stringify({ error: resetErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, message: 'Email de réinitialisation envoyé avec succès à ' + email }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Otherwise generate the recovery link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: redirectTo || undefined,
      },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const actionLink = data.properties?.action_link || data.action_link;
    const emailOtp = data.properties?.email_otp || data.email_otp;

    return new Response(JSON.stringify({
      success: true,
      action_link: actionLink,
      email_otp: emailOtp,
      user_id: data.user?.id,
      email: data.user?.email,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Erreur interne du serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
`;

async function deploy() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/admin-reset-password`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      body: functionBody,
      verify_jwt: false,
    }),
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.text());

  setTimeout(async () => {
    const testRes = await fetch(`https://${ref}.supabase.co/functions/v1/admin-reset-password`, {
      method: 'OPTIONS',
    });
    console.log('OPTIONS Test Status:', testRes.status, await testRes.text());
  }, 2500);
}

deploy().catch(console.error);
