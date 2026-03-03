// Deno runtime types (basic)
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    toObject(): Record<string, string>;
  };
}

// Database types for the app
export interface MayaMemory {
  id: string;
  content: string;
  embedding: number[] | null;
  embedding_model: string | null;
  embedding_dimension: number | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  message_id: string | null;
  is_ai: boolean;
} 