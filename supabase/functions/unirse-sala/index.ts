import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { nombre_jugador, codigo_sala } = await req.json();

    if (!nombre_jugador || !codigo_sala) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos: nombre_jugador y codigo_sala' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Buscar la sala por código
    const { data: sala, error: salaError } = await supabase
      .from('salas')
      .select('*')
      .eq('codigo', codigo_sala)
      .single();

    if (salaError) {
      return new Response(
        JSON.stringify({ error: 'Sala no encontrada' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar que la sala está en estado "esperando"
    if (sala.estado !== 'esperando') {
      return new Response(
        JSON.stringify({ error: 'La sala ya inició la partida o fue cerrada' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Contar jugadores en la sala
    const { data: jugadores, error: conteoError } = await supabase
      .from('jugadores')
      .select('id', { count: 'exact' })
      .eq('sala_id', sala.id);

    if (conteoError) throw conteoError;

    const cantidadJugadores = jugadores?.length || 0;

    // Validar que hay lugar para más jugadores (máximo 10)
    if (cantidadJugadores >= 10) {
      return new Response(
        JSON.stringify({ error: 'La sala está llena (máximo 10 jugadores)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Agregar el nuevo jugador
    const { data: nuevoJugador, error: jugadorError } = await supabase
      .from('jugadores')
      .insert({
        sala_id: sala.id,
        nombre: nombre_jugador,
        balance: sala.apuesta_inicial,
        orden: cantidadJugadores, // orden secuencial entre 0 y 9
        activo: true,
      })
      .select()
      .single();

    if (jugadorError) throw jugadorError;

    return new Response(
      JSON.stringify({ sala, jugador: nuevoJugador }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error en unirse-sala:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
