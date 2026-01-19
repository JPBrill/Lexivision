
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { WordEntry } from "../types";

export class GeminiService {
  private get ai() {
    // Create a fresh instance for every call to ensure correct environment key usage
    return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async generateWordOfTheDay(): Promise<Partial<WordEntry>> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Pick an interesting, slightly challenging word for a 'Word of the Day' feature. 
      Provide the word, its phonetics (IPA), its definition, part of speech, and a clear illustrative example.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            phonetics: { type: Type.STRING },
            definition: { type: Type.STRING },
            partOfSpeech: { type: Type.STRING },
            example: { type: Type.STRING },
          },
          required: ["word", "phonetics", "definition", "partOfSpeech", "example"],
        },
      },
    });

    try {
      const data = JSON.parse(response.text || '{}');
      const img = await this.generateImage(data.word, data.definition);
      return { ...data, imageUrl: img };
    } catch (e) {
      console.error("Failed to generate word of the day", e);
      return {};
    }
  }

  async suggestWords(level: string): Promise<string[]> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Suggest 5 interesting and useful words for a student at the ${level} level. 
      Only return a JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    try {
      return JSON.parse(response.text || '[]');
    } catch (e) {
      return ["Resilient", "Eloquent", "Paradigm", "Pragmatic", "Ephemeral"];
    }
  }

  async defineWord(word: string): Promise<Partial<WordEntry>> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Define the word "${word}" for a visual dictionary. Provide the phonetics (IPA), definition, part of speech, and one clear illustrative example.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            phonetics: { type: Type.STRING },
            definition: { type: Type.STRING },
            partOfSpeech: { type: Type.STRING },
            example: { type: Type.STRING },
          },
          required: ["phonetics", "definition", "partOfSpeech", "example"],
        },
      },
    });

    try {
      return JSON.parse(response.text || '{}');
    } catch (e) {
      console.error("Failed to parse definition response", e);
      return {};
    }
  }

  async generateImage(word: string, description: string): Promise<string | null> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: `Create a highly educational, clear, and beautiful visual representation for the word "${word}". The scene should clearly depict the concept of: ${description}. High quality, cinematic lighting, conceptual art style.` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  }

  async editImage(base64Image: string, prompt: string): Promise<string | null> {
    const cleanBase64 = base64Image.split(',')[1] || base64Image;
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/png',
            },
          },
          { text: prompt },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  }

  async animateWithVeo(imageUri: string, prompt: string): Promise<string | null> {
    const base64Data = imageUri.split(',')[1] || imageUri;
    const aiInstance = this.ai;
    
    try {
      let operation = await aiInstance.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt || 'Animate this image subtly to bring it to life.',
        image: {
          imageBytes: base64Data,
          mimeType: 'image/png',
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await aiInstance.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await videoResponse.blob();
        return URL.createObjectURL(blob);
      }
    } catch (e: any) {
      if (e.message?.includes("404") || e.message?.includes("not found")) {
        throw new Error("Video generation is unavailable on the current free tier.");
      }
      throw e;
    }
    return null;
  }
}
