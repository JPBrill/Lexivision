
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

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

export class LiveSessionManager {
  private get ai() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private session: any = null;
  private currentInput = '';
  private currentOutput = '';

  async start(
    word: string, 
    mode: 'conversation' | 'pronunciation',
    onTranscription: (text: string, isUser: boolean, isFinal: boolean) => void
  ) {
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const systemInstruction = mode === 'conversation' 
      ? `You are a helpful and encouraging language tutor. The user has selected the word "${word}". 

        CRITICAL: YOU MUST INITIATE THE CONVERSATION. Do not wait for the user to speak. 
        As soon as the session starts, greet the user warmly and introduce the word "${word}". 
        Ask them if they've heard of it or if they can try to describe what it means to them.

        STRICT RULE: Wait for exactly 1 second of silence after the user finishes speaking before you respond. Never interrupt.
        
        Focus on helping them use "${word}" in context. If they make a mistake, gently correct them and offer praise when they succeed.`
      : `You are a professional Pronunciation Expert and Linguist. The user is here to master the word "${word}".

        CRITICAL: YOU MUST INITIATE THE SESSION. Do not wait for the user. 
        Open the session by greeting the user and clearly stating the word "${word}" with perfect pronunciation. 
        Then, invite the user to try saying it for you.

        STRICT RULE: Wait for exactly 1 second of silence after the user finishes speaking before you respond. Never interrupt.

        DIAGNOSTIC ROLE: Listen intently to their pronunciation. If they mispronounce a vowel, stress the wrong syllable, or stumble on a consonant, YOU MUST provide specific, detailed phonetic correction. 
        Compare their attempt to the correct sounds. Ask them to repeat specific parts of the word if necessary. Be a rigorous but encouraging coach.`;

    const sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          const source = this.inputAudioContext!.createMediaStreamSource(stream);
          const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const l = inputData.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) {
              int16[i] = inputData[i] * 32768;
            }
            const pcmBlob = {
              data: encode(new Uint8Array(int16.buffer)),
              mimeType: 'audio/pcm;rate=16000',
            };
            sessionPromise.then((s) => s.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext!.destination);

          // Nudge the model to start if it doesn't do so automatically based on instruction
          // We can't send a text part directly in some versions of the Live API via sendRealtimeInput,
          // but the system instruction above is explicitly set to make the model the initiator.
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.outputTranscription) {
            this.currentOutput += message.serverContent.outputTranscription.text;
            onTranscription(this.currentOutput, false, false);
          } else if (message.serverContent?.inputTranscription) {
            this.currentInput += message.serverContent.inputTranscription.text;
            onTranscription(this.currentInput, true, false);
          }

          if (message.serverContent?.turnComplete) {
            if (this.currentInput) onTranscription(this.currentInput, true, true);
            if (this.currentOutput) onTranscription(this.currentOutput, false, true);
            this.currentInput = '';
            this.currentOutput = '';
          }

          const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio) {
            this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext!.currentTime);
            const audioBuffer = await decodeAudioData(decode(base64Audio), this.outputAudioContext!, 24000, 1);
            const source = this.outputAudioContext!.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputAudioContext!.destination);
            source.addEventListener('ended', () => this.sources.delete(source));
            
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
            this.sources.add(source);
          }

          if (message.serverContent?.interrupted) {
            this.sources.forEach(s => s.stop());
            this.sources.clear();
            this.nextStartTime = 0;
            this.currentInput = '';
            this.currentOutput = '';
          }
        },
        onerror: (e) => console.error('Live session error', e),
        onclose: () => console.log('Live session closed'),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: systemInstruction,
      },
    });

    this.session = await sessionPromise;
  }

  stop() {
    if (this.session) {
      this.session.close();
    }
    this.sources.forEach(s => s.stop());
    this.sources.clear();
    if (this.inputAudioContext) this.inputAudioContext.close();
    if (this.outputAudioContext) this.outputAudioContext.close();
  }
}
