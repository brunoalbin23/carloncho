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
    const { nombre_jugador, apuesta_inicial } = await req.json();

    if (!nombre_jugador || !apuesta_inicial) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Generar código único de 6 dígitos
    const codigo = String(Math.floor(100000 + Math.random() * 900000));

    // Crear la sala
    const { data: sala, error: salaError } = await supabase
      .from('salas')
      .insert({ codigo, apuesta_inicial, pozo: apuesta_inicial })
      .select()
      .single();

    if (salaError) throw salaError;

    // Agregar al jugador creador
    const { data: jugador, error: jugadorError } = await supabase
      .from('jugadores')
      .insert({
        sala_id: sala.id,
        nombre: nombre_jugador,
        balance: 0,
        orden: 0,
      })
      .select()
      .single();

    if (jugadorError) throw jugadorError;

    // Guardar host_id en la sala (si la columna ya existe).
    const { error: hostUpdateError } = await supabase
      .from('salas')
      .update({ host_id: jugador.id })
      .eq('id', sala.id);

    if (hostUpdateError && !isMissingHostIdColumn(hostUpdateError)) {
      throw hostUpdateError;
    }

    return new Response(
      JSON.stringify({ sala, jugador }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});