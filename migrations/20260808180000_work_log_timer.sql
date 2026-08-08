-- ===================================================================
-- Work Log Timer: suporte a iniciar/pausar/finalizar com revisao manual
-- ===================================================================

-- Adiciona colunas para controle de timer
ALTER TABLE public.ticket_work_logs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'finished'
    CHECK (status IN ('running', 'paused', 'finished')),
  ADD COLUMN IF NOT EXISTS total_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_resumed_at TIMESTAMPTZ;

-- Indice para buscar timers em andamento por usuario
CREATE INDEX IF NOT EXISTS idx_ticket_work_logs_running
  ON public.ticket_work_logs (user_id, status)
  WHERE status IN ('running', 'paused');

-- ===================================================================
-- RPC: Pausar work log — calcula tempo decorrido e aguarda revisao
-- ===================================================================
CREATE OR REPLACE FUNCTION public.pause_work_log(
  p_log_id UUID,
  p_user_id UUID
)
RETURNS TABLE(
  id UUID,
  elapsed_seconds INT,
  total_seconds INT,
  started_at TIMESTAMPTZ,
  last_resumed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log public.ticket_work_logs;
  v_elapsed INT := 0;
BEGIN
  SELECT * INTO v_log FROM public.ticket_work_logs WHERE id = p_log_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work log nao encontrado';
  END IF;

  IF v_log.status != 'running' THEN
    RAISE EXCEPTION 'Work log nao esta em execucao';
  END IF;

  -- Calcula segundos decorridos desde o ultimo resume (ou inicio)
  v_elapsed := EXTRACT(EPOCH FROM (now() - COALESCE(v_log.last_resumed_at, v_log.started_at)))::INT;

  -- Atualiza o work log: pausa o timer, acumula tempo
  UPDATE public.ticket_work_logs
  SET
    status = 'paused',
    total_seconds = total_seconds + v_elapsed,
    last_resumed_at = NULL
  WHERE id = p_log_id;

  RETURN QUERY
  SELECT
    p_log_id,
    v_elapsed,
    v_log.total_seconds + v_elapsed,
    v_log.started_at,
    v_log.last_resumed_at;
END;
$$;

-- ===================================================================
-- RPC: Retomar work log pausado
-- ===================================================================
CREATE OR REPLACE FUNCTION public.resume_work_log(
  p_log_id UUID,
  p_user_id UUID
)
RETURNS TABLE(id UUID, total_seconds INT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log public.ticket_work_logs;
BEGIN
  SELECT * INTO v_log FROM public.ticket_work_logs WHERE id = p_log_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work log nao encontrado';
  END IF;

  IF v_log.status != 'paused' THEN
    RAISE EXCEPTION 'Work log nao esta pausado';
  END IF;

  UPDATE public.ticket_work_logs
  SET
    status = 'running',
    last_resumed_at = now()
  WHERE id = p_log_id;

  RETURN QUERY
  SELECT p_log_id, v_log.total_seconds, 'running'::TEXT;
END;
$$;

-- ===================================================================
-- RPC: Finalizar work log — calcula tempo final e aguarda revisao
-- ===================================================================
CREATE OR REPLACE FUNCTION public.finish_work_log(
  p_log_id UUID,
  p_user_id UUID,
  p_adjusted_minutes INT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  elapsed_seconds INT,
  total_seconds INT,
  total_minutes INT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log public.ticket_work_logs;
  v_elapsed INT := 0;
  v_total INT := 0;
  v_minutes INT := 0;
BEGIN
  SELECT * INTO v_log FROM public.ticket_work_logs WHERE id = p_log_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work log nao encontrado';
  END IF;

  IF v_log.status = 'finished' THEN
    RAISE EXCEPTION 'Work log ja finalizado';
  END IF;

  -- Se estava running, calcula tempo decorrido ate agora
  IF v_log.status = 'running' THEN
    v_elapsed := EXTRACT(EPOCH FROM (now() - COALESCE(v_log.last_resumed_at, v_log.started_at)))::INT;
  END IF;

  v_total := v_log.total_seconds + v_elapsed;

  -- Se minutos ajustados foram fornecidos, usa eles; senao usa o calculado
  IF p_adjusted_minutes IS NOT NULL THEN
    v_minutes := p_adjusted_minutes;
    v_total := p_adjusted_minutes * 60;
  ELSE
    v_minutes := v_total / 60;
    -- Arredonda para cima se sobrou mais de 30 segundos
    IF v_total % 60 > 30 THEN
      v_minutes := v_minutes + 1;
    END IF;
  END IF;

  -- Atualiza o work log: finaliza com tempo confirmado
  UPDATE public.ticket_work_logs
  SET
    status = 'finished',
    total_seconds = v_total,
    minutes_worked = v_minutes,
    ended_at = now(),
    last_resumed_at = NULL
  WHERE id = p_log_id;

  RETURN QUERY
  SELECT
    p_log_id,
    v_elapsed,
    v_total,
    v_minutes,
    v_log.started_at,
    now(),
    'finished'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pause_work_log(UUID, UUID) TO app_login;
GRANT EXECUTE ON FUNCTION public.pause_work_log(UUID, UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.resume_work_log(UUID, UUID) TO app_login;
GRANT EXECUTE ON FUNCTION public.resume_work_log(UUID, UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.finish_work_log(UUID, UUID, INT) TO app_login;
GRANT EXECUTE ON FUNCTION public.finish_work_log(UUID, UUID, INT) TO app_runtime;
