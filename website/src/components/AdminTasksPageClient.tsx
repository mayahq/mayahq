'use client';

import { useState } from 'react';
import TaskInput from '@/components/TaskInput';
import TaskList from '@/components/TaskList';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminTasksPageClient() {
  const { user, loading: authLoading, supabase } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  
  const handleTaskAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const testDirectTaskCreation = async () => {
    if (!user) {
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
          message: 'Test task created via debug API (admin)',
          userId: user.id,
          tags: ['debug', 'admin', 'test']
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

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Task Management</h1>
        <p className="text-gray-400 mt-2">Manage your tasks and stay organized</p>
      </div>
      
      {authLoading && (
        <div className="flex justify-center items-center h-32">
          <p>Loading user information...</p>
        </div>
      )}

      {!authLoading && !user && (
        <div className="flex justify-center items-center h-32">
          <p>Please log in to manage tasks.</p>
        </div>
      )}

      {!authLoading && user && (
        <div className="flex flex-col gap-8">
          <div>
            <TaskInput onTaskAdded={handleTaskAdded} darkMode={true} />
          </div>
          
          <div>
            <TaskList key={refreshTrigger} darkMode={true} />
          </div>
        </div>
      )}
    </div>
  );
} 