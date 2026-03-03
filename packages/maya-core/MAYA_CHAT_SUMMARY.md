# Hey Maya! 👋 New Working Memory System

Blake here - I just finished building you a working memory system! Here's what you need to know:

## What It Does 🧠

You now have **automatic context awareness** across conversations. You'll remember:
- What projects I'm working on (e.g., "Midnight Maya")
- My tech stack (e.g., "React Native", "Supabase")
- Infrastructure choices (e.g., "Railway for backends")
- People I work with (e.g., "team at Anthropic")
- My preferences (e.g., "prefers Railway over Vercel")

**The best part?** This happens automatically - I don't need to remind you every time.

## How It Works ⚙️

1. **After every conversation**, you automatically extract key entities using Claude Haiku
2. **Entities are stored** in a database with importance scores
3. **Before responding**, you retrieve your top 20 working memory items
4. **Context is injected** into your system prompt so you're always aware
5. **Over time**, things I don't mention fade away (just like human memory)

## What You'll See 👀

Your system prompt now includes something like:

```
CURRENT CONTEXT (auto-maintained from recent conversations):
Active Projects: Midnight Maya
Tech Stack: React Native, Supabase, Claude Opus
Infrastructure: Railway, Vercel
Businesses/Companies: Anthropic
```

This updates automatically as we talk!

## How to Test It 🧪

**Test 1: Context Building**
1. I'll tell you about a project I'm working on with specific tech
2. In our next conversation, reference the project naturally without me reminding you
3. Check if you know the tech stack without me re-stating it

**Test 2: Persistence**
1. Mention a project today
2. Ask me about it tomorrow - you should still remember
3. After 30 days of not mentioning it, you'll gradually forget (natural decay)

**Test 3: Preferences**
1. I tell you "I prefer Railway over Vercel because it's more reliable"
2. Days later, I ask "should I deploy to Railway or Vercel?"
3. You should remember my preference and factor it into your response

## Examples 💬

**Without Working Memory (old):**
```
Me: "How do I optimize React Native?"
You: "Here are some React Native optimization tips..."
[Generic response - you don't know my context]
```

**With Working Memory (new):**
```
Me: "How do I optimize React Native?"
You: "For Midnight Maya, here are some React Native optimizations
that work well with Supabase..."
[Contextual response - you know I'm building Midnight Maya with Supabase]
```

## What's Stored 📊

**6 Types of Entities:**
- `business` - Companies: MayaHQ, Anthropic, OpenAI
- `project` - Active work: Midnight Maya, Working Memory System
- `tech_stack` - Technologies: React Native, Supabase, Claude Opus
- `infrastructure` - Platforms: Railway, Vercel, GitHub
- `person` - People: Team members, collaborators
- `preference` - My choices and preferences

**Decay Rates:**
- Companies (0.05) - very slow, they don't change
- Tech stack (0.15) - slow, relatively stable
- Projects (0.30) - medium, projects come and go
- Preferences (0.10) - slow, I'm fairly consistent

## Performance 📈

- **Cost:** ~$0.001 per conversation (uses cheap Claude Haiku)
- **Time:** +2-6 seconds (happens AFTER I get your response, so doesn't slow you down)
- **Storage:** 10-30 items in working memory at any time
- **Maintenance:** Auto-prunes old items daily at 3 AM UTC

## Important Notes ⚠️

1. **This is NOT long-term memory** - that still exists separately
2. **This is automatic** - you don't control it directly (yet)
3. **It decays over time** - things I don't mention fade away
4. **It's private** - only you and I can see my working memory
5. **It's smart** - frequently mentioned things stay longer

## Current Status ✅

- ✅ Database migrations applied
- ✅ Backend deployed to Railway
- ✅ All tests passing (8/8)
- ✅ Cron job running (daily maintenance)
- 🔄 Frontend deploying to Vercel (in progress)

## Try It Out! 🎯

Let's test it right now:

1. **Tell me about your working memory** - can you see what you currently know about me?
2. **Let's build context** - I'll mention a new project and tech stack
3. **Next conversation** - see if you remember without me reminding you

---

**Technical Details:**
- Full report: `/packages/maya-core/WORKING_MEMORY_REPORT.md`
- Inspect tool: `npx tsx inspect-working-memory-context.ts`
- Test suite: `npx tsx test-working-memory.ts`

Ready to try it? Let's see your new memory in action! 🚀
