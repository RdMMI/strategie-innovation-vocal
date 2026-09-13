import React, { useState, useEffect, useRef } from 'react';

// --- UTILS & HELPERS ---

// Removes accents and converts text to lowercase for easier comparison
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// --- FUZZY SEARCH (LEVENSHTEIN ALGORITHM) ---

// Calculates the mathematical distance between two strings (number of edits required)
const getLevenshteinDistance = (a, b) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, 
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1) 
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// Converts the Levenshtein distance into a similarity percentage (0.0 to 1.0)
const getSimilarity = (s1, s2) => {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - getLevenshteinDistance(longer, shorter)) / parseFloat(longerLength);
};

// Checks if the spoken text closely matches the task text (tolerates typos and plurals)
const isFuzzyMatch = (spokenText, taskText, threshold = 0.75) => {
  const spokenWords = spokenText.split(/\s+/).filter(w => w.length > 0);
  const taskWords = taskText.split(/\s+/).filter(w => w.length > 0);
  
  if (taskWords.length === 0 || spokenWords.length === 0) return false;

  let totalScore = 0;
  for (const tWord of taskWords) {
      let bestMatchScore = 0;
      // Find the best matching spoken word for each task word
      for (const sWord of spokenWords) {
          const score = getSimilarity(tWord, sWord);
          if (score > bestMatchScore) {
              bestMatchScore = score;
          }
      }
      totalScore += bestMatchScore;
  }
  
  // Calculate average similarity score
  const averageScore = totalScore / taskWords.length;
  return averageScore >= threshold;
};

// Maps numeric IDs to their French word equivalents (1 -> "un")
const getNumberWords = (num) => {
  const map = {
    1: ['1', 'un', 'une'], 2: ['2', 'deux'], 3: ['3', 'trois'],
    4: ['4', 'quatre'], 5: ['5', 'cinq'], 6: ['6', 'six'],
    7: ['7', 'sept'], 8: ['8', 'huit'], 9: ['9', 'neuf'],
    10: ['10', 'dix'], 11: ['11', 'onze'], 12: ['12', 'douze'],
    13: ['13', 'treize'], 14: ['14', 'quatorze'], 15: ['15', 'quinze'],
    16: ['16', 'seize'], 17: ['17', 'dix-sept'], 18: ['18', 'dix-huit'],
    19: ['19', 'dix-neuf'], 20: ['20', 'vingt']
  };
  return map[num] || [num.toString()];
};

// Uses browser's SpeechSynthesis to provide audio feedback
const speakText = (text) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Prevent overlapping speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    window.speechSynthesis.speak(utterance);
  }
};

// --- MAIN COMPONENT ---

