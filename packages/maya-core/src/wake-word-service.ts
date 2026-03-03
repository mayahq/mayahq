/**
 * Wake Word Detection Service
 * Listens for "Hey Maya" using continuous audio processing
 */

import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

export class WakeWordService {
  private wss: WebSocketServer
  private port: number

  constructor(port: number = 3334) {
    this.port = port
    this.wss = new WebSocketServer({ port: this.port })
    this.setupWebSocket()
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Wake word client connected')
      
      ws.on('message', async (audioData) => {
        try {
          // Process audio chunk for wake word detection
          const detected = await this.detectWakeWord(Buffer.from(audioData as ArrayBuffer))
          
          if (detected) {
            ws.send(JSON.stringify({ 
              type: 'wake_word_detected',
              confidence: detected.confidence,
              timestamp: Date.now()
            }))
          }
        } catch (error) {
          console.error('Wake word detection error:', error)
        }
      })
      
      ws.on('close', () => {
        console.log('Wake word client disconnected')
      })
    })
    
    console.log(`🎤 Wake Word Service running on port ${this.port}`)
  }

  private async detectWakeWord(audioBuffer: Buffer): Promise<{ confidence: number } | null> {
    // Simple implementation - you could enhance with:
    // 1. Whisper for transcription
    // 2. String matching for "hey maya"
    // 3. Phonetic similarity scoring
    
    try {
      // Save audio chunk temporarily
      const tempFile = path.join('/tmp', `audio_${Date.now()}.wav`)
      fs.writeFileSync(tempFile, audioBuffer)
      
      // Use ffmpeg to convert to proper format for whisper
      return new Promise((resolve) => {
        const whisper = spawn('whisper', [
          tempFile,
          '--model', 'tiny',
          '--language', 'en',
          '--output_format', 'txt'
        ])
        
        let transcript = ''
        whisper.stdout.on('data', (data) => {
          transcript += data.toString()
        })
        
        whisper.on('close', () => {
          // Clean up temp file
          fs.unlinkSync(tempFile)
          
          // Check for wake word
          const normalized = transcript.toLowerCase().trim()
          if (normalized.includes('hey maya') || normalized.includes('hey mya')) {
            resolve({ confidence: 0.9 })
          } else {
            resolve(null)
          }
        })
      })
    } catch (error) {
      console.error('Error processing wake word:', error)
      return null
    }
  }

  public start() {
    console.log('🎤 Wake Word Service started')
  }

  public stop() {
    this.wss.close()
    console.log('🛑 Wake Word Service stopped')
  }
}

// If running directly
if (require.main === module) {
  const service = new WakeWordService()
  service.start()
  
  process.on('SIGINT', () => service.stop())
  process.on('SIGTERM', () => service.stop())
}