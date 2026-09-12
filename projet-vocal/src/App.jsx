import React, { useState, useEffect, useRef } from 'react';

// Helper to remove accents and make lowercase
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// Helper to map numbers to their word equivalents (extended to 20)
const getNumberWords = (num) => {
  const map = {
    1: ['1', 'un', 'une'],
    2: ['2', 'deux'],
    3: ['3', 'trois'],
    4: ['4', 'quatre'],
    5: ['5', 'cinq'],
    6: ['6', 'six'],
    7: ['7', 'sept'],
    8: ['8', 'huit'],
    9: ['9', 'neuf'],
    10: ['10', 'dix'],
    11: ['11', 'onze'],
    12: ['12', 'douze'],
    13: ['13', 'treize'],
    14: ['14', 'quatorze'],
    15: ['15', 'quinze'],
    16: ['16', 'seize'],
    17: ['17', 'dix-sept'],
    18: ['18', 'dix-huit'],
    19: ['19', 'dix-neuf'],
    20: ['20', 'vingt']
  };
  return map[num] || [num.toString()];
};

// Helper for Text-to-Speech (Voice synthesis)
const speakText = (text) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    window.speechSynthesis.speak(utterance);
  }
};

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [newListName, setNewListName] = useState('');
  
  // FEATURE: Multi-lists Architecture & Persistent Storage
  // We use a new localStorage key to avoid conflicts with the old data structure
  const [lists, setLists] = useState(() => {
    const savedLists = localStorage.getItem('voice-checklist-multi-lists');
    // FIX applied here: checking 'savedLists' instead of 'savedTasks'
    if (savedLists) {
      return JSON.parse(savedLists);
    }
    return [
      {
        id: 1,
        name: 'Cuisine',
        tasks: [
          { id: 1, text: 'Préparer les ingrédients', done: false },
          { id: 2, text: 'Allumer le four', done: false }
        ]
      },
      {
        id: 2,
        name: 'Travail',
        tasks: [
          { id: 1, text: 'Envoyer le rapport', done: false }
        ]
      }
    ];
  });

  const [activeListId, setActiveListId] = useState(lists.length > 0 ? lists[0].id : null);

  useEffect(() => {
    localStorage.setItem('voice-checklist-multi-lists', JSON.stringify(lists));
  }, [lists]);

  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  
  const listsRef = useRef(lists);
  const activeListIdRef = useRef(activeListId);

  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  useEffect(() => {
    activeListIdRef.current = activeListId;
  }, [activeListId]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fr-FR';

    recognition.onresult = (event) => {
      const resultsArray = Array.from(event.results);
      const currentTranscript = resultsArray
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      setTranscript(currentTranscript);

      const isFinal = resultsArray[resultsArray.length - 1].isFinal;
      if (isFinal) {
        checkCommands(currentTranscript);
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.error("Microphone restart error...", e);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const checkCommands = (text) => {
    const spokenClean = normalizeText(text);
    let remainingSpeech = spokenClean;

    // 1. FEATURE: Voice Navigation Check
    // Checks if the user wants to switch to another list
    const isNavigating = remainingSpeech.includes('va sur la liste') || remainingSpeech.includes('aller sur la liste') || remainingSpeech.includes('ouvre la liste');
    
    if (isNavigating) {
      listsRef.current.forEach(list => {
        const listNameClean = normalizeText(list.name);
        if (remainingSpeech.includes(listNameClean)) {
          setActiveListId(list.id);
          speakText(`Ouverture de la liste ${list.name}`);
          remainingSpeech = remainingSpeech.replace(listNameClean, "");
        }
      });
    }

    // 2. FEATURE: Task Validation Check
    // Checks validations ONLY for the currently active list
    const isValidating = remainingSpeech.includes('valider') || remainingSpeech.includes('validez') || remainingSpeech.includes('terminer');
    
    if (isValidating) {
      const currentList = listsRef.current.find(l => l.id === activeListIdRef.current);
      if (!currentList) return;

      const tasksSortedByLength = [...currentList.tasks].sort((a, b) => b.text.length - a.text.length);

      // Pass 1: Check by task text
      tasksSortedByLength.forEach(task => {
        const taskTextClean = normalizeText(task.text);
        
        const regexStr = taskTextClean
          .replace(/\s+/g, '')
          .split('')
          .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\s*');
          
        const flexibleRegex = new RegExp(regexStr, 'g');

        if (flexibleRegex.test(remainingSpeech)) {
          if (!task.done) {
            toggleTask(currentList.id, task.id);
            speakText(`${task.text}, validé.`);
          }
          remainingSpeech = remainingSpeech.replace(flexibleRegex, "");
        }
      });

      // Pass 2: Check by task ID
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
    setActiveListId(newId); // Automatically switch to the new list
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

  const toggleListen = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      isListeningRef.current = false;
      setIsListening(false);
      recognitionRef.current.stop();
    } else {
      isListeningRef.current = true;
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch(e) {
        console.error("Start error", e);
      }
    }
  };

  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    return <div>Votre navigateur ne supporte pas la reconnaissance vocale (Utilisez Chrome).</div>;
  }

  const activeList = lists.find(l => l.id === activeListId);

  return (
    <div>
      <h1>Checklist Mains-Libres 🎤</h1>
      
      <div>
        <button onClick={toggleListen}>
          {isListening ? 'Arrêter le micro' : 'Activer le micro'}
        </button>
      </div>

      <br />
      <hr />

      {/* --- LIST MANAGEMENT SECTION --- */}
      <div>
        <h2>Mes Listes</h2>
        
        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {lists.map(list => (
            <button 
              key={list.id} 
              onClick={() => setActiveListId(list.id)}
              style={{ fontWeight: activeListId === list.id ? 'bold' : 'normal' }}
            >
              {list.name}
            </button>
          ))}
        </div>

        {/* Form to create a new list */}
        <form onSubmit={handleAddList}>
          <input 
            type="text" 
            value={newListName} 
            onChange={(e) => setNewListName(e.target.value)} 
            placeholder="Nouvelle liste (ex: Courses)"
          />
          <button type="submit">Créer une liste</button>
        </form>
      </div>
      
      <hr />

      {/* --- ACTIVE LIST SECTION --- */}
      {activeList ? (
        <div>
          <h2>Contenu de : {activeList.name}</h2>
          
          <form onSubmit={handleAddTask}>
            <input 
              type="text" 
              value={newTaskText} 
              onChange={(e) => setNewTaskText(e.target.value)} 
              placeholder="Ex: Acheter du pain"
            />
            <button type="submit">Ajouter à {activeList.name}</button>
          </form>

          <p><em>Naviguez : "Va sur la liste [nom]" | Validez : "Valider [tâche]"</em></p>
          
          <ul>
            {activeList.tasks.map(task => (
              <li key={task.id}>
                {task.id}. {task.text} {task.done && '✅'}
              </li>
            ))}
          </ul>

          {activeList.tasks.length > 0 && (
            <button onClick={handleClearTasks}>Vider cette liste</button>
          )}
        </div>
      ) : (
        <p>Veuillez créer ou sélectionner une liste.</p>
      )}

      <div>
        <br />
        <strong>Ce que l'app entend :</strong> 
        <p>{transcript}</p>
      </div>
    </div>
  );
}