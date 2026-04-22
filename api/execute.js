import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// Your Private Credentials
const SB_URL = "https://zfjalcgtytwvmnatwjqr.supbase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmamFsY2d0eXR3dm1uYXR3anFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxNjE5MywiZXhwIjoyMDkyMzkyMTkzfQ.kNeesQdw9we0doZ4RCTyfViTcILvNETdI517MJHppsQ";
const supabase = createClient(SB_URL, SB_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { slug } = req.query; // The URL will look like /api/execute?slug=123
    
    // 1. Fetch the workflow and its steps
    const { data: workflow, error } = await supabase
        .from('workflows')
        .select(`*, workflow_steps(*)`)
        .eq('webhook_slug', slug)
        .single();

    if (!workflow) return res.status(404).json({ error: "Workflow not found" });

    // Sort steps by order
    const steps = workflow.workflow_steps.sort((a, b) => a.step_order - b.step_order);
    let currentData = req.body; // Data coming in from the webhook

    // 2. Loop through steps
    for (const step of steps) {
        try {
            // --- DELAY LOGIC ---
            if (step.step_type === 'delay') {
                await supabase.from('delayed_tasks').insert({
                    step_id: step.id,
                    payload: currentData,
                    execute_at: new Date(Date.now() + (step.config.delay_seconds * 1000))
                });
                return res.status(200).json({ status: "Workflow paused: Task Scheduled" });
            }

            // --- DISCORD ACTION ---
            if (step.step_type === 'discord') {
                await axios.post(step.config.webhook_url, { content: step.config.message });
            }

            // --- SLACK ACTION ---
            if (step.step_type === 'slack') {
                await axios.post('https://slack.com/api/chat.postMessage', 
                { channel: step.config.channel, text: step.config.message },
                { headers: { 'Authorization': `Bearer ${step.config.api_key}` } });
            }

            // --- WEBHOOK (OUTBOUND) ---
            if (step.step_type === 'webhook_out') {
                const response = await axios.post(step.config.url, currentData);
                currentData = response.data; // Pass the response to the next step
            }

        } catch (err) {
            // Log the error to Supabase so you can see it in AI Studio
            await supabase.from('execution_logs').insert({
                workflow_id: workflow.id,
                status: 'failed',
                error_message: err.message,
                payload: currentData
            });
            return res.status(500).json({ error: "Step failed", detail: err.message });
        }
    }

    // 3. Success Log
    await supabase.from('execution_logs').insert({
        workflow_id: workflow.id,
        status: 'success',
        payload: currentData
    });

    return res.status(200).json({ message: "Workflow Complete" });
}
