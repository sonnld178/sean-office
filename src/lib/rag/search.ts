import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SearchOpts = {
  table: "memory_chunks" | "cv_chunks";
  memoryId?: string;
  cvId?: string;
  topK?: number;
  userKey?: string;
};

export type MemoryHit = {
  id: string;
  memory_id: string;
  content: string;
  chunk_index: number;
  similarity: number;
};

export type CvHit = {
  id: string;
  cv_id: string;
  content: string;
  chunk_index: number;
  similarity: number;
};

export type SearchHit = MemoryHit | CvHit;

let adminClient: SupabaseClient | null | undefined;

function getAdmin(): SupabaseClient {
  if (adminClient !== undefined) {
    if (adminClient) return adminClient;
    throw new Error("Supabase not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    adminClient = null;
    throw new Error("Supabase not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  adminClient = createClient(url, key);
  return adminClient;
}

/**
 * Vector search via RPC (match_memory_chunks / match_cv_chunks).
 * Falls back to filtering by memoryId/cvId client-side if needed.
 */
export async function searchChunks(
  queryEmbedding: number[],
  opts: SearchOpts
): Promise<SearchHit[]> {
  const db = getAdmin();
  const topK = opts.topK ?? 5;
  const filterKey = opts.userKey ?? null;

  if (opts.table === "memory_chunks") {
    const { data, error } = await db.rpc("match_memory_chunks", {
      query_embedding: queryEmbedding as unknown as string,
      match_count: topK,
      filter_user_key: filterKey,
    });
    if (error) throw new Error(`match_memory_chunks failed: ${error.message}`);
    let rows = (data ?? []) as MemoryHit[];
    if (opts.memoryId) rows = rows.filter((r) => r.memory_id === opts.memoryId);
    return rows;
  }

  // cv_chunks
  const { data, error } = await db.rpc("match_cv_chunks", {
    query_embedding: queryEmbedding as unknown as string,
    match_count: topK,
    filter_user_key: filterKey,
  });
  if (error) throw new Error(`match_cv_chunks failed: ${error.message}`);
  let rows = (data ?? []) as CvHit[];
  if (opts.cvId) rows = rows.filter((r) => (r as CvHit).cv_id === opts.cvId);
  if (opts.memoryId) {
    // alias: memoryId used as cvId filter when caller passes generic id
    rows = rows.filter((r) => (r as CvHit).cv_id === opts.memoryId);
  }
  return rows;
}
