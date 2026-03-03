import { SupabaseClient } from '@supabase/supabase-js';
import { Database, Message } from './types';

/**
 * Migrates chat messages from local storage to database
 */
export async function migrateLocalMessagesToDatabase(
  client: SupabaseClient<Database>,
  localMessages: any[],
  userId: string,
  roomId: string
) {
  // Transform local messages to database format
  const dbMessages = localMessages.map(msg => ({
    role: msg.role,
    content: msg.fullContent || msg.content,
    room_id: roomId,
    user_id: userId,
    metadata: {
      source: 'local_migration',
      original_timestamp: msg.timestamp || new Date().toISOString()
    }
  }));
  
  // Insert messages in batch
  return client
    .from('messages')
    .insert(dbMessages);
}

/**
 * Migrates user memories from one user ID to another
 */
export async function migrateMemories(
  client: SupabaseClient<Database>,
  sourceUserId: string,
  targetUserId: string
) {
  // Get memories for source user
  const { data: sourceFacts, error: factsError } = await client
    .from('maya_facts')
    .select('*')
    .eq('user_id', sourceUserId);
    
  if (factsError) throw factsError;
  
  // Get core facts for source user
  const { data: sourceCoreFacts, error: coreFactsError } = await client
    .from('maya_core_facts')
    .select('*')
    .eq('user_id', sourceUserId);
    
  if (coreFactsError) throw coreFactsError;
  
  // Update user_id for facts
  const factPromises = sourceFacts?.map(fact => {
    const { id, ...factData } = fact;
    return client
      .from('maya_facts')
      .insert({
        ...factData,
        user_id: targetUserId,
        source_ref: {
          type: 'migrated_fact',
          original_id: id,
          migrated_from: sourceUserId
        }
      });
  }) || [];
  
  // Update user_id for core facts
  const coreFactPromises = sourceCoreFacts?.map(fact => {
    const { id, ...factData } = fact;
    return client
      .from('maya_core_facts')
      .insert({
        ...factData,
        user_id: targetUserId,
        source_ref: {
          type: 'migrated_core_fact',
          original_id: id,
          migrated_from: sourceUserId
        }
      });
  }) || [];
  
  // Execute all promises
  await Promise.all([...factPromises, ...coreFactPromises]);
  
  return {
    factsCount: sourceFacts?.length || 0,
    coreFactsCount: sourceCoreFacts?.length || 0
  };
}

/**
 * Helper function to determine if a user should migrate data
 */
export function shouldMigrateData(
  oldUserId: string | null,
  newUserId: string
): boolean {
  return !!oldUserId && oldUserId !== newUserId;
} 