import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { sala_id, jugador_id, turno_id } = await req.json();

    if (!sala_id || !jugador_id || !turno_id) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos: sala_id, jugador_id, turno_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const [{ data: sala, error: salaError }, { data: turno, error: turnoError }] = await Promise.all([
      supabase.from('salas').select('id, estado').eq('id', sala_id).single(),
      supabase.from('turnos').select('id, sala_id, jugador_id, resultado').eq('id', turno_id).single(),
    ]);

    if (salaError || !sala) {
      return new Response(JSON.stringify({ error: 'Sala no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (turnoError || !turno) {
      return new Response(JSON.stringify({ error: 'Turno no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (turno.sala_id !== sala_id) {
      return new Response(JSON.stringify({ error: 'El turno no pertenece a la sala enviada' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (turno.jugador_id !== jugador_id) {
      return new Response(JSON.stringify({ error: 'Solo el jugador del turno puede confirmar' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!turno.resultado || turno.resultado === 'paso') {
      return new Response(JSON.stringify({ error: 'Este turno no requiere confirmacion de resultado' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (sala.estado === 'terminada') {
      return new Response(JSON.stringify({ ok: true, estado: 'terminada' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabase
      .from('salas')
      .update({ estado: 'jugando' })
      .eq('id', sala_id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, estado: 'jugando' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('confirmar-turno-resultado error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
