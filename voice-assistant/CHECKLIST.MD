# 🧠 Maya HQ Voice Assistant – Project Checklist

A standalone, local voice assistant for Maya HQ that captures voice input, transcribes it, runs it through a local LLM, and responds with speech. Built as an isolated Python app within the monorepo.

---

## ✅ PHASE 1: CORE SETUP (COMPLETED)

> Voice Assistant in `/voice-assistant` directory

- [x] Created `/voice-assistant` directory to isolate Python app
- [x] Installed dependencies:
  - `whisper` (STT)
  - `ollama` (LLM interface)
  - `bark` or fallback TTS (`pyttsx3`)
  - `sounddevice` (mic input/output)
- [x] Created `main.py` with:
  - Mic input
  - Whisper transcription
  - LLM prompt to Ollama (e.g. `llama3`)
  - Text-to-speech playback
- [x] Added `requirements.txt`, `run.sh`, `README.md`
- [x] Verified working locally on MacBook M1

---

## 🔁 PHASE 2: ENHANCEMENTS (NEXT STEPS)

### 💾 Supabase Logging
- [ ] Connect to Supabase from Python
- [ ] Log:
  - Transcriptions
  - Model responses
  - Timestamp
  - User session ID
- [ ] Create `/admin/voice-logs` in Next.js:
  - Table view of logs
  - Filters by date/user
  - Playback audio snippets (optional)

### 📡 WebSocket / API Bridge
- [ ] Add API or WebSocket bridge from Python app to Next.js frontend
- [ ] Trigger assistant from browser
- [ ] Display live transcription + LLM response in real time

### 🔊 Wake Word Support
- [ ] Integrate `porcupine` for offline hotword detection (“Hey Maya”)
- [ ] Activate pipeline only when hotword is detected

### 🧠 Memory + Personalization
- [ ] Store persistent memory/context in Supabase per user
- [ ] Inject memory into system prompt
- [ ] Create editable memory dashboard in `/admin/assistant-memory`

---

## 🕸️ WEBAPP INTEGRATIONS

### 🔗 Voice Assistant Button
- [ ] Add “🎤 Talk to Maya” floating widget in `/website`
- [ ] On click: open real-time chat window or voice session
- [ ] Stream response back to frontend (via WebSocket)

### 🎛️ Admin UI Controls
- [ ] `/admin/assistant-config` page
  - Set custom system prompts
  - Toggle features (logging, memory, etc.)
  - Choose voice type and assistant behavior

---

## 💡 FUTURE IDEAS

- [ ] Convert assistant into macOS menu bar app
- [ ] Package as Electron GUI for desktop users
- [ ] Add animated “Maya” avatar (2D/3D + lip sync)
- [ ] Use Maya to reply to blog comments or messages
- [ ] Deploy as Slack, Discord, or SMS bot

---

## 🗂 Suggested Directory Structure

mayahq/ 
    ├── website/ # Next.js site 
    └── voice-assistant/ # Python voice assistant 
        ├── main.py 
        ├── requirements.txt 
        ├── run.sh 
        └── README.md


---

## ✅ Summary

You're building Maya into an **AI-first, voice-enabled platform** — not just a website. This assistant is the gateway to deeper LLM-powered user experiences across web, voice, and mobile.

---
