import React, { useState, useEffect } from 'react';

// Initialize the native browser API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = SpeechRecognition ? new SpeechRecognition() : null;

if (mic) {
  mic.continuous = true;
  mic.interimResults = true;
  mic.lang = 'fr-FR';
}

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Préparer les ingrédients', done: false },
    { id: 2, text: 'Allumer le four', done: false },
    { id: 3, text: 'Mélanger la préparation', done: false }
  ]);

  useEffect(() => {
    if (!mic) return;
    
    mic.onstart = () => setIsListening(true);
    mic.onend = () => setIsListening(false);
    mic.onresult = (event) => {
      const currentTranscript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      setTranscript(currentTranscript.toLowerCase());
      checkCommands(currentTranscript.toLowerCase());
    };
  }, []);

  // Logic engine: search for keywords in the spoken phrase
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
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, done: true } : task
    ));
  };

  const startListening = () => {
    if (mic) mic.start();
  };

  const stopListening = () => {
    if (mic) mic.stop();
  };

  if (!mic) return <div>Votre navigateur ne supporte pas la reconnaissance vocale (Utilisez Chrome).</div>;

  return (
    <div>
      <h1>Checklist Mains-Libres 🎤</h1>
      
      <div>
        <button onClick={isListening ? stopListening : startListening}>
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
        <strong>Ce que l'app entend :</strong> {transcript}
      </div>
    </div>
  );
}