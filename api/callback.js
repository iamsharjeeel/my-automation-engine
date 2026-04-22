import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { code, state } = req.query; 

  if (!code) return res.status(400).send("No code provided from HighLevel");

  try {
    // 1. Exchange Code for Token
    const params = new URLSearchParams();
    params.append('client_id', process.env.GHL_CLIENT_ID);
    params.append('client_secret', process.env.GHL_CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);

    const response = await axios.post('https://services.leadconnectorhq.com/oauth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, locationId, expires_in } = response.data;

    // 2. Save to Database (Link to the user via 'state')
    const { error: dbError } = await supabase.from('connections').upsert({
      user_id: state, 
      app_name: 'highlevel',
      location_id: locationId,
      access_token: access_token,
      refresh_token: refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000)
    }, { onConflict: 'user_id, location_id' });

    if (dbError) throw new Error(dbError.message);

    // 3. Branded Success UI with Auto-Close
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
          <div class="text-center p-8 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl">
            <div class="mb-4 text-green-400 text-5xl">✓</div>
            <h1 class="text-2xl font-bold mb-2">HighLevel Connected!</h1>
            <p class="text-slate-400">Location ID: <span class="text-indigo-400 font-mono text-sm">${locationId}</span></p>
            <p class="mt-6 text-xs text-slate-500 italic text-center">Closing in 3 seconds...</p>
          </div>
        </body>
      </html>
    `);

  } catch (err) {
    res.status(500).json({ error: "OAuth Failed", detail: err.response?.data || err.message });
  }
}
