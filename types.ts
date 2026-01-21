
export interface WordEntry {
  id: string;
  word: string;
  phonetics: string;
  definition: string;
  partOfSpeech: string;
  example: string;
  imageUrl: string | null;
  listId: string;
  createdAt: number;
  overlay?: {
    text: string;
    color: string;
    font: string;
    position: { x: number; y: number };
  };
}

export interface WordList {
  id: string;
  name: string;
  wordIds: string[];
}

export interface TranscriptionItem {
  text: string;
  isUser: boolean;
  id: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  level?: 'Beginner' | 'Intermediate' | 'Advanced';
}

export enum AppView {
  ONBOARDING = 'ONBOARDING',
  DICTIONARY = 'DICTIONARY',
  LISTS = 'LISTS',
  PRACTICE = 'PRACTICE',
  EDITOR = 'EDITOR'
}
