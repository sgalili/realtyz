DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.charge_lead_commission(uuid,integer,uuid,uuid)'::regprocedure);
  IF position('v_net:=greatest(round((CASE WHEN c.tier<_tier' in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected commission function definition';
  END IF;
  definition := replace(definition,
    'v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);',
    'v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);');
  definition := replace(definition,
    'v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);',
    'v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);');
  definition := replace(definition,
    'IF c.is_leftover THEN RETURN',
    'IF c.is_leftover THEN RETURN');
  definition := replace(definition,
    'v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);',
    'v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);');
  definition := replace(definition,
    'v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);',
    'v_net:=greatest(round((c.gross+CASE WHEN c.tier<_tier THEN v_delta ELSE 0 END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);');
  EXECUTE definition;
END;
$migration$;