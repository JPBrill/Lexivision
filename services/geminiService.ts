
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { WordEntry } from "../types";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

export class GeminiService {
  private get ai() {
    // Strictly use process.env.API_KEY as per the library guidelines.
    // Always initialize new instance to ensure the most up-to-date configuration.
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateProficiencyQuiz(): Promise<QuizQuestion[]> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a 3-question English proficiency quiz. 
      Question 1 should be Beginner level.
      Question 2 should be Intermediate level.
      Question 3 should be Advanced level.
      Format the output as a JSON array of objects with 'question', 'options' (4 choices), 'correctIndex', and 'difficulty'.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctIndex: { type: Type.NUMBER },
              difficulty: { type: Type.STRING },
            },
            required: ["question", "options", "correctIndex", "difficulty"],
          }
        },
      },
    });

    try {
      // Direct access to .text property as per guidelines
      return JSON.parse(response.text || '[]');
    } catch (e) {
      console.error("Failed to generate quiz", e);
      return [];
    }
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

    // Iterate through candidates and parts to find the image part as per guidelines
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
}
