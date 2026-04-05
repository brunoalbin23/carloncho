import { createClient } from 'jsr:@supabase/supabase-js@2';

function isMissingHostIdColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (msg.includes('host_id') && msg.includes('column'))
  );
}

function buildCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeNames(names: string[]): string[] {
  return names.map((n) => n.trim().toLowerCase()).sort();
}

function sameNames(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  try {
    const { sala_id, jugador_id } = await req.json();

    if (!sala_id || !jugador_id) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos: sala_id y jugador_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const [{ data: sala, error: salaError }, { data: jugadorActual, error: jugadorActualError }] = await Promise.all([
      supabase.from('salas').select('*').eq('id', sala_id).single(),
      supabase.from('jugadores').select('*').eq('id', jugador_id).eq('sala_id', sala_id).single(),
    ]);

    if (salaError || !sala) {
      return new Response(JSON.stringify({ error: 'Sala no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (jugadorActualError || !jugadorActual) {
      return new Response(JSON.stringify({ error: 'Jugador no encontrado en esta sala' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cualquier jugador de esta sala puede crear su nueva ronda rapida.

    const { data: jugadoresViejos, error: jugadoresError } = await supabase
      .from('jugadores')
      .select('id, nombre, orden, activo')
      .eq('sala_id', sala_id)
      .order('orden', { ascending: true });

    if (jugadoresError) throw jugadoresError;

    const jugadoresBase = (jugadoresViejos ?? []).filter((j: { activo?: boolean }) => j.activo !== false);

    if (jugadoresBase.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 jugadores activos para nueva ronda' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const wantedNames = normalizeNames(jugadoresBase.map((j: { nombre: string }) => j.nombre));

    // Si ya existe una sala de nueva ronda con el mismo grupo, reutilizarla.
    const { data: salasEsperando, error: salasEsperandoError } = await supabase
      .from('salas')
      .select('id, codigo, estado')
      .eq('estado', 'esperando')
      .neq('id', sala_id)
      .limit(50);

    if (salasEsperandoError) throw salasEsperandoError;

    for (const salaCand of salasEsperando ?? []) {
      const { data: jugadoresCand, error: jugadoresCandError } = await supabase
        .from('jugadores')
        .select('id, nombre, orden, activo')
        .eq('sala_id', salaCand.id);

      if (jugadoresCandError || !jugadoresCand) continue;

      const candActivos = jugadoresCand.filter((j: { activo?: boolean }) => j.activo !== false);
      const candNames = normalizeNames(candActivos.map((j: { nombre: string }) => j.nombre));

      if (!sameNames(wantedNames, candNames)) continue;

      const jugadorByName = candActivos.find((j: { nombre: string }) => j.nombre === jugadorActual.nombre);
      const jugadorByOrder = candActivos.find((j: { orden: number }) => j.orden === jugadorActual.orden);
      const jugadorCand = jugadorByName ?? jugadorByOrder;

      if (!jugadorCand) continue;

      return new Response(
        JSON.stringify({
          sala: salaCand,
          jugador: jugadorCand,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let codigo = buildCodigo();
    for (let i = 0; i < 8; i++) {
      const { data: existing } = await supabase.from('salas').select('id').eq('codigo', codigo).maybeSingle();
      if (!existing) break;
      codigo = buildCodigo();
    }

    const apuestaInicial = Number(sala.apuesta_inicial ?? 10);

    const { data: salaNueva, error: salaNuevaError } = await supabase
      .from('salas')
      .insert({
        codigo,
        estado: 'esperando',
        apuesta_inicial: apuestaInicial,
        pozo: apuestaInicial,
        turno_actual: 0,
      })
      .select('*')
      .single();

    if (salaNuevaError || !salaNueva) throw salaNuevaError;

    const nuevosJugadoresPayload = jugadoresBase.map((j: { nombre: string; orden: number }) => ({
      sala_id: salaNueva.id,
      nombre: j.nombre,
      balance: 0,
      orden: j.orden,
      activo: true,
    }));

    const { data: jugadoresNuevos, error: insertJugadoresError } = await supabase
      .from('jugadores')
      .insert(nuevosJugadoresPayload)
      .select('*');

    if (insertJugadoresError || !jugadoresNuevos) throw insertJugadoresError;

    const jugadorLlamadorOrden = jugadorActual.orden as number;
    const jugadorNuevo = jugadoresNuevos.find((j: { orden: number }) => j.orden === jugadorLlamadorOrden);

    if (!jugadorNuevo) {
      return new Response(JSON.stringify({ error: 'No se pudo mapear jugador en la nueva ronda' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hostNuevo = jugadorNuevo;

    if (hostNuevo) {
      const { error: hostUpdateError } = await supabase
        .from('salas')
        .update({ host_id: hostNuevo.id })
        .eq('id', salaNueva.id);

      if (hostUpdateError && !isMissingHostIdColumn(hostUpdateError)) {
        throw hostUpdateError;
      }
    }

    return new Response(
      JSON.stringify({
        sala: salaNueva,
        jugador: jugadorNuevo,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('nueva-ronda error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
