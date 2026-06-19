import { z } from 'zod';
import { join } from 'path';

const envSchema = z.object({
  RAG_DATABASE_URL: z.string().default('postgresql://rai:rai@localhost:5433/rai_rag'),
  RAG_STORAGE_DIR: z.string().default(''),
  RAG_TOP_K: z.coerce.number().default(5),

  OPENAI_API_KEY: z.string().default(''),
  EMBEDDINGS_PROVIDER: z.enum(['openai', 'local', 'litellm']).default('local'),
  EMBEDDING_DIM: z.coerce.number().default(1536),
  LITELLM_BASE_URL: z.string().default(''),
  LITELLM_MASTER_KEY: z.string().default(''),

  DOC_PARSE_MODEL: z.string().default(''),
  DOC_PARSE_VISION_MODE: z.enum(['auto', 'always', 'off']).default('auto'),
  DOC_PARSE_MAX_PAGES: z.coerce.number().default(30),
  DOC_PARSE_TIMEOUT_MS: z.coerce.number().default(60000),
  GOTENBERG_BASE_URL: z.string().default(''),
});

export type RagConfig = ReturnType<typeof loadRagConfig>;

export function loadRagConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  return {
    databaseUrl: parsed.RAG_DATABASE_URL,
    storageDir: parsed.RAG_STORAGE_DIR || join(__dirname, '../../..', 'storage/rag'),
    topK: parsed.RAG_TOP_K,
    openaiApiKey: parsed.OPENAI_API_KEY,
    embeddingsProvider: parsed.EMBEDDINGS_PROVIDER,
    embeddingDim: parsed.EMBEDDING_DIM,
    litellmBaseUrl: parsed.LITELLM_BASE_URL,
    litellmMasterKey: parsed.LITELLM_MASTER_KEY,
    docParseModel: parsed.DOC_PARSE_MODEL,
    docParseVisionMode: parsed.DOC_PARSE_VISION_MODE,
    docParseMaxPages: parsed.DOC_PARSE_MAX_PAGES,
    docParseTimeoutMs: parsed.DOC_PARSE_TIMEOUT_MS,
    gotenbergBaseUrl: parsed.GOTENBERG_BASE_URL,
  };
}

export const RAG_CONFIG = Symbol('RAG_CONFIG');
