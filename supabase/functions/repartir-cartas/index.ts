import { createClient } from 'jsr:@supabase/supabase-js@2';

type Palo = 'espada' | 'basto' | 'copa' | 'oro';
type Carta = { valor: number; palo: Palo };

function parseCarta(raw: unknown): Carta | null {
  if (!raw) return null;

  if (typeof raw === 'object') {
    const maybe = raw as { valor?: unknown; palo?: unknown };
    if (typeof maybe.valor === 'number' && typeof maybe.palo === 'string') {
      return { valor: maybe.valor, palo: maybe.palo as Palo };
    }
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { valor?: unknown; palo?: unknown };
      if (typeof parsed.valor === 'number' && typeof parsed.palo === 'string') {
        return { valor: parsed.valor, palo: parsed.palo as Palo };
      }
    } catch {
      const [valorText, palo] = raw.split('-');
      const valor = Number(valorText);
      if (!Number.isNaN(valor) && palo) {
        return { valor, palo: palo as Palo };
      }
    }
  }

  return null;
}

function buildDeck(): Carta[] {
  const palos: Palo[] = ['espada', 'basto', 'copa', 'oro'];
  const deck: Carta[] = [];
  for (const palo of palos) {
    for (let valor = 1; valor <= 12; valor++) {
      deck.push({ valor, palo });
    }
  }
  return deck;
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

    // Traer la sala
    const { data: sala, error: salaError } = await supabase
      .from('salas')
      .select('id, estado, turno_actual')
      .eq('id', sala_id)
      .single();

    if (salaError || !sala) {
      return new Response(
        JSON.stringify({ error: 'Sala no encontrada' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (sala.estado !== 'jugando') {
      return new Response(
        JSON.stringify({ error: 'La partida no está en curso' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Traer el jugador
    const { data: jugador, error: jugadorError } = await supabase
      .from('jugadores')
      .select('id, orden, balance')
      .eq('id', jugador_id)
      .eq('sala_id', sala_id)
      .single();

    if (jugadorError || !jugador) {
      return new Response(
        JSON.stringify({ error: 'Jugador no encontrado en esta sala' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar que es el turno de este jugador
    if (jugador.orden !== sala.turno_actual) {
      return new Response(
        JSON.stringify({ error: 'No es tu turno' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Revisar ultimo turno del jugador en esta sala.
    const { data: ultimoTurno, error: ultimoTurnoError } = await supabase
      .from('turnos')
      .select('id, resultado')
      .eq('sala_id', sala_id)
      .eq('jugador_id', jugador_id)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimoTurnoError) throw ultimoTurnoError;

    if (ultimoTurno && ultimoTurno.resultado === null) {
      return new Response(
        JSON.stringify({ error: 'Debes resolver tu turno anterior antes de repartir nuevas cartas' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Traer todas las cartas ya usadas en esta sala
    const { data: turnosExistentes, error: turnosError } = await supabase
      .from('turnos')
      .select('carta1, carta2, carta3')
      .eq('sala_id', sala_id);

    if (turnosError) throw turnosError;

    const usedKeys = new Set<string>();
    for (const t of turnosExistentes ?? []) {
      const c1 = parseCarta(t.carta1);
      const c2 = parseCarta(t.carta2);
      const c3 = parseCarta(t.carta3);
      if (c1) usedKeys.add(`${c1.valor}-${c1.palo}`);
      if (c2) usedKeys.add(`${c2.valor}-${c2.palo}`);
      if (c3) usedKeys.add(`${c3.valor}-${c3.palo}`);
    }

    // Filtrar mazo disponible
    const available = buildDeck().filter((c) => !usedKeys.has(`${c.valor}-${c.palo}`));

    // Necesitamos al menos 3 cartas (2 para repartir + 1 posible carta3 si apuesta)
    if (available.length < 3) {
      return new Response(
        JSON.stringify({ error: 'No quedan suficientes cartas en el mazo' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Elegir 2 cartas aleatorias distintas
    const idx1 = Math.floor(Math.random() * available.length);
    const carta1 = available[idx1];
    available.splice(idx1, 1);

    const idx2 = Math.floor(Math.random() * available.length);
    const carta2 = available[idx2];

    // Insertar turno
    const { data: turno, error: insertError } = await supabase
      .from('turnos')
      .insert({
        sala_id,
        jugador_id,
        carta1,
        carta2,
        apuesta: 0,
        ganancia: 0,
      })
      .select('id')
      .single();

    if (insertError || !turno) {
      throw insertError ?? new Error('No se pudo crear el turno');
    }

    return new Response(
      JSON.stringify({ turno_id: turno.id, carta1, carta2 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('repartir-cartas error:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
