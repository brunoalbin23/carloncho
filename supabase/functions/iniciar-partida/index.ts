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

Deno.serve(async (req) => {
  try {
    const { sala_id, jugador_id, apuesta_inicial } = await req.json();

    if (!sala_id || !jugador_id) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos: sala_id y jugador_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apuestaInicialNum = Number(apuesta_inicial ?? 0);
    if (!Number.isInteger(apuestaInicialNum) || apuestaInicialNum <= 0) {
      return new Response(
        JSON.stringify({ error: 'apuesta_inicial debe ser entero positivo' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Traer la sala
    const { data: sala, error: salaError } = await supabase
      .from('salas')
      .select('*')
      .eq('id', sala_id)
      .single();

    if (salaError) {
      return new Response(
        JSON.stringify({ error: 'Sala no encontrada' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar que ya no está en juego
    if (sala.estado !== 'esperando') {
      return new Response(
        JSON.stringify({ error: 'La sala ya inició' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Traer el jugador que intenta iniciar
    const { data: jugador, error: jugadorError } = await supabase
      .from('jugadores')
      .select('*')
      .eq('id', jugador_id)
      .eq('sala_id', sala_id)
      .single();

    if (jugadorError) {
      return new Response(
        JSON.stringify({ error: 'Jugador no encontrado' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar anfitrion por host_id (con fallback legacy a orden 0).
    const isHost = sala.host_id ? sala.host_id === jugador_id : jugador.orden === 0;
    if (!isHost) {
      return new Response(
        JSON.stringify({ error: 'Solo el host puede iniciar la partida' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Traer jugadores de la sala para conteo y orden aleatorio.
    const { data: jugadores, error: conteoError } = await supabase
      .from('jugadores')
      .select('id')
      .eq('sala_id', sala_id);

    if (conteoError) throw conteoError;

    const cantidadJugadores = jugadores?.length || 0;

    // Validar que hay al menos 2 jugadores
    if (cantidadJugadores < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 jugadores para iniciar' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pozoInicial = apuestaInicialNum * cantidadJugadores;

    // Orden aleatorio para el inicio de partida.
    const jugadoresIds = (jugadores ?? []).map((j: { id: string }) => j.id);
    const ordenAleatorio = [...jugadoresIds].sort(() => Math.random() - 0.5);

    for (let i = 0; i < ordenAleatorio.length; i++) {
      const idJugador = ordenAleatorio[i];
      const { error: ordenError } = await supabase
        .from('jugadores')
        .update({ orden: i })
        .eq('id', idJugador)
        .eq('sala_id', sala_id);

      if (ordenError) throw ordenError;
    }

    // En Sprint 4, balance representa ganancias netas, arranca en 0.
    const { error: updateError } = await supabase
      .from('jugadores')
      .update({ balance: 0 })
      .eq('sala_id', sala_id);

    if (updateError) throw updateError;

    const updateBase = {
      estado: 'jugando',
      turno_actual: 0,
      apuesta_inicial: apuestaInicialNum,
      pozo: pozoInicial,
    };

    // Cambiar estado de la sala a "jugando" y calcular pozo final.
    let salaActualizada: unknown = null;
    let updateSalaError: { code?: string; message?: string } | null = null;

    const tryWithHost = await supabase
      .from('salas')
      .update({ ...updateBase, host_id: jugador_id })
      .eq('id', sala_id)
      .select()
      .single();

    salaActualizada = tryWithHost.data;
    updateSalaError = tryWithHost.error;

    if (isMissingHostIdColumn(updateSalaError)) {
      const fallback = await supabase
        .from('salas')
        .update(updateBase)
        .eq('id', sala_id)
        .select()
        .single();

      salaActualizada = fallback.data;
      updateSalaError = fallback.error;
    }

    if (updateSalaError) throw updateSalaError;

    return new Response(
      JSON.stringify({ sala: salaActualizada }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error en iniciar-partida:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
