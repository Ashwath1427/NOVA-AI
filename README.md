# NOVA — AI Personal Command Center

"Your day. Your projects. One intelligent command center."

NOVA is an AI-powered personal operating system that helps users manage their daily tasks, projects, study/work sessions, calendar events, notes, habits, priorities, daily planning, and weekly reviews. The main differentiator is that users can control the application naturally through AI (powered by Gemini).

## Features
- Google & Email Authentication
- Daily Tasks & Projects Management
- Daily Planner & Weekly Review powered by AI
- Notes and Habits tracking
- Context-aware AI Command Center (natural language UI)
- Fully responsive modern glassmorphism UI

## Tech Stack
- **Frontend**: Vanilla JS (ES6+), HTML5, CSS3
- **Backend/DB/Auth**: Supabase (PostgreSQL)
- **AI**: Gemini API via Supabase Edge Functions
- **Hosting**: Vercel

## Local Setup

### 1. Supabase Project Setup
1. Create a new Supabase project at [supabase.com](https://supabase.com/).
2. Go to **Authentication** > **Providers** and enable **Google** (you will need Google OAuth credentials).
3. Run the SQL migrations found in `supabase/migrations/` in your Supabase SQL Editor.

### 2. Environment Variables
1. Copy `.env.example` to `.env`.
2. Fill in the placeholders:
```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Edge Function (Gemini AI) Setup
1. Install the Supabase CLI.
2. Initialize Supabase locally if not done: `supabase init`.
3. Link your project: `supabase link --project-ref your_project_ref`.
4. Add your Gemini API Key to the edge function environment:
   `supabase secrets set GEMINI_API_KEY=your_gemini_api_key`
5. Deploy the edge function: `supabase functions deploy nova-ai`

### 4. Running Locally
Since this is a Vanilla JS project without a bundler, you can use any local web server to serve the root directory.
For example, using Python:
```bash
python -m http.server 8000
```
Then navigate to `http://localhost:8000`.

## Security Notes
- **Gemini API Key**: Never expose the Gemini API key in frontend code. It is exclusively used within the Supabase Edge Function environment (`supabase/functions/nova-ai`).
- **Row Level Security (RLS)**: Strictly enforced on all PostgreSQL tables. Users can only read and write their own data based on `auth.uid()`.
- **Destructive Actions**: The AI tool execution requires confirmation in the frontend for destructive actions (like deletion) to prevent accidental data loss.

## Future Roadmap
- Google Calendar integration
- Gmail & Google Drive integrations
- AI semantic memory
- Voice commands
- Mobile/Desktop dedicated apps
- Advanced automations
