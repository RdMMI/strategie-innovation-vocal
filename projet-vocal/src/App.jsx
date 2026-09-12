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
  
  // Initialize state from localStorage if available, otherwise use default
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

  // Save tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('voice-checklist-tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Use useRef to keep a stable reference to the speech API
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  
  // Keep a ref of tasks so the voice engine always has the latest list
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
      const currentTranscript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      setTranscript(currentTranscript);
      checkCommands(currentTranscript);
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

      // Pass 1: Check by text first to prevent number collisions
      tasksRef.current.forEach(task => {
        const taskTextClean = normalizeText(task.text);
        if (remainingSpeech.includes(taskTextClean)) {
          // Check if it's not already done before speaking
          if (!task.done) {
            toggleTask(task.id);
            speakText(`${task.text}, validé.`);
          }
          // Remove the matched text from the string so its numbers don't trigger IDs
          remainingSpeech = remainingSpeech.replace(taskTextClean, "");
        }
      });

      // Pass 2: Check by ID using exact word matching to avoid substring collisions
      const spokenWords = remainingSpeech.split(/\s+/); // Splits sentence into exact words

      tasksRef.current.forEach(task => {
        const idWords = getNumberWords(task.id);
        
        // Look for an exact match in the array of spoken words
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

  // Handler to add a new task from the input
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    // Create a new ID automatically based on the highest existing ID
    const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
    setTasks(prev => [...prev, { id: newId, text: newTaskText, done: false }]);
    setNewTaskText('');
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

      {/* Form to add a new task */}
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

      <div>
        <strong>Ce que l'app entend :</strong> 
        <p>{transcript}</p>
      </div>
    </div>
  );
}