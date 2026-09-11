import React, { useState, useEffect, useRef } from 'react';

// Helper to remove accents and make lowercase
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// Helper to map numbers to their word equivalents
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
    10: ['10', 'dix']
  };
  return map[num] || [num.toString()];
};

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Préparer les ingrédients', done: false },
    { id: 2, text: 'Allumer le four', done: false },
    { id: 3, text: 'Mélanger la préparation', done: false }
  ]);

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
      // Loop through all tasks to check for matches
      tasksRef.current.forEach(task => {
        const taskTextClean = normalizeText(task.text);
        const idWords = getNumberWords(task.id);
        
        // Check if the phrase contains the task number
        const matchById = idWords.some(word => spokenClean.includes(word));
        
        // Check if the phrase contains the exact task name
        const matchByText = spokenClean.includes(taskTextClean);

        if (matchById || matchByText) {
          toggleTask(task.id);
        }
      });
    }
  };

  const toggleTask = (id) => {
    setTasks(prevTasks => prevTasks.map(task => 
      task.id === id ? { ...task, done: true } : task
    ));
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

      <p><em>Dites par exemple : "Valider la tâche 1" OU "Valider [nom de la tâche]"</em></p>
      
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