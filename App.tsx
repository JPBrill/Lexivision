
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, BookOpen, List, Mic2, Sparkles, 
  Trash2, Image as ImageIcon, Wand2, Send, 
  X, MessageSquare, ArrowLeft, Volume2,
  Plus, LogOut, User as UserIcon, Share2, Copy, Check,
  Type as TypeIcon, Palette, Move, Activity, Loader2, BookmarkPlus, ChevronDown
} from 'lucide-react';
import { WordEntry, WordList, AppView, TranscriptionItem, User } from './types';
import { GeminiService } from './services/geminiService';
import { LiveSessionManager } from './services/liveService';

const PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&q=80&w=1000";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>(AppView.AUTH);
  const [activeWord, setActiveWord] = useState<WordEntry | null>(null);
  const [wordLists, setWordLists] = useState<WordList[]>([
    { id: 'default', name: 'My Dictionary', wordIds: [] }
  ]);
  const [allWords, setAllWords] = useState<WordEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVeoLoading, setIsVeoLoading] = useState(false);
  const [transcription, setTranscription] = useState<TranscriptionItem[]>([]);
  const [currentTurn, setCurrentTurn] = useState<{text: string, isUser: boolean} | null>(null);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [selectedListId, setSelectedListId] = useState('default');
  const [editPrompt, setEditPrompt] = useState('');
  const [suggestedWords, setSuggestedWords] = useState<string[]>([]);
  const [practiceMode, setPracticeMode] = useState<'conversation' | 'pronunciation'>('conversation');
  const [showListSelector, setShowListSelector] = useState(false);
  
  // Overlay state
  const [showOverlayEditor, setShowOverlayEditor] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  const [overlayFont, setOverlayFont] = useState('Inter');

  const geminiRef = useRef(new GeminiService());
  const liveManagerRef = useRef<LiveSessionManager | null>(null);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('lexivision_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      if (!parsedUser.level) {
        setView(AppView.ONBOARDING);
      } else {
        setView(AppView.DICTIONARY);
        loadSuggestions(parsedUser.level);
      }
    }
  }, []);

  const loadSuggestions = async (level: string) => {
    try {
      const words = await geminiRef.current.suggestWords(level);
      setSuggestedWords(words);
    } catch (e) {
      console.error("Suggestions failed", e);
    }
  };

  useEffect(() => {
    if (!user) return;
    const savedWords = localStorage.getItem(`lexivision_words_${user.id}`);
    const savedLists = localStorage.getItem(`lexivision_lists_${user.id}`);
    if (savedWords) setAllWords(JSON.parse(savedWords));
    if (savedLists) setWordLists(JSON.parse(savedLists));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(`lexivision_words_${user.id}`, JSON.stringify(allWords));
    localStorage.setItem(`lexivision_lists_${user.id}`, JSON.stringify(wordLists));
  }, [allWords, wordLists, user]);

  useEffect(() => {
    transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcription, currentTurn]);

  const handleAuth = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const name = email.split('@')[0];
    const newUser: User = { id: Math.random().toString(36).substr(2, 9), email, name };
    setUser(newUser);
    localStorage.setItem('lexivision_user', JSON.stringify(newUser));
    setView(AppView.ONBOARDING);
  };

  const setLevel = (level: User['level']) => {
    if (!user) return;
    const updatedUser = { ...user, level };
    setUser(updatedUser);
    localStorage.setItem('lexivision_user', JSON.stringify(updatedUser));
    setView(AppView.DICTIONARY);
    if (level) loadSuggestions(level);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('lexivision_user');
    setView(AppView.AUTH);
  };

  const handleSearch = async (e?: React.FormEvent, wordOverride?: string) => {
    if (e) e.preventDefault();
    const wordToUse = wordOverride || searchTerm;
    if (!wordToUse.trim()) return;

    setIsLoading(true);
    try {
      const def = await geminiRef.current.defineWord(wordToUse);
      const img = await geminiRef.current.generateImage(wordToUse, def.definition || '');
      
      const newEntry: WordEntry = {
        id: Math.random().toString(36).substr(2, 9),
        word: wordToUse,
        phonetics: def.phonetics || '',
        definition: def.definition || 'No definition found.',
        partOfSpeech: def.partOfSpeech || 'n/a',
        example: def.example || 'No example provided.',
        imageUrl: img,
        videoUrl: null,
        listId: selectedListId,
        createdAt: Date.now(),
      };

      setAllWords(prev => [newEntry, ...prev]);
      setActiveWord(newEntry);
      
      setWordLists(prev => prev.map(list => 
        list.id === selectedListId ? { ...list, wordIds: [newEntry.id, ...list.wordIds] } : list
      ));

      setSearchTerm('');
      setView(AppView.DICTIONARY);
    } catch (err: any) {
      console.error("Error creating entry", err);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("404") || msg.includes("not found")) {
        alert("The model service is currently unavailable. Please try again later.");
      } else {
        alert("Error: " + msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startPractice = async (word: WordEntry, mode: 'conversation' | 'pronunciation' = 'conversation') => {
    setActiveWord(word);
    setTranscription([{ text: "Connecting to your tutor...", isUser: false, id: 'init-msg' }]);
    setCurrentTurn(null);
    setIsLiveActive(true);
    setPracticeMode(mode);
    setView(AppView.PRACTICE);
    
    liveManagerRef.current = new LiveSessionManager();
    try {
      await liveManagerRef.current.start(word.word, mode, (text, isUser, isFinal) => {
        setTranscription(prev => {
          const filtered = prev.filter(p => p.id !== 'init-msg');
          if (isFinal) {
            if (filtered.length > 0 && filtered[filtered.length - 1].text === text && filtered[filtered.length - 1].isUser === isUser) {
              return filtered;
            }
            return [...filtered, { text, isUser, id: Math.random().toString(36) }];
          }
          return filtered;
        });

        if (!isFinal) {
          setCurrentTurn({ text, isUser });
        } else {
          setCurrentTurn(null);
        }
      });
    } catch (err: any) {
      console.error("Live start error", err);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("404") || msg.includes("not found")) {
        alert("Live voice service is currently unavailable on this tier.");
      }
      stopPractice();
    }
  };

  const stopPractice = () => {
    if (liveManagerRef.current) {
      liveManagerRef.current.stop();
      liveManagerRef.current = null;
    }
    setIsLiveActive(false);
    setView(AppView.DICTIONARY);
  };

  const handleApplyOverlay = () => {
    if (!activeWord) return;
    const updatedWord = {
      ...activeWord,
      overlay: {
        text: overlayText,
        color: overlayColor,
        font: overlayFont,
        position: { x: 50, y: 80 }
      }
    };
    setAllWords(prev => prev.map(w => w.id === activeWord.id ? updatedWord : w));
    setActiveWord(updatedWord);
    setShowOverlayEditor(false);
  };

  const handleShareList = (list: WordList) => {
    const listWords = allWords.filter(w => list.wordIds.includes(w.id));
    const data = btoa(JSON.stringify({ list, words: listWords }));
    const url = `${window.location.origin}${window.location.pathname}?sharedList=${data}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("List URL copied to clipboard!");
    });
  };

  const handleAnimate = async (word: WordEntry) => {
    setIsVeoLoading(true);
    try {
      const videoUri = await geminiRef.current.animateWithVeo(word.imageUrl!, `Animate the word "${word.word}".`);
      if (videoUri) {
        const updatedEntry = { ...word, videoUrl: videoUri };
        setAllWords(prev => prev.map(w => w.id === word.id ? updatedEntry : w));
        setActiveWord(updatedEntry);
      }
    } catch (err: any) {
      console.error("Animate error", err);
      const msg = err.message || JSON.stringify(err);
      alert(msg);
    } finally {
      setIsVeoLoading(false);
    }
  };

  const handleEditImage = async () => {
    if (!activeWord || !editPrompt) return;
    setIsLoading(true);
    try {
      const edited = await geminiRef.current.editImage(activeWord.imageUrl!, editPrompt);
      if (edited) {
        const updatedEntry = { ...activeWord, imageUrl: edited, videoUrl: null };
        setAllWords(prev => prev.map(w => w.id === activeWord.id ? updatedEntry : w));
        setActiveWord(updatedEntry);
        setEditPrompt('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const deleteWord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this word?")) return;
    setAllWords(prev => prev.filter(w => w.id !== id));
    setWordLists(prev => prev.map(l => ({ ...l, wordIds: l.wordIds.filter(wid => wid !== id) })));
    if (activeWord?.id === id) setActiveWord(null);
  };

  const addNewList = () => {
    const name = prompt("Enter wordlist name:");
    if (name && name.trim()) {
      const newList: WordList = { id: Math.random().toString(36).substr(2, 9), name: name.trim(), wordIds: [] };
      setWordLists(prev => [...prev, newList]);
    }
  };

  const addWordToList = (listId: string) => {
    if (!activeWord) return;
    setWordLists(prev => prev.map(list => {
      if (list.id === listId) {
        if (list.wordIds.includes(activeWord.id)) {
          alert("Word is already in this list!");
          return list;
        }
        return { ...list, wordIds: [...list.wordIds, activeWord.id] };
      }
      return list;
    }));
    setShowListSelector(false);
  };

  const getListWords = () => {
    const list = wordLists.find(l => l.id === selectedListId);
    return list ? allWords.filter(w => list.wordIds.includes(w.id)) : [];
  };

  if (view === AppView.AUTH) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-[3rem] p-12 shadow-2xl">
          <div className="flex flex-col items-center mb-10">
            <div className="p-4 bg-indigo-500 rounded-3xl shadow-xl mb-6"><BookOpen className="w-10 h-10 text-white" /></div>
            <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">LexiVision</h1>
            <p className="text-slate-500 font-medium mt-2">The Interactive Visual Dictionary</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-6">
            <input name="email" type="email" required placeholder="you@example.com" className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <input type="password" required placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95">Sign In / Sign Up</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === AppView.ONBOARDING) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <Sparkles className="w-12 h-12 text-indigo-500 mb-6 animate-pulse" />
        <h2 className="text-4xl font-black mb-4">Welcome to LexiVision</h2>
        <p className="text-slate-400 mb-12 max-w-lg">Let's determine your current level to personalize your learning journey.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          {[
            { level: 'Beginner', desc: 'Starting from scratch. Common words and basic visuals.' },
            { level: 'Intermediate', desc: 'Can hold basic conversations. Abstract concepts and nuances.' },
            { level: 'Advanced', desc: 'Fluent but looking for mastery. Complex vocabulary and idioms.' }
          ].map((item) => (
            <button 
              key={item.level} 
              onClick={() => setLevel(item.level as User['level'])}
              className="p-8 bg-slate-900 border border-slate-800 rounded-[2.5rem] hover:bg-slate-800 transition-all hover:border-indigo-500/50 group"
            >
              <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-400">{item.level}</h3>
              <p className="text-sm text-slate-500">{item.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <aside className="w-80 bg-slate-900/60 border-r border-slate-800 flex flex-col backdrop-blur-xl">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500 rounded-xl"><BookOpen className="w-5 h-5 text-white" /></div>
              <h1 className="text-lg font-black tracking-tight text-white uppercase italic">LexiVision</h1>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-red-400 transition-all"><LogOut className="w-4 h-4" /></button>
          </div>
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800 mb-8 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold">{user?.name?.[0].toUpperCase()}</div>
            <div>
              <p className="text-sm font-black text-white">{user?.name}</p>
              <p className="text-[10px] text-indigo-400 font-bold uppercase">{user?.level || 'Trainee'}</p>
            </div>
          </div>
          <nav className="space-y-2">
            <button onClick={() => { setView(AppView.DICTIONARY); setActiveWord(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${view === AppView.DICTIONARY ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Search className="w-5 h-5" /><span className="font-semibold">Discover</span></button>
            <button onClick={() => setView(AppView.LISTS)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${view === AppView.LISTS ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><List className="w-5 h-5" /><span className="font-semibold">My Collections</span></button>
          </nav>
          <div className="mt-12">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Your Lists</h3>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  addNewList();
                }} 
                className="p-1 hover:bg-slate-800 rounded-md text-indigo-400 transition-colors"
                title="Create New List"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1 overflow-y-auto max-h-[30vh] pr-2 custom-scrollbar">
              {wordLists.map(list => (
                <button key={list.id} onClick={() => { setSelectedListId(list.id); setView(AppView.LISTS); }} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-all ${selectedListId === list.id && view === AppView.LISTS ? 'bg-slate-800 text-indigo-400 ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300'}`}>
                  <span className="truncate font-medium">{list.name}</span>
                  <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded-full">{list.wordIds.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative bg-slate-950 overflow-hidden">
        <header className="h-20 border-b border-slate-900 flex items-center px-10 gap-6 z-20 backdrop-blur-md bg-slate-950/80">
          <form onSubmit={handleSearch} className="flex-1 max-w-xl relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Enter a word to visualize..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
          </form>
          {isLoading && <div className="flex items-center gap-2 text-indigo-400 font-bold animate-pulse"><Loader2 className="w-4 h-4 animate-spin" />Generating...</div>}
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-12">
          {view === AppView.DICTIONARY && (
            <div className="max-w-6xl mx-auto space-y-12">
              {!activeWord ? (
                <>
                  <div className="bg-indigo-600/10 border border-indigo-500/20 p-10 rounded-[3rem] flex items-center justify-between">
                    <div className="max-w-md">
                      <h2 className="text-3xl font-black mb-2">Ready to level up?</h2>
                      <p className="text-slate-400 mb-6">Explore words tailored to your <span className="text-indigo-400 font-bold">{user?.level}</span> level.</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestedWords.map(w => (
                          <button key={w} onClick={() => handleSearch(undefined, w)} className="px-4 py-2 bg-slate-900 rounded-xl hover:bg-slate-800 border border-slate-800 text-sm font-bold transition-all">{w}</button>
                        ))}
                      </div>
                    </div>
                    <div className="hidden lg:block w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
                  </div>
                  <div className="text-center py-20 opacity-40"><Sparkles className="w-12 h-12 mx-auto mb-4" /><p className="text-xl font-medium">Search for a word to see its visual essence.</p></div>
                </>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 animate-in slide-in-from-bottom-8 duration-700">
                  <div className="lg:col-span-2 space-y-8">
                    <div>
                      <span className="text-indigo-500 font-black text-xs uppercase tracking-[0.3em]">{activeWord.partOfSpeech}</span>
                      <div className="flex items-baseline gap-4">
                        <h2 className="text-7xl font-black tracking-tighter text-white lowercase leading-none">{activeWord.word}</h2>
                        <span className="text-slate-500 font-medium text-xl font-mono">{activeWord.phonetics}</span>
                      </div>
                    </div>
                    <p className="text-2xl text-slate-300 font-light italic">"{activeWord.definition}"</p>
                    <div className="p-8 bg-slate-900/40 rounded-[2.5rem] border border-slate-800"><h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">In a Sentence</h4><p className="text-slate-400 text-lg">{activeWord.example}</p></div>
                    
                    <div className="flex flex-col gap-4">
                      <button onClick={() => startPractice(activeWord, 'conversation')} className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-5 rounded-3xl font-black text-lg shadow-2xl shadow-indigo-600/30 transition-all"><Mic2 className="w-6 h-6" />Practice Conversation</button>
                      
                      <div className="flex gap-4">
                        <button onClick={() => startPractice(activeWord, 'pronunciation')} className="flex-1 flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white px-8 py-5 rounded-3xl font-black text-lg shadow-xl transition-all"><Activity className="w-6 h-6 text-indigo-400" />Lab</button>
                        <div className="relative">
                          <button 
                            onClick={() => setShowListSelector(!showListSelector)}
                            className="flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white px-6 py-5 rounded-3xl font-black text-lg shadow-xl transition-all"
                            title="Add to Collection"
                          >
                            <BookmarkPlus className="w-6 h-6 text-purple-400" />
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          </button>
                          {showListSelector && (
                            <div className="absolute bottom-full left-0 mb-4 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-[60] animate-in slide-in-from-bottom-2">
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-2 mb-1">Add to list</div>
                              <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                                {wordLists.map(list => (
                                  <button 
                                    key={list.id} 
                                    onClick={() => addWordToList(list.id)}
                                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-indigo-600 hover:text-white transition-all"
                                  >
                                    {list.name}
                                  </button>
                                ))}
                                <button 
                                  onClick={() => { setShowListSelector(false); addNewList(); }}
                                  className="w-full text-left px-4 py-2 rounded-xl text-sm font-bold text-indigo-400 hover:bg-slate-800 transition-all flex items-center gap-2 border-t border-slate-800 mt-1"
                                >
                                  <Plus className="w-4 h-4" /> New List
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="lg:col-span-3 space-y-6">
                    <div className="relative aspect-[16/10] rounded-[3rem] overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl group">
                      {isVeoLoading ? (
                        <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center z-10">
                          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                          <p className="font-bold text-slate-400">Animating Visual Concept...</p>
                        </div>
                      ) : null}
                      {activeWord.videoUrl ? <video src={activeWord.videoUrl} autoPlay loop muted className="w-full h-full object-cover" /> : <img src={activeWord.imageUrl || PLACEHOLDER_IMG} className="w-full h-full object-cover" />}
                      {activeWord.overlay && (
                        <div 
                          className="absolute pointer-events-none" 
                          style={{ 
                            left: `${activeWord.overlay.position.x}%`, 
                            top: `${activeWord.overlay.position.y}%`, 
                            color: activeWord.overlay.color,
                            fontFamily: activeWord.overlay.font,
                            fontSize: '2.5rem',
                            fontWeight: 'bold',
                            transform: 'translate(-50%, -50%)',
                            textShadow: '0 4px 12px rgba(0,0,0,0.8)'
                          }}
                        >
                          {activeWord.overlay.text}
                        </div>
                      )}
                      <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button onClick={() => setShowOverlayEditor(true)} className="p-3 bg-black/50 backdrop-blur-md rounded-2xl hover:bg-black/70 transition-all"><TypeIcon className="w-5 h-5" /></button>
                        <button onClick={() => handleAnimate(activeWord)} className="p-3 bg-black/50 backdrop-blur-md rounded-2xl hover:bg-black/70 transition-all"><Wand2 className="w-5 h-5 text-purple-400" /></button>
                      </div>
                    </div>
                    <div className="p-6 bg-slate-900/30 rounded-[2.5rem] border border-slate-800 flex gap-3"><input type="text" placeholder="Modify visual..." value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" /><button onClick={handleEditImage} disabled={isLoading || !editPrompt} className="w-14 h-14 bg-indigo-600 hover:bg-indigo-500 rounded-2xl flex items-center justify-center transition-all shadow-lg"><Send className="w-5 h-5 text-white" /></button></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === AppView.LISTS && (
            <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
              <div className="flex items-end justify-between">
                <div><h2 className="text-5xl font-black tracking-tighter mb-2">{wordLists.find(l => l.id === selectedListId)?.name || 'Playlist'}</h2><p className="text-slate-500 font-medium">Collection of {getListWords().length} concepts</p></div>
                <div className="flex gap-4">
                  <button onClick={() => handleShareList(wordLists.find(l => l.id === selectedListId)!)} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-600/20 transition-all"><Share2 className="w-4 h-4" />Share Playlist</button>
                  {selectedListId !== 'default' && (
                    <button 
                      onClick={() => {
                        if(confirm("Delete this list?")) {
                          setWordLists(prev => prev.filter(l => l.id !== selectedListId));
                          setSelectedListId('default');
                        }
                      }}
                      className="flex items-center justify-center p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {getListWords().length === 0 ? (
                  <div className="col-span-full py-20 text-center opacity-30 border-2 border-dashed border-slate-800 rounded-[3rem]">
                    <BookmarkPlus className="w-12 h-12 mx-auto mb-4" />
                    <p className="text-xl font-medium">This collection is empty.</p>
                  </div>
                ) : getListWords().map(word => (
                  <div key={word.id} onClick={() => { setActiveWord(word); setView(AppView.DICTIONARY); }} className="group relative bg-slate-900 rounded-[2.5rem] overflow-hidden border border-slate-800 cursor-pointer transition-all hover:shadow-2xl hover:-translate-y-2">
                    <div className="aspect-video relative overflow-hidden">{word.videoUrl ? <video src={word.videoUrl} autoPlay loop muted className="w-full h-full object-cover" /> : <img src={word.imageUrl || PLACEHOLDER_IMG} className="w-full h-full object-cover" />}</div>
                    <div className="p-6">
                      <h3 className="text-xl font-black capitalize group-hover:text-indigo-400 transition-colors">{word.word}</h3>
                      <p className="text-[10px] text-slate-500 font-mono mb-2 uppercase">{word.phonetics}</p>
                      <p className="text-xs text-slate-500 line-clamp-2">{word.definition}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === AppView.PRACTICE && activeWord && (
            <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in zoom-in-95 duration-500">
              <header className="h-20 border-b border-slate-900 flex items-center px-10 justify-between bg-slate-950/80 backdrop-blur-xl">
                <button onClick={stopPractice} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /><span className="font-bold">End Session</span></button>
                <div className="text-center">
                  <h3 className="text-sm font-black text-indigo-500 uppercase tracking-widest">{practiceMode === 'conversation' ? 'Tutor Mode' : 'Pronunciation Lab'}</h3>
                  <h2 className="text-xl font-bold capitalize">{activeWord.word} <span className="text-slate-500 font-mono text-base ml-2">{activeWord.phonetics}</span></h2>
                </div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse shadow-lg"></div><span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Voice</span></div>
              </header>
              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
                <div className="hidden lg:flex items-center justify-center p-20 bg-slate-900/30">
                  <div className="relative w-full aspect-square max-w-lg rounded-[4rem] overflow-hidden shadow-2xl border border-slate-800">
                    <img src={activeWord.imageUrl || PLACEHOLDER_IMG} className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent"></div>
                    <div className="absolute bottom-12 left-12">
                      <h4 className="text-5xl font-black capitalize mb-2">{activeWord.word}</h4>
                      <p className="text-slate-400 font-medium italic">"{activeWord.definition}"</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col bg-slate-950/50 border-l border-slate-900">
                  <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                    {transcription.map((item) => (
                      <div key={item.id} className={`flex ${item.isUser ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                        <div className={`max-w-[85%] p-6 rounded-[2rem] ${item.isUser ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-900 text-slate-300 rounded-tl-none border border-slate-800 shadow-xl'}`}>
                          <p className="text-lg font-medium leading-relaxed">{item.text}</p>
                        </div>
                      </div>
                    ))}
                    {currentTurn && (
                      <div className={`flex ${currentTurn.isUser ? 'justify-end' : 'justify-start'} opacity-60`}>
                        <div className={`max-w-[85%] p-6 rounded-[2rem] ${currentTurn.isUser ? 'bg-indigo-600/50 text-white' : 'bg-slate-900/50 text-slate-400'}`}>
                          <p className="text-lg font-medium italic">{currentTurn.text}...</p>
                        </div>
                      </div>
                    )}
                    <div ref={transcriptionEndRef} />
                  </div>
                  <div className="p-10 border-t border-slate-900 flex justify-center"><button onClick={stopPractice} className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-2xl shadow-red-500/20 active:scale-90"><X className="w-8 h-8 text-white" /></button></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Overlay Editor Modal */}
      {showOverlayEditor && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-[3rem] p-10 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black tracking-tight">Add Text Overlay</h3>
              <button onClick={() => setShowOverlayEditor(false)} className="p-2 hover:bg-slate-800 rounded-xl"><X className="w-6 h-6" /></button>
            </div>
            <div className="space-y-6">
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Text Content</label><input type="text" value={overlayText} onChange={e => setOverlayText(e.target.value)} placeholder="Type something..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white focus:outline-none" /></div>
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Color</label><input type="color" value={overlayColor} onChange={e => setOverlayColor(e.target.value)} className="w-full h-14 bg-slate-950 border border-slate-800 rounded-2xl p-2 cursor-pointer" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Font</label><select value={overlayFont} onChange={e => setOverlayFont(e.target.value)} className="w-full h-14 bg-slate-950 border border-slate-800 rounded-2xl px-4 text-white focus:outline-none"><option value="Inter">Inter</option><option value="Georgia">Georgia</option><option value="Monospace">Monospace</option></select></div>
              </div>
              <button onClick={handleApplyOverlay} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all">Apply Overlay</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
