import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, activeProvider, provider, model } = body;

    switch (action) {
      case 'setActiveProvider':
        // First try to update, if no rows affected, then insert
        const { data: updateResult, error: updateError } = await supabase
          .from('maya_settings')
          .update({
            value: activeProvider,
            updated_at: new Date().toISOString()
          })
          .eq('key', 'active_llm_provider')
          .select();

        if (updateError) {
          throw new Error(`Failed to update active provider: ${updateError.message}`);
        }

        // If no rows were updated, insert a new one
        if (!updateResult || updateResult.length === 0) {
          const { error: insertError } = await supabase
            .from('maya_settings')
            .insert({
              key: 'active_llm_provider',
              value: activeProvider,
              updated_at: new Date().toISOString()
            });

          if (insertError) {
            throw new Error(`Failed to insert active provider: ${insertError.message}`);
          }
        }

        // Notify memory worker of the change
        const notificationResult = await notifyMemoryWorker('provider', { provider: activeProvider });

        return NextResponse.json({ 
          success: true, 
          message: `Active provider set to ${activeProvider}`,
          memoryWorkerNotified: notificationResult.success,
          memoryWorkerError: notificationResult.error
        });

      case 'setModel':
        // First try to update, if no rows affected, then insert
        const modelKey = `${provider}_model`;
        const { data: modelUpdateResult, error: modelUpdateError } = await supabase
          .from('maya_settings')
          .update({
            value: model,
            updated_at: new Date().toISOString()
          })
          .eq('key', modelKey)
          .select();

        if (modelUpdateError) {
          throw new Error(`Failed to update model: ${modelUpdateError.message}`);
        }

        // If no rows were updated, insert a new one
        if (!modelUpdateResult || modelUpdateResult.length === 0) {
          const { error: modelInsertError } = await supabase
            .from('maya_settings')
            .insert({
              key: modelKey,
              value: model,
              updated_at: new Date().toISOString()
            });

          if (modelInsertError) {
            throw new Error(`Failed to insert model setting: ${modelInsertError.message}`);
          }
        }

        // Notify memory worker of the change
        const modelNotificationResult = await notifyMemoryWorker('model', { provider, model });

        return NextResponse.json({ 
          success: true, 
          message: `Model for ${provider} set to ${model}`,
          memoryWorkerNotified: modelNotificationResult.success,
          memoryWorkerError: modelNotificationResult.error
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error updating LLM settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update LLM settings' },
      { status: 500 }
    );
  }
}

async function notifyMemoryWorker(type: 'provider' | 'model', data: any) {
  try {
    const memoryWorkerUrl = process.env.MEMORY_WORKER_URL || 'http://localhost:3002';
    
    const response = await fetch(`${memoryWorkerUrl}/api/llm-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        ...data
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Failed to notify memory worker: ${response.status} - ${errorText}`);
      return { success: false, error: `Memory worker responded with ${response.status}` };
    } else {
      console.log(`Successfully notified memory worker of ${type} change`);
      return { success: true };
    }
  } catch (error) {
    console.warn('Could not notify memory worker of settings change:', error);
    return { success: false, error: 'Memory worker not reachable' };
  }
}