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
    // Cut off any currently playing speech to avoid overlapping
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
  
  // FEATURE: Persistent Storage
  const [tasks, setTasks] = useState(() => {
    const savedTasks = localStorage.getItem('voice-checklist-tasks');
    if (savedTasks) {
      return JSON.parse(savedTasks);
    }
    return [
      { id: 1, text: 'Préparer les ingrédients', done: false },
      { id: 2, text: 'Allumer le four', done: false },
      { id: 3, text: 'Mélanger la préparation', done: false }
    ];
  });

  // FEATURE: Auto-save
  useEffect(() => {
    localStorage.setItem('voice-checklist-tasks', JSON.stringify(tasks));
  }, [tasks]);

  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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

      // FEATURE: Prevent premature triggers (Cascade bug fix)
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

  // Logic engine: search dynamically through the task list
  const checkCommands = (text) => {
    const spokenClean = normalizeText(text);
    const isValidating = spokenClean.includes('valider') || spokenClean.includes('validez') || spokenClean.includes('terminer');
    
    if (isValidating) {
      let remainingSpeech = spokenClean;

      // FEATURE: Anti-Collision Sorting
      const tasksSortedByLength = [...tasksRef.current].sort((a, b) => b.text.length - a.text.length);

      // Pass 1: Check by text first
      tasksSortedByLength.forEach(task => {
        const taskTextClean = normalizeText(task.text);
        
        // FEATURE: Space-Insensitive Matching
        // Transforms "test55" into a regex that matches "test 55" or "t e s t 5 5"
        const regexStr = taskTextClean
          .replace(/\s+/g, '') // Remove existing spaces
          .split('') // Split into individual characters
          .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape any special characters
          .join('\\s*'); // Allow 0 or multiple spaces between every character
          
        const flexibleRegex = new RegExp(regexStr, 'g');

        if (flexibleRegex.test(remainingSpeech)) {
          if (!task.done) {
            toggleTask(task.id);
            speakText(`${task.text}, validé.`);
          }
          // Remove the matched text (including its spaces) to prevent triggering shorter IDs
          remainingSpeech = remainingSpeech.replace(flexibleRegex, "");
        }
      });

      // Pass 2: Check by ID using exact word matching
      const spokenWords = remainingSpeech.split(/\s+/); 

      tasksRef.current.forEach(task => {
        const idWords = getNumberWords(task.id);
        const matchById = idWords.some(word => spokenWords.includes(word));

        if (matchById) {
          if (!task.done) {
            toggleTask(task.id);
            speakText(`${task.text}, validé.`);
          }
        }
      });
    }
  };

  const toggleTask = (id) => {
    setTasks(prevTasks => prevTasks.map(task => 
      task.id === id ? { ...task, done: true } : task
    ));
  };

  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
    setTasks(prev => [...prev, { id: newId, text: newTaskText, done: false }]);
    setNewTaskText('');
  };

  // FEATURE: Hard Reset
  const handleClearList = () => {
    if (window.confirm("Êtes-vous sûr de vouloir vider toute la liste ?")) {
      setTasks([]);
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

  return (
    <div>
      <h1>Checklist Mains-Libres 🎤</h1>
      
      <div>
        <button onClick={toggleListen}>
          {isListening ? 'Arrêter le micro' : 'Activer le micro'}
        </button>
      </div>

      <br />

      <form onSubmit={handleAddTask}>
        <input 
          type="text" 
          value={newTaskText} 
          onChange={(e) => setNewTaskText(e.target.value)} 
          placeholder="Ex: Nettoyer le plan de travail"
        />
        <button type="submit">Ajouter la tâche</button>
      </form>

      <p><em>Dites par exemple : "Valider [numéro de la tâche]" OU "Valider [nom de la tâche]"</em></p>
      
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            {task.id}. {task.text} {task.done && '✅'}
          </li>
        ))}
      </ul>

      {tasks.length > 0 && (
        <div>
          <br />
          <button onClick={handleClearList}>Vider la liste</button>
        </div>
      )}

      <div>
        <br />
        <strong>Ce que l'app entend :</strong> 
        <p>{transcript}</p>
      </div>
    </div>
  );
}