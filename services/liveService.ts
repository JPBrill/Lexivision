
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const closeSessionDeclaration: FunctionDeclaration = {
  name: 'closePracticeSession',
  parameters: {
    type: Type.OBJECT,
    description: 'Call this function to exit or end the practice session.',
    properties: {
      reason: {
        type: Type.STRING,
        description: 'The reason for closing.',
      }
    },
    required: ['reason'],
  },
};

export class LiveSessionManager {
  private get ai() {
    // Strictly use process.env.API_KEY as per the library guidelines.
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private session: any = null;
  private isModelSpeaking = false;

  async start(
    word: string, 
    mode: 'conversation' | 'pronunciation',
    onTranscription: (text: string, isUser: boolean, isFinal: boolean) => void,
    onVolume: (volume: number) => void,
    onStatusChange: (isListening: boolean) => void,
    onCloseRequest: () => void
  ) {
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    await this.inputAudioContext.resume();
    await this.outputAudioContext.resume();
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const systemInstruction = mode === 'conversation' 
      ? `You are a warm, supportive language tutor. The user is learning the word "${word}". 
         YOUR ROLE:
         - Engage in a natural, open-ended conversation.
         - Do NOT "test" the user. Instead, elicit the use of "${word}" by talking about topics where it naturally fits.
         - Assist the user: if they hesitate or use the word incorrectly, gently help them.
         - When the user has demonstrated a natural and confident understanding of "${word}" (roughly 80% proficiency), say: "Great job! You've mastered this task and can move on to the next word."
         - If the user wants to stop, call the 'closePracticeSession' function.`
      : `You are a patient and helpful Pronunciation Coach. The user is learning "${word}".
         YOUR ROLE:
         - Say the word clearly and have a conversation where the user repeats it or uses it.
         - Offer specific, friendly tips.
         - When their pronunciation is roughly 80% accurate, say: "Flawless delivery! You've mastered this task and can move on to the next word."
         - If the user wants to stop, call the 'closePracticeSession' function.`;

    const sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          const source = this.inputAudioContext!.createMediaStreamSource(stream);
          const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
          
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
            const volume = Math.sqrt(sum / inputData.length);
            onVolume(volume);

            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            const dataBase64 = encode(new Uint8Array(int16.buffer));
            
            // Critical: Only send data after sessionPromise resolves to avoid race conditions.
            sessionPromise.then((s) => {
              s.sendRealtimeInput({
                media: { data: dataBase64, mimeType: 'audio/pcm;rate=16000' }
              });
            });
          };

          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              if (fc.name === 'closePracticeSession') {
                onCloseRequest();
                // Matching the correct response structure: functionResponses is an object.
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } }
                }));
              }
            }
          }

          const modelTurn = message.serverContent?.modelTurn;
          if (modelTurn?.parts) {
            for (const part of modelTurn.parts) {
              if (part.inlineData?.data) {
                this.isModelSpeaking = true;
                onStatusChange(false);
                const base64Audio = part.inlineData.data;
                this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext!.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), this.outputAudioContext!, 24000, 1);
                const source = this.outputAudioContext!.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.outputAudioContext!.destination);
                source.addEventListener('ended', () => {
                  this.sources.delete(source);
                  if (this.sources.size === 0) {
                    this.isModelSpeaking = false;
                    onStatusChange(true);
                  }
                });
                source.start(this.nextStartTime);
                // Correct audio scheduling: nextStartTime = nextStartTime + audioBuffer.duration
                this.nextStartTime = this.nextStartTime + audioBuffer.duration;
                this.sources.add(source);
              }
            }
          }

          if (message.serverContent?.interrupted) {
            this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
            this.sources.clear();
            this.nextStartTime = 0;
            this.isModelSpeaking = false;
            onStatusChange(true);
          }
        },
        onerror: (e) => {
          console.error('Live session error', e);
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        tools: [{ functionDeclarations: [closeSessionDeclaration] }],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: systemInstruction,
      },
    });

    this.session = await sessionPromise;
  }

  stop() {
    if (this.session) { try { this.session.close(); } catch(e) {} }
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources.clear();
    if (this.inputAudioContext) this.inputAudioContext.close();
    if (this.outputAudioContext) this.outputAudioContext.close();
  }
}
