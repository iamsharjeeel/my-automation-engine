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
