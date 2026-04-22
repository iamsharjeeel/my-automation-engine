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
