/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_DRAFT_CONTENT?: string;
  readonly VITE_PROVISIONAL_ART?: string;
  readonly VITE_ENABLE_DEBUG_TOOLS?: string;
  readonly VITE_ENABLE_TIMED_CHALLENGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
