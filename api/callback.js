import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { code, state } = req.query; 

  if (!code) return res.status(400).send("No code provided");

  try {
    // 1. Exchange Code for Token using native fetch
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

    if (!response.ok) {
        return res.status(500).json({ error: "GHL Exchange Failed", detail: data });
    }

    // 2. Save to Database
    const { error: dbError } = await supabase.from('connections').upsert({
      user_id: state, 
      app_name: 'highlevel',
      location_id: data.locationId,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000)
    }, { onConflict: 'user_id, location_id' });

    if (dbError) throw new Error(dbError.message);

    // 3. Branded Success UI
    res.send(`
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            setTimeout(() => {
              if (window.opener) { window.opener.postMessage("ghl-connection-success", "*"); }
              window.close();
            }, 3000);
          </script>
        </head>
        <body class="bg-slate-900 text-white flex items-center justify-center h-screen font-sans">
          <div class="text-center p-10 bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl">
            <div class="mb-4 text-indigo-500 text-6xl font-bold">GHL</div>
            <h1 class="text-2xl font-bold mb-2 text-green-400">Successfully Connected!</h1>
            <p class="text-slate-400">Account ID: <span class="font-mono text-sm text-indigo-300">${data.locationId}</span></p>
            <div class="mt-8 flex items-center justify-center gap-2">
              <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <p class="text-xs text-slate-500">Syncing with your dashboard...</p>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (err) {
    res.status(500).json({ error: "Server Error", detail: err.message });
  }
}
