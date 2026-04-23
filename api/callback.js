import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { code, state } = req.query; 
  if (!code || !state) return res.status(400).send("Missing code or state");

  try {
    // 1. Exchange Token
    const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: "GHL Error", data });

    // 2. Save to DB (Using state as user_id)
    const { error: dbError } = await supabase.from('connections').upsert({
      user_id: state, 
      app_name: 'highlevel',
      location_id: data.locationId,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000)
    }, { onConflict: 'user_id, location_id' });

    if (dbError) throw new Error(dbError.message);

    // 3. Success UI & Message to Opener
    res.send(`
      <html>
        <head><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-900 text-white flex items-center justify-center h-screen">
          <div class="text-center p-10 bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl">
            <h1 class="text-2xl font-bold text-green-400">Successfully Connected!</h1>
            <p class="text-slate-400 mt-2">Location ID: ${data.locationId}</p>
            <script>
              setTimeout(() => {
                if (window.opener) window.opener.postMessage("ghl-connection-success", "*");
                window.close();
              }, 2500);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).json({ error: "Supabase Save Failed", details: err.message });
  }
}
