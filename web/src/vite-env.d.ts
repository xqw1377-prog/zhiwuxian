/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_LEGAL_OPERATOR?: string;
  readonly VITE_LEGAL_EMAIL?: string;
  readonly VITE_LEGAL_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
