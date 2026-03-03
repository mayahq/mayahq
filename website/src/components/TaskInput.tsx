'use client';

import { useState, useEffect } from 'react';
import { extractTasksFromMessage } from '@/lib/db/tasks';
import { useAuth } from '@/contexts/AuthContext';

interface TaskInputProps {
  onTaskAdded?: () => void;
  initialTags?: string[];
  darkMode?: boolean;
}

export default function TaskInput({ onTaskAdded, initialTags = [], darkMode = false }: TaskInputProps) {
  const { user, supabase, loading: authLoading } = useAuth();
  const [taskInput, setTaskInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (authLoading) {
      setError('Authentication check in progress...');
      return;
    }
    if (!user || !supabase) {
      setError('You must be logged in to add tasks');
      return;
    }
    
    if (!taskInput.trim()) {
      setError('Task cannot be empty');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Submitting task:', { message: taskInput, userId: user.id, tags });
      const taskId = await extractTasksFromMessage(supabase, taskInput, user.id, tags);
      console.log('Response from extractTasksFromMessage:', taskId);
      
      if (taskId) {
        setTaskInput('');
        if (onTaskAdded) {
          onTaskAdded();
        }
      } else {
        setError('Failed to add task. The server did not return a task ID.');
      }
    } catch (err) {
      console.error('Error adding task:', err);
      // Simplified error message for users - technical details are in the console
      setError('Failed to add task. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className={`w-full p-3 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white'} rounded-lg shadow`}>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <textarea
            className={`w-full p-2 border ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300'} rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
            rows={2}
            placeholder="What do you need to do? e.g., Meeting with team Thursday 2pm"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            disabled={isLoading || authLoading}
          />
        </div>
        
        {error && (
          <div className={`mb-3 text-sm p-2 rounded-md ${darkMode ? 'text-red-300 bg-red-900/20 border border-red-900/30' : 'text-red-600 bg-red-50 border border-red-200'}`}>
            {error}
          </div>
        )}
        
        <div className="mb-3">
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map(tag => (
              <div key={tag} className={`flex items-center rounded-md text-xs ${
                darkMode ? 'bg-blue-900/30 text-blue-300 border border-blue-700/50' : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                <span className="px-1.5 py-0.5">{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className={`ml-1 mr-1 rounded-full w-4 h-4 flex items-center justify-center text-xs ${
                    darkMode ? 'hover:bg-blue-800 text-blue-400' : 'hover:bg-blue-200 text-blue-500'
                  }`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              className={`flex-1 p-1.5 border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
              placeholder="Add a tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              disabled={isLoading || authLoading}
            />
            <button
              type="button"
              onClick={addTag}
              className={`px-3 py-1.5 rounded-md transition-colors text-sm ${
                darkMode 
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600' 
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400'
              }`}
              disabled={isLoading || authLoading || !tagInput.trim()}
            >
              Add Tag
            </button>
          </div>
        </div>
        
        <div className="flex sm:justify-end mt-1">
          <button
            type="submit"
            className={`w-full sm:w-auto justify-center px-3 py-1.5 rounded-md transition-colors text-sm ${
              darkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-900/50 disabled:text-blue-300/50'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:text-white/70'
            }`}
            disabled={isLoading || authLoading || !taskInput.trim()}
          >
            {isLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding...
              </span>
            ) : 'Add Task'}
          </button>
        </div>
      </form>
    </div>
  );
} 