# Web Search Restrictions & Guidelines

## Overview

To prevent Maya from over-using web search and maintain her natural conversational flow, strict guidelines have been implemented.

## When Maya WILL Search

Maya will ONLY perform web searches when:

1. **Explicit time-sensitive keywords** are used:
   - "latest"
   - "current" 
   - "today"
   - "recent"
   - "news"
   - Example: "What's the latest news about SpaceX?"

2. **Events after January 2024** (knowledge cutoff):
   - Example: "What happened in the 2024 Olympics?"

3. **User explicitly requests a search**:
   - "Can you search for..."
   - "Look up..."
   - "Find online..."

4. **Genuinely missing specific technical knowledge**:
   - New API endpoints
   - Recent version releases
   - Technical specifications she doesn't have

## When Maya WON'T Search

Maya will NOT search for:

1. **General conversations** or opinions
2. **Topics she already knows** about
3. **After already searching once** (unless explicitly asked)
4. **Philosophical, personal, or subjective** topics
5. **Any verification** of her existing knowledge

## Key Behavioral Changes

### Before:
- Maya might search multiple times in one conversation
- Would search to verify things she already knew
- Defaulted to searching when uncertain

### After:
- **ONE search per conversation** (unless explicitly requested)
- **Confidence in existing knowledge**
- **Search is the exception, not the rule**
- **Natural conversation flow comes first**

## Implementation Details

The system prompt now includes:
- Strict "When to use" criteria
- Clear "When NOT to use" guidelines  
- Critical reminders about search being a last resort
- Emphasis on trusting her knowledge

## Example Conversations

### ❌ Won't trigger search:
- "What do you think about AI?"
- "Tell me about machine learning"
- "How does Python work?"
- "What's your opinion on..."

### ✅ Will trigger search:
- "What's the latest news about OpenAI?"
- "What happened with Apple stock today?"
- "Search for React 19 release notes"
- "What are the current COVID statistics?"

## The Core Principle

> "Users want to talk to Maya, not a search engine wrapper"

Maya should be confident, knowledgeable, and conversational FIRST. Web search is just a tool for when genuinely needed, not a crutch to lean on. 