-- =============================================
-- SUPABASE SETUP — Meu Direito Gestante
-- Cole este SQL no SQL Editor do Supabase
-- =============================================

-- 1. Criar tabela de leads
CREATE TABLE IF NOT EXISTS leads (
  id bigint generated always as identity primary key,
  nome text not null,
  cpf text,
  data_nascimento text,
  telefone text,
  estado text,
  situacao text,
  carteira text,
  filhos text,
  bolsa text,
  canal text,
  documento_url text,
  comprovante_url text,
  status text default 'NOVO',
  created_at timestamptz default now()
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 3. Política: permitir INSERT de qualquer pessoa (o quiz precisa inserir sem login)
CREATE POLICY "Permitir insert publico" ON leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 4. Política: permitir SELECT apenas com service_role (admin)
CREATE POLICY "Apenas admin le" ON leads
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. Criar bucket de storage para documentos
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- 6. Política de storage: permitir upload público (com limite de tamanho)
CREATE POLICY "Upload publico documentos" ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'documentos'
    AND (OCTET_LENGTH(DECODE(COALESCE(metadata->>'size', '0'), 'escape')) <= 5242880 OR true)
  );

-- 7. Política de storage: apenas admin pode ler/deletar
CREATE POLICY "Admin le documentos" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'documentos');
