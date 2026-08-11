CREATE TABLE public.user_sync (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sync TO authenticated;
GRANT ALL ON public.user_sync TO service_role;

ALTER TABLE public.user_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sync bundle"
  ON public.user_sync FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER user_sync_updated_at
  BEFORE UPDATE ON public.user_sync
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();