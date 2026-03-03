'use client';

import { useState } from 'react';
import TaskInput from '@/components/TaskInput';
import TaskList from '@/components/TaskList';
import { useAuth } from '@/contexts/AuthContext';

export default function TasksPageClient() {
  const { user, loading: authLoading, supabase } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  
  const handleTaskAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  
  const testDirectTaskCreation = async () => {
    if (authLoading) {
      setDebugMessage('Authentication check in progress...');
      return;
    }
    if (!user || !supabase) {
      setDebugMessage('You must be logged in to test task creation');
      return;
    }
    
    try {
      setDebugMessage('Testing direct task creation...');
      
      const response = await fetch('/api/debug/add-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Test task created via debug API',
          userId: user.id,
          tags: ['debug', 'test']
        }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setDebugMessage(`Task created successfully with ID: ${result.taskId} (method: ${result.method})`);
        handleTaskAdded();
      } else {
        setDebugMessage(`Error: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      setDebugMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Show loading state while authentication is being checked
  if (authLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Tasks</h1>
          <p className="text-gray-600">Please log in to view your tasks.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Tasks</h1>
      
      {/* Wrapper for TaskInput and TaskList to be full width */}
      <div className="w-full flex flex-col gap-8">
        <TaskInput onTaskAdded={handleTaskAdded} />
        <TaskList key={refreshTrigger} />
      </div>
      
      {/* Debug Controls */}
      <div className="mt-10 pt-6 border-t border-gray-200">
        <button 
          onClick={() => setIsDebugMode(!isDebugMode)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {isDebugMode ? 'Hide Debug Tools' : 'Show Debug Tools'}
        </button>
        
        {isDebugMode && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <h3 className="font-medium mb-3">Debug Tools</h3>
            
            <button
              onClick={testDirectTaskCreation}
              className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              disabled={authLoading}
            >
              Test Direct Task Creation
            </button>
            
            {debugMessage && (
              <div className="mt-3 p-3 bg-gray-200 rounded text-sm">
                {debugMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 