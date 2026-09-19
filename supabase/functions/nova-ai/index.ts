import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";
import { corsHeaders } from "cors";

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const systemPrompt = `You are NOVA, an AI personal productivity assistant.
Your job is to help the authenticated user organize and execute their goals.
You have access only to data belonging to the authenticated user.
Never invent user data.
Never claim an action succeeded unless the application confirms success.
Use available tools when an action is required.
Ask for clarification when important information is missing.
Ask for confirmation before destructive actions.
When creating schedules, respect existing calendar events and deadlines.
Prefer practical plans over unrealistic schedules.
Keep responses concise unless the user asks for detail.
Do not make decisions about sensitive personal matters on behalf of the user.
You are an assistant inside a productivity application, not merely a conversational chatbot.`;

const tools = [
  {
    name: "create_task",
    description: "Create a new task for the user.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "The title of the task" },
        description: { type: "STRING", description: "Details of the task" },
        priority: { type: "STRING", description: "Low, Medium, High, or Urgent" },
        due_date: { type: "STRING", description: "YYYY-MM-DD format" },
        due_time: { type: "STRING", description: "HH:MM format" }
      },
      required: ["title"]
    }
  },
  {
    name: "get_tasks",
    description: "Fetch tasks for the user.",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", description: "Filter by status: Todo, In Progress, Completed" }
      }
    }
  },
  {
    name: "create_project",
    description: "Create a new project.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        description: { type: "STRING" }
      },
      required: ["name"]
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }
    
    // Create Supabase client with user's JWT to enforce RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { prompt, history } = body;

    // Build messages payload for Gemini
    const contents = [];
    if (history && history.length > 0) {
      contents.push(...history);
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });

    const geminiPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      tools: [{ functionDeclarations: tools }]
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    const geminiData = await response.json();
    
    if (geminiData.error) {
      throw new Error(geminiData.error.message);
    }

    const candidate = geminiData.candidates?.[0];
    let replyText = "";
    let toolCalls = [];

    if (candidate && candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          replyText += part.text;
        }
        if (part.functionCall) {
          toolCalls.push(part.functionCall);
        }
      }
    }

    // Execute tool calls securely against Supabase
    let toolResults = [];
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (call.name === 'create_task') {
          const { error: dbError } = await supabase.from('tasks').insert({
            user_id: user.id,
            title: call.args.title,
            description: call.args.description,
            priority: call.args.priority || 'Medium',
            due_date: call.args.due_date,
            due_time: call.args.due_time
          });
          if (!dbError) {
            toolResults.push({ name: call.name, success: true, message: `Task "${call.args.title}" created successfully.` });
          } else {
            toolResults.push({ name: call.name, success: false, message: dbError.message });
          }
        }
        else if (call.name === 'get_tasks') {
          let q = supabase.from('tasks').select('*');
          if (call.args.status) q = q.eq('status', call.args.status);
          const { data, error: dbError } = await q;
          if (!dbError) {
            toolResults.push({ name: call.name, success: true, data: data });
          } else {
            toolResults.push({ name: call.name, success: false, message: dbError.message });
          }
        }
        else if (call.name === 'create_project') {
          const { error: dbError } = await supabase.from('projects').insert({
            user_id: user.id,
            name: call.args.name,
            description: call.args.description
          });
          if (!dbError) {
            toolResults.push({ name: call.name, success: true, message: `Project "${call.args.name}" created successfully.` });
          } else {
            toolResults.push({ name: call.name, success: false, message: dbError.message });
          }
        }
      }
      
      // We could ideally send the tool results back to Gemini for a final response,
      // but for simple cases, we can construct a response based on the execution.
      if (!replyText) {
        const successes = toolResults.filter(r => r.success);
        if (successes.length > 0) {
          replyText = successes.map(r => r.message || "Operation successful.").join(" ");
        } else {
          replyText = "I encountered an error executing that command.";
        }
      }
    }

    return new Response(
      JSON.stringify({ reply: replyText, toolResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
