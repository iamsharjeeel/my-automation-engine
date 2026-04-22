import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const SB_URL = "https://zfjalcgtytwvmnatwjqr.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmamFsY2d0eXR3dm1uYXR3anFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxNjE5MywiZXhwIjoyMDkyMzkyMTkzfQ.kNeesQdw9we0doZ4RCTyfViTcILvNETdI517MJHppsQ";
const supabase = createClient(SB_URL, SB_KEY);

export default async function handler(req, res) {
  const { code, state } = req.query; 

  if (!code) return res.status(400).send("No code provided from HighLevel");

  try {
    // 1. Exchange Code for Token
    // We use URLSearchParams to ensure the format is exactly what GHL expects
    const params = new URLSearchParams();
    params.append('client_id', '69e826b405f1a9522b43bdc1-mo9ebr0y');
    params.append('client_secret', '956f362c-0580-42fe-84b0-837a51e05dab');
    params.append('grant_type', 'authorization_code');
    params.append('code', code);

    const response = await axios.post('https://services.leadconnectorhq.com/oauth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, locationId, expires_in } = response.data;

    // 2. SAVE TO DATABASE
    // We use a "Upsert" so if you reconnect the same location, it just updates the token
    const { error: dbError } = await supabase.from('connections').upsert({
      user_id: state, // This MUST be your Supabase User UUID
      app_name: 'highlevel',
      location_id: locationId,
      access_token: access_token,
      refresh_token: refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000)
    }, { onConflict: 'user_id, location_id' });

    if (dbError) {
        return res.status(500).send(`Database Error: ${dbError.message}. State Received: ${state}`);
    }

    res.send("<h1>Success!</h1><p>Location connected. You can close this tab.</p>");

  } catch (err) {
    const errorData = err.response?.data || err.message;
    res.status(500).json({ 
        message: "OAuth Exchange Failed", 
        detail: errorData,
        sent_code: code 
    });
  }
}
// ... (keep the same imports and token exchange logic as before) ...

    if (dbError) {
        return res.status(500).send(`Database Error: ${dbError.message}`);
    }

    // NEW: Instead of just text, send a script to close the window and notify the opener
    res.send(`
      <script>
        if (window.opener) {
          // Send a message back to your AI Studio app
          window.opener.postMessage("ghl-connection-success", "*");
        }
        window.close();
      </script>
      <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
        <h1>Connected!</h1>
        <p>This window will close automatically...</p>
      </div>
    `);
// ... (rest of the error handling) ...
