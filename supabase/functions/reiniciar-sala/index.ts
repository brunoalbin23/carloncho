import { createClient } from 'jsr:@supabase/supabase-js@2';

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

    const { data: sala, error: salaError } = await supabase
      .from('salas')
      .select('*')
      .eq('id', sala_id)
      .single();

    if (salaError || !sala) {
      return new Response(
        JSON.stringify({ error: 'Sala no encontrada' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: host, error: hostError } = await supabase
      .from('jugadores')
      .select('id, orden, sala_id, activo')
      .eq('id', jugador_id)
      .eq('sala_id', sala_id)
      .single();

    if (hostError || !host) {
      return new Response(
        JSON.stringify({ error: 'Jugador no encontrado en esta sala' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let isHost = false;
    if (sala.host_id) {
      isHost = sala.host_id === jugador_id;
    } else {
      const { data: firstPlayer, error: firstPlayerError } = await supabase
        .from('jugadores')
        .select('id')
        .eq('sala_id', sala_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (firstPlayerError || !firstPlayer) {
        return new Response(
          JSON.stringify({ error: 'No se pudo determinar el anfitrion de la sala' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      isHost = firstPlayer.id === jugador_id;
    }

    if (!isHost) {
      return new Response(
        JSON.stringify({ error: 'Solo el anfitrion puede reiniciar la sala' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: jugadoresActivos, error: jugadoresError } = await supabase
      .from('jugadores')
      .select('id')
      .eq('sala_id', sala_id)
      .neq('activo', false);

    if (jugadoresError) throw jugadoresError;

    const cantidadJugadores = jugadoresActivos?.length ?? 0;
    if (cantidadJugadores < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 jugadores activos para nueva ronda' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pozoNuevo = (sala.apuesta_inicial as number) * cantidadJugadores;

    const { error: deleteTurnosError } = await supabase.from('turnos').delete().eq('sala_id', sala_id);
    if (deleteTurnosError) throw deleteTurnosError;

    const { error: resetJugadoresError } = await supabase
      .from('jugadores')
      .update({ balance: 0 })
      .eq('sala_id', sala_id);
    if (resetJugadoresError) throw resetJugadoresError;

    const { data: salaActualizada, error: updateSalaError } = await supabase
      .from('salas')
      .update({ pozo: pozoNuevo, turno_actual: 0, estado: 'jugando' })
      .eq('id', sala_id)
      .select('*')
      .single();

    if (updateSalaError || !salaActualizada) throw updateSalaError;

    return new Response(JSON.stringify({ sala: salaActualizada }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('reiniciar-sala error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});