import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const parseTemplate = (temp, data) => {
  if (typeof temp !== 'string') return temp;
  return temp.replace(/{{(.*?)}}/g, (match, key) => data[key.trim()] || "");
};

export default async function handler(req, res) {
  const { slug } = req.query;
  const payload = req.method === 'POST' ? req.body : req.query;

  // 1. Fetch Workflow
  const { data: workflow } = await supabase.from('workflows').select(`*, workflow_steps(*)`).eq('webhook_slug', slug).single();
  if (!workflow) return res.status(404).send("Workflow not found");

  // 2. Store payload for UI mapping
  await supabase.from('workflows').update({ last_payload: payload }).eq('id', workflow.id);

  let currentData = { ...payload };
  const steps = workflow.workflow_steps.sort((a, b) => a.step_order - b.step_order);

  for (const step of steps) {
    const { config, step_type } = step;

    try {
      // HIGHLEVEL ACTION (Create/Update Contact)
      if (step_type === 'highlevel') {
        const { data: conn } = await supabase.from('connections')
          .eq('app_name', 'highlevel').eq('user_id', workflow.user_id).eq('location_id', config.location_id).single();
        
        if (conn) {
          let contactData = {};
          // Map all fields dynamically from the config.mappings object
          for (const [ghlField, template] of Object.entries(config.mappings || {})) {
            contactData[ghlField] = parseTemplate(template, currentData);
          }
          
          await axios.post('https://services.leadconnectorhq.com/contacts/', contactData, {
            headers: { 'Authorization': `Bearer ${conn.access_token}`, 'Version': '2021-07-28' }
          });
        }
      }

      // DISCORD ACTION
      if (step_type === 'discord') {
        await axios.post(config.webhook_url, { content: parseTemplate(config.message, currentData) });
      }

      // SLACK ACTION
      if (step_type === 'slack') {
        const { data: sConn } = await supabase.from('connections').eq('app_name', 'slack').eq('user_id', workflow.user_id).single();
        if (sConn) {
          await axios.post('https://slack.com/api/chat.postMessage', 
            { channel: config.channel, text: parseTemplate(config.message, currentData) },
            { headers: { Authorization: `Bearer ${sConn.access_token}` } }
          );
        }
      }

      // DELAY LOGIC
      if (step_type === 'delay') {
        await supabase.from('delayed_tasks').insert({
          workflow_id: workflow.id,
          step_id: step.id,
          payload: currentData,
          execute_at: new Date(Date.now() + (parseInt(config.seconds) * 1000))
        });
        return res.status(200).json({ status: "Paused for Delay" });
      }

    } catch (err) {
      await supabase.from('execution_logs').insert({ workflow_id: workflow.id, status: 'failed', error_message: err.message, payload: currentData });
      return res.status(500).json({ error: `${step_type} step failed`, detail: err.response?.data || err.message });
    }
  }

  await supabase.from('execution_logs').insert({ workflow_id: workflow.id, status: 'success', payload: currentData });
  return res.status(200).json({ success: true });
}
