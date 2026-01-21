
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, BookOpen, List, Mic2, Sparkles, 
  Trash2, Image as ImageIcon, Wand2, Send, 
  X, MessageSquare, ArrowLeft, Volume2,
  Plus, LogOut, User as UserIcon, Share2, Copy, Check,
  Type as TypeIcon, Palette, Move, Activity, Loader2, BookmarkPlus, ChevronDown,
  Mic, Award, BrainCircuit, CheckCircle2, ChevronRight
} from 'lucide-react';
import { WordEntry, WordList, AppView, TranscriptionItem, User } from './types';
import { GeminiService, QuizQuestion } from './services/geminiService';
import { LiveSessionManager } from './services/liveService';

const PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&q=80&w=1000";
const STORAGE_KEYS = {
  USER: 'lexivision_user_v1',
  WORDS_PREFIX: 'lexivision_words_v1_',
  LISTS_PREFIX: 'lexivision_lists_v1_'
};

const gemini = new GeminiService();
const liveManager = new LiveSessionManager();

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>(AppView.DICTIONARY);
  const [activeWord, setActiveWord] = useState<WordEntry | null>(null);
  // Fixed syntax error: Completed wordLists initialization.
  const [wordLists, setWordLists] = useState<WordList[]>([
    { id: 'default', name: 'My Dictionary', wordIds: [] }
  ]);
  const [words, setWords] = useState<Record<string, WordEntry>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isDefining, setIsDefining] = useState(false);
  const [isPracticing, setIsPracticing] = useState(false);
  const [practiceMode, setPracticeMode] = useState<'conversation' | 'pronunciation'>('conversation');
  const [wordOfTheDay, setWordOfTheDay] = useState<Partial<WordEntry> | null>(null);
  const [isLoadingWOD, setIsLoadingWOD] = useState(false);

  // Persistence Load
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      setView(AppView.ONBOARDING);
    }

    const savedLists = localStorage.getItem(STORAGE_KEYS.LISTS_PREFIX);
    if (savedLists) setWordLists(JSON.parse(savedLists));

    const savedWords = localStorage.getItem(STORAGE_KEYS.WORDS_PREFIX);
    if (savedWords) setWords(JSON.parse(savedWords));

    fetchWordOfTheDay();
  }, []);

  // Persistence Save
  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.LISTS_PREFIX, JSON.stringify(wordLists));
    localStorage.setItem(STORAGE_KEYS.WORDS_PREFIX, JSON.stringify(words));
  }, [user, wordLists, words]);

  const fetchWordOfTheDay = async () => {
    setIsLoadingWOD(true);
    const wod = await gemini.generateWordOfTheDay();
    setWordOfTheDay(wod);
    setIsLoadingWOD(false);
  };

  const handleDefine = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsDefining(true);
    const result = await gemini.defineWord(searchQuery);
    if (result.definition) {
      const img = await gemini.generateImage(searchQuery, result.definition);
      const newWord: WordEntry = {
        id: Date.now().toString(),
        word: searchQuery,
        phonetics: result.phonetics || '',
        definition: result.definition,
        partOfSpeech: result.partOfSpeech || 'noun',
        example: result.example || '',
        imageUrl: img,
        listId: 'default',
        createdAt: Date.now()
      };
      setWords(prev => ({ ...prev, [newWord.id]: newWord }));
      setWordLists(prev => prev.map(l => l.id === 'default' ? { ...l, wordIds: [newWord.id, ...l.wordIds] } : l));
      setActiveWord(newWord);
    }
    setSearchQuery('');
    setIsDefining(false);
  };

  const startPractice = (mode: 'conversation' | 'pronunciation') => {
    if (!activeWord) return;
    setPracticeMode(mode);
    setIsPracticing(true);
    liveManager.start(
      activeWord.word,
      mode,
      (text, isUser) => { /* Transcription logic */ },
      (vol) => { /* Volume visualization logic */ },
      (listening) => { /* Listening status logic */ },
      () => setIsPracticing(false)
    );
  };

  const stopPractice = () => {
    liveManager.stop();
    setIsPracticing(false);
  };

  const renderOnboarding = () => {
    return (
      <div className="max-w-md mx-auto p-8 bg-white rounded-2xl shadow-xl mt-20">
        <h2 className="text-2xl font-bold mb-2">Welcome to LexiVision</h2>
        <p className="text-slate-500 mb-8">Begin your visual dictionary journey.</p>
        <button 
          onClick={() => {
            setUser({ id: 'user-1', email: 'user@example.com', name: 'Learner', level: 'Intermediate' });
            setView(AppView.DICTIONARY);
          }}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
        >
          Start Exploring
        </button>
      </div>
    );
  };

  const renderDictionary = () => {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <form onSubmit={handleDefine} className="relative">
          <input 
            type="text" 
            placeholder="Search for a word..." 
            className="w-full h-16 pl-14 pr-32 rounded-2xl bg-white border border-slate-200 shadow-sm text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
          <button 
            type="submit" 
            disabled={isDefining}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 px-6 bg-indigo-600 text-white rounded-xl font-medium"
          >
            {isDefining ? <Loader2 className="animate-spin" /> : 'Define'}
          </button>
        </form>

        {activeWord ? (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="relative aspect-video">
              <img src={activeWord.imageUrl || PLACEHOLDER_IMG} className="w-full h-full object-cover" alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-6 left-8 text-white">
                <h2 className="text-4xl font-bold capitalize mb-1">{activeWord.word}</h2>
                <p className="text-xl opacity-80">{activeWord.phonetics}</p>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Definition</h3>
                <p className="text-xl text-slate-700">{activeWord.definition}</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => startPractice('conversation')} className="flex-1 h-14 bg-indigo-50 text-indigo-700 rounded-2xl font-bold flex items-center justify-center gap-2">
                  <BrainCircuit className="w-5 h-5" /> Practice
                </button>
                <button onClick={() => startPractice('pronunciation')} className="flex-1 h-14 bg-emerald-50 text-emerald-700 rounded-2xl font-bold flex items-center justify-center gap-2">
                  <Mic2 className="w-5 h-5" /> Pronounce
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {wordLists[0].wordIds.map(id => (
              <button key={id} onClick={() => setActiveWord(words[id])} className="bg-white p-4 rounded-2xl border border-slate-200 text-left hover:border-indigo-500 transition-all">
                <img src={words[id]?.imageUrl || PLACEHOLDER_IMG} className="aspect-square rounded-xl object-cover mb-4" alt="" />
                <h4 className="font-bold capitalize">{words[id]?.word}</h4>
                <p className="text-sm text-slate-500">{words[id]?.partOfSpeech}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (view === AppView.ONBOARDING) return renderOnboarding();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <nav className="fixed left-0 top-0 bottom-0 w-24 bg-white border-r border-slate-200 flex flex-col items-center py-8 z-40">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-12">
          <Sparkles className="w-7 h-7" />
        </div>
        <div className="flex-1 flex flex-col gap-8">
          <button onClick={() => setView(AppView.DICTIONARY)} className={`p-4 rounded-2xl ${view === AppView.DICTIONARY ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
            <BookOpen />
          </button>
          <button onClick={() => setView(AppView.LISTS)} className={`p-4 rounded-2xl ${view === AppView.LISTS ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
            <List />
          </button>
          <button onClick={() => setView(AppView.EDITOR)} className={`p-4 rounded-2xl ${view === AppView.EDITOR ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
            <Palette />
          </button>
        </div>
      </nav>

      <main className="pl-24 pt-12 pr-12 min-h-screen">
        <header className="max-w-4xl mx-auto mb-12 flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            {view === AppView.DICTIONARY ? 'Visual Dictionary' : view === AppView.LISTS ? 'Collections' : 'Editor'}
          </h1>
        </header>

        {view === AppView.DICTIONARY && renderDictionary()}
        {view === AppView.LISTS && (
          <div className="max-w-4xl mx-auto">
             <div className="bg-white p-8 rounded-3xl border border-slate-200">
               <h3 className="text-xl font-bold mb-4">My Dictionary</h3>
               <p className="text-slate-500">{wordLists[0].wordIds.length} words saved.</p>
             </div>
          </div>
        )}
        {view === AppView.EDITOR && (
          <div className="max-w-5xl mx-auto text-center py-20">
            <Palette className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h2 className="text-2xl font-bold">Visual Editor Coming Soon</h2>
          </div>
        )}
      </main>

      {isPracticing && (
        <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center">
          <button onClick={stopPractice} className="absolute top-8 right-8 p-4 bg-white/10 rounded-full hover:bg-white/20 transition-all">
            <X />
          </button>
          <div className="w-48 h-48 rounded-full bg-indigo-500 flex items-center justify-center animate-pulse mb-8 shadow-2xl shadow-indigo-500/50">
            <Mic className="w-16 h-16" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Practicing "{activeWord?.word}"</h2>
          <p className="text-slate-400">Speak now, I'm listening...</p>
        </div>
      )}
    </div>
  );
};

export default App;
