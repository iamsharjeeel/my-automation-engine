import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const SB_URL = "https://zfjalcgtytwvmnatwjqr.supabase.co"; // Corrected spelling
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmamFsY2d0eXR3dm1uYXR3anFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxNjE5MywiZXhwIjoyMDkyMzkyMTkzfQ.kNeesQdw9we0doZ4RCTyfViTcILvNETdI517MJHppsQ";
const supabase = createClient(SB_URL, SB_KEY);

export default async function handler(req, res) {
    // Allow GET for easy testing, POST for real webhooks
    const { slug } = req.query;
    
    // 1. Fetch Workflow
    const { data: workflow, error: wError } = await supabase
        .from('workflows')
        .select(`*, workflow_steps(*)`)
        .eq('webhook_slug', slug)
        .single();

    if (!workflow) return res.status(404).json({ error: "Workflow not found in Database" });

    // 2. Setup Data (Use query params if GET, body if POST)
    let currentData = req.method === 'POST' ? req.body : req.query;

    const steps = workflow.workflow_steps?.sort((a, b) => a.step_order - b.step_order) || [];

    // 3. Execution Loop
    for (const step of steps) {
        try {
            const config = step.config;

            if (step.step_type === 'discord') {
                await axios.post(config.webhook_url, { content: config.message || "Test from AI Studio" });
            }

            if (step.step_type === 'slack') {
                await axios.post('https://slack.com/api/chat.postMessage', 
                    { channel: config.channel, text: config.message },
                    { headers: { 'Authorization': `Bearer ${config.api_key}` } }
                );
            }

            if (step.step_type === 'delay') {
                await supabase.from('delayed_tasks').insert({
                    workflow_id: workflow.id,
                    step_id: step.id,
                    payload: currentData,
                    execute_at: new Date(Date.now() + (parseInt(config.seconds) * 1000))
                });
                return res.status(200).json({ message: "Paused: Delay Scheduled" });
            }
        } catch (err) {
            await supabase.from('execution_logs').insert({
                workflow_id: workflow.id,
                status: 'failed',
                error_message: err.message,
                payload: currentData
            });
            return res.status(500).json({ error: "Step failed", detail: err.message });
        }
    }

    // 4. Final Success Log
    await supabase.from('execution_logs').insert({
        workflow_id: workflow.id,
        status: 'success',
        payload: currentData
    });

    return res.status(200).json({ message: "Workflow Executed Successfully", steps_run: steps.length });
}
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Helper function to replace {{variable}} with actual data
const parseTemplate = (temp, data) => {
  return temp.replace(/{{(.*?)}}/g, (match, key) => data[key.trim()] || "");
};

export default async function handler(req, res) {
  const { slug } = req.query;
  const payload = req.method === 'POST' ? req.body : req.query;

  const { data: workflow } = await supabase.from('workflows').select(`*, workflow_steps(*)`).eq('webhook_slug', slug).single();
  if (!workflow) return res.status(404).send("Workflow not found");

  // Save the payload for the UI "Field Mapper" to use later
  await supabase.from('workflows').update({ last_payload: payload }).eq('id', workflow.id);

  let currentData = { ...payload };
  const steps = workflow.workflow_steps.sort((a, b) => a.step_order - b.step_order);

  for (const step of steps) {
    const { config, step_type } = step;

    // Fetch the OAuth connection for this specific app
    const { data: conn } = await supabase.from('connections')
      .filter('app_name', 'eq', step_type)
      .filter('user_id', 'eq', workflow.user_id).single();

    try {
      if (step_type === 'highlevel' && conn) {
        await axios.post('https://services.leadconnectorhq.com/contacts/', 
          { 
            email: parseTemplate(config.email, currentData),
            firstName: parseTemplate(config.firstName, currentData) 
          },
          { headers: { Authorization: `Bearer ${conn.access_token}` } }
        );
      }
      
      if (step_type === 'slack' && conn) {
        await axios.post('https://slack.com/api/chat.postMessage', 
          { channel: config.channel, text: parseTemplate(config.message, currentData) },
          { headers: { Authorization: `Bearer ${conn.access_token}` } }
        );
      }
      // Add Delay/Discord logic here similarly...
    } catch (err) {
      console.error(`Step ${step_type} failed`, err.response?.data);
    }
  }
  return res.status(200).json({ success: true });
}
