import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { code, state } = req.query; // 'state' tells us if it's slack or ghl
  
  // Logic to exchange 'code' for 'access_token' based on the app
  // This is a generic placeholder; we will specialize this once you provide Client IDs
  try {
    const tokenResponse = await axios.post('https://services.leadconnectorhq.com/oauth/token', {
       client_id: process.env.GHL_CLIENT_ID,
       client_secret: process.env.GHL_CLIENT_SECRET,
       code: code,
       grant_type: 'authorization_code'
    });

    await supabase.from('connections').insert({
      app_name: 'highlevel',
      access_token: tokenResponse.data.access_token,
      refresh_token: tokenResponse.data.refresh_token
    });

    res.send("Connection Successful! You can close this window.");
  } catch (err) {
    res.status(500).json(err.response.data);
  }
}
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  "https://zfjalcgtytwvmnatwjqr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmamFsY2d0eXR3dm1uYXR3anFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxNjE5MywiZXhwIjoyMDkyMzkyMTkzfQ.kNeesQdw9we0doZ4RCTyfViTcILvNETdI517MJHppsQ"
);

export default async function handler(req, res) {
  const { code, state } = req.query; // 'state' will carry our user_id

  try {
    // 1. Exchange Code for Access Token
    const params = new URLSearchParams();
    params.append('client_id', '69e826b405f1a9522b43bdc1-mo9ebr0y');
    params.append('client_secret', '956f362c-0580-42fe-84b0-837a51e05dab');
    params.append('grant_type', 'authorization_code');
    params.append('code', code);

    const response = await axios.post('https://services.leadconnectorhq.com/oauth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // 2. Save the connection to Supabase
    // We store the locationId so we know WHICH subaccount to push data to.
    const { error } = await supabase.from('connections').insert([{
      user_id: state, // This comes back from the OAuth 'state' parameter
      app_name: 'highlevel',
      location_id: response.data.locationId,
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: new Date(Date.now() + response.data.expires_in * 1000)
    }]);

    if (error) throw error;

    res.send(`
      <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
        <h1>Successfully Connected!</h1>
        <p>Your HighLevel Subaccount (ID: ${response.data.locationId}) is now linked.</p>
        <p>You can close this window and return to the app.</p>
      </div>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to exchange token", details: err.response?.data || err.message });
  }
}