export default function App() {
  // App states
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [newListName, setNewListName] = useState('');
  
  // Initialize lists from LocalStorage or use default dummy data
  const [lists, setLists] = useState(() => {
    const savedLists = localStorage.getItem('voice-checklist-multi-lists');
    if (savedLists) {
      return JSON.parse(savedLists);
    }
    return [
      {
        id: 1,
        name: 'Bastien',
        tasks: [
          { id: 1, text: 'aller au toilette', done: false },
          { id: 2, text: 'manger avec mamie', done: false }
        ]
      }
    ];
  });

  const [activeListId, setActiveListId] = useState(lists.length > 0 ? lists[0].id : null);

  // Auto-save lists to LocalStorage whenever they change
  useEffect(() => {
    localStorage.setItem('voice-checklist-multi-lists', JSON.stringify(lists));
  }, [lists]);

  // Refs used to access the latest state inside the Speech API callbacks without restarting it
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const listsRef = useRef(lists);
  const activeListIdRef = useRef(activeListId);

  useEffect(() => { listsRef.current = lists; }, [lists]);
  useEffect(() => { activeListIdRef.current = activeListId; }, [activeListId]);

  // Setup Web Speech API on component mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return; // Fallback handled in the render phase

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fr-FR';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const resultsArray = Array.from(event.results);
      
      // Update the visual transcript in real-time
      const currentTranscript = resultsArray
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      setTranscript(currentTranscript);

      // Only trigger logic when the user finishes a sentence
      const latestResult = resultsArray[resultsArray.length - 1];
      
      if (latestResult.isFinal) {
        const latestSentence = latestResult[0].transcript;
        checkCommands(latestSentence);
      }
    };

    recognition.onend = () => {
      // Auto-restart microphone if it's supposed to be listening
      if (isListeningRef.current) {
        try { recognition.start(); } catch (e) { /* Silent catch */ }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  // --- LOGIC ENGINE ---
  // Analyzes the final spoken sentence and triggers list navigation or task validation
  const checkCommands = (text) => {
    const spokenClean = normalizeText(text);
    let remainingSpeech = spokenClean;

    // 1. Check for Voice Navigation ("liste [nom]")
    if (remainingSpeech.includes('liste')) {
      listsRef.current.forEach(list => {
        const listNameClean = normalizeText(list.name);
        const regexStr = listNameClean.replace(/\s+/g, '').split('').map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
        const flexibleRegex = new RegExp(regexStr, 'g');

        // Match exactly without spaces OR match using Fuzzy Search (75% similarity)
        if (flexibleRegex.test(remainingSpeech) || isFuzzyMatch(remainingSpeech, listNameClean, 0.75)) {
          setActiveListId(list.id);
          speakText(`Ouverture de la liste ${list.name}`);
          remainingSpeech = remainingSpeech.replace(flexibleRegex, "");
        }
      });
    }

    // 2. Check for Task Validation ("valider [tâche/id]")
    const isValidating = remainingSpeech.includes('valider') || remainingSpeech.includes('validez') || remainingSpeech.includes('terminer');
    
    if (isValidating) {
      const currentList = listsRef.current.find(l => l.id === activeListIdRef.current);
      if (!currentList) return;

      // Sort tasks by length to prevent partial matches on shorter task names
      const tasksSortedByLength = [...currentList.tasks].sort((a, b) => b.text.length - a.text.length);

      // Strategy A: Validate by task name
      tasksSortedByLength.forEach(task => {
        const taskTextClean = normalizeText(task.text);
        
        // Exact match regex (ignoring spaces)
        const regexStr = taskTextClean.replace(/\s+/g, '').split('').map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
        const flexibleRegex = new RegExp(regexStr, 'g');

        let matched = false;

        if (flexibleRegex.test(remainingSpeech)) {
          matched = true;
          remainingSpeech = remainingSpeech.replace(flexibleRegex, ""); 
        } 
        else if (isFuzzyMatch(remainingSpeech, taskTextClean, 0.75)) {
          matched = true;
        }

        if (matched && !task.done) {
          toggleTask(currentList.id, task.id);
          speakText(`${task.text}, validé.`);
        }
      });

      // Strategy B: Validate by task ID (e.g., "valider 1")
      const spokenWords = remainingSpeech.split(/\s+/); 
      currentList.tasks.forEach(task => {
        const idWords = getNumberWords(task.id);
        const matchById = idWords.some(word => spokenWords.includes(word));

        if (matchById) {
          if (!task.done) {
            toggleTask(currentList.id, task.id);
            speakText(`${task.text}, validé.`);
          }
        }
      });
    }
  };

  // --- EVENT HANDLERS ---

  const toggleTask = (listId, taskId) => {
    setLists(prevLists => prevLists.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        tasks: list.tasks.map(task => 
          task.id === taskId ? { ...task, done: true } : task
        )
      };
    }));
  };

  const handleAddList = (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    
    const newId = lists.length > 0 ? Math.max(...lists.map(l => l.id)) + 1 : 1;
    const newList = { id: newId, name: newListName, tasks: [] };
    
    setLists(prev => [...prev, newList]);
    setActiveListId(newId);
    setNewListName('');
  };

  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTaskText.trim() || !activeListId) return;

    setLists(prevLists => prevLists.map(list => {
      if (list.id !== activeListId) return list;
      const newTaskId = list.tasks.length > 0 ? Math.max(...list.tasks.map(t => t.id)) + 1 : 1;
      return {
        ...list,
        tasks: [...list.tasks, { id: newTaskId, text: newTaskText, done: false }]
      };
    }));
    setNewTaskText('');
  };

  const handleClearTasks = () => {
    if (window.confirm("Vider toutes les tâches de cette liste ?")) {
      setLists(prevLists => prevLists.map(list => 
        list.id === activeListId ? { ...list, tasks: [] } : list
      ));
    }
  };

  const handleDeleteList = (listIdToDelete) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer définitivement cette liste et toutes ses tâches ?")) {
      setLists(prevLists => {
        const updatedLists = prevLists.filter(l => l.id !== listIdToDelete);
        if (activeListId === listIdToDelete) {
          setActiveListId(updatedLists.length > 0 ? updatedLists[0].id : null); // Switch to another list if possible
        }
        return updatedLists;
      });
    }
  };

  // Starts or stops the voice recognition manually
  const toggleListen = () => {
    if (!recognitionRef.current) return;

    if (isListeningRef.current) {
      isListeningRef.current = false;
      recognitionRef.current.stop();
    } else {
      isListeningRef.current = true;
      try {
        recognitionRef.current.start();
      } catch(e) {
        // Silently catch error if it's already starting
      }
    }
  };

  // Browser support check
  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md text-red-600">
          ⚠️ Votre navigateur ne supporte pas la reconnaissance vocale. Utilisez Google Chrome.
        </div>
      </div>
    );
  }

  const activeList = lists.find(l => l.id === activeListId);

  // --- RENDER (UI) ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-12">
      
      {/* Header & Microphone Button */}
      <header className="bg-white shadow-sm pt-8 pb-10 mb-8 rounded-b-3xl">
        <h1 className="text-3xl md:text-4xl font-extrabold text-center text-indigo-900 mb-8 tracking-tight">
          Checklist Mains-Libres <span className="text-indigo-500"></span>
        </h1>
        
        <div className="flex justify-center">
          <button 
            onClick={toggleListen}
            className={`
              relative flex items-center justify-center gap-3 px-8 py-4 rounded-full text-lg font-bold text-white transition-all duration-300 transform hover:scale-105 shadow-xl
              ${isListening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'}
            `}
          >
            {isListening ? (
              <>
                <span className="w-3 h-3 bg-white rounded-full animate-ping"></span>
                Écoute en cours...
              </>
            ) : (
              <>Activer le micro</>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6">
        
        {/* --- LIST MANAGEMENT SECTION --- */}
        <section className="mb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-slate-700">Mes Listes</h2>
            
            <form onSubmit={handleAddList} className="flex gap-2 w-full md:w-auto">
              <input 
                type="text" 
                value={newListName} 
                onChange={(e) => setNewListName(e.target.value)} 
                placeholder="Nouvelle liste..."
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
              <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                Créer
              </button>
            </form>
          </div>
          
          <div className="flex gap-2 flex-wrap bg-white p-2 rounded-xl shadow-sm border border-slate-100">
            {lists.length === 0 && <span className="text-slate-400 p-2 text-sm italic">Aucune liste pour le moment.</span>}
            {lists.map(list => (
              <button 
                key={list.id} 
                onClick={() => setActiveListId(list.id)}
                className={`
                  px-5 py-2 rounded-lg font-medium transition-all duration-200
                  ${activeListId === list.id 
                    ? 'bg-indigo-100 text-indigo-700 shadow-sm border border-indigo-200' 
                    : 'bg-transparent text-slate-500 hover:bg-slate-100 border border-transparent'}
                `}
              >
                {list.name}
              </button>
            ))}
          </div>
        </section>

        {/* --- ACTIVE LIST SECTION --- */}
        {activeList ? (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-indigo-900">{activeList.name}</h2>
              <span className="text-xs font-semibold bg-indigo-200 text-indigo-800 px-3 py-1 rounded-full uppercase tracking-wider">
                {activeList.tasks.filter(t => !t.done).length} restante(s)
              </span>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleAddTask} className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  value={newTaskText} 
                  onChange={(e) => setNewTaskText(e.target.value)} 
                  placeholder="Que devez-vous faire ?"
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg bg-slate-50 focus:bg-white transition-colors"
                />
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-sm">
                  Ajouter
                </button>
              </form>

              <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm mb-6 flex items-start gap-2">
                <span>💡</span>
                <p><strong>À la voix :</strong> Dites <em>"Va sur la liste [nom]"</em> ou <em>"Valider [numéro / nom de la tâche]"</em>.</p>
              </div>
              
              <ul className="space-y-3">
                {activeList.tasks.length === 0 && (
                  <div className="text-center py-8 text-slate-400 italic">Cette liste est vide. Ajoutez une tâche ci-dessus.</div>
                )}
                {activeList.tasks.map(task => (
                  <li 
                    key={task.id}
                    className={`
                      flex items-center justify-between p-4 rounded-xl border transition-all duration-500
                      ${task.done ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 shadow-sm hover:border-indigo-300'}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`flex items-center justify-center min-w-8 h-8 px-2 rounded-full text-sm font-bold ${task.done ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-700'}`}>
                        {task.id}
                      </span>
                      <span className={`text-lg ${task.done ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                        {task.text}
                      </span>
                    </div>
                    {task.done && <span className="text-2xl">✅</span>}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex justify-end gap-3 border-t pt-6">
                {activeList.tasks.length > 0 && (
                  <button 
                    onClick={handleClearTasks}
                    className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors font-medium text-sm"
                  >
                    Vider les tâches
                  </button>
                )}
                <button 
                  onClick={() => handleDeleteList(activeList.id)} 
                  className="px-4 py-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium text-sm"
                >
                  Supprimer la liste
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="bg-slate-100 rounded-2xl p-12 text-center text-slate-500 border border-slate-200 border-dashed">
            Sélectionnez une liste en haut ou créez-en une nouvelle pour commencer.
          </div>
        )}

        {/* --- TRANSCRIPT DEBUG (Terminal Style) --- */}
        <div className="mt-8 bg-slate-900 rounded-xl p-4 shadow-lg overflow-hidden border border-slate-700">
          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Terminal Vocal
          </div>
          <p className="font-mono text-green-400 min-h-[1.5rem]">
            {transcript || <span className="opacity-50">En attente de voix...</span>}
          </p>
        </div>

      </main>
    </div>
  );
}