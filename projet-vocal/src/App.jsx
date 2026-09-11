import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Préparer les ingrédients', done: false },
    { id: 2, text: 'Allumer le four', done: false },
    { id: 3, text: 'Mélanger la préparation', done: false }
  ]);

  // Use useRef to keep a stable reference to the speech API and the user's intent
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);

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
      
      setTranscript(currentTranscript.toLowerCase());
      checkCommands(currentTranscript.toLowerCase());
    };

    // Solution for the microphone cutting off: restart it automatically if it stops
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

    // Cleanup when the component is unmounted
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []); // The useEffect runs only once on mount

  const checkCommands = (text) => {
    if (text.includes('valider') || text.includes('terminer')) {
      if (text.includes('un') || text.includes('1')) {
        toggleTask(1);
      } else if (text.includes('deux') || text.includes('2')) {
        toggleTask(2);
      } else if (text.includes('trois') || text.includes('3')) {
        toggleTask(3);
      }
    }
  };

  const toggleTask = (id) => {
    // Solution to the crash: use the previous state (prevTasks) to always be up to date
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

      <p><em>Dites par exemple : "Valider la tâche deux"</em></p>
      
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