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
    const { turno_id, jugador_id, apuesta } = await req.json();

    if (!turno_id || !jugador_id || apuesta === undefined || apuesta === null) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos: turno_id, jugador_id, apuesta' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Traer el turno
    const { data: turno, error: turnoError } = await supabase
      .from('turnos')
      .select('*')
      .eq('id', turno_id)
      .single();

    if (turnoError || !turno) {
      return new Response(
        JSON.stringify({ error: 'Turno no encontrado' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (turno.jugador_id !== jugador_id) {
      return new Response(
        JSON.stringify({ error: 'Este turno no pertenece al jugador' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (turno.resultado !== null) {
      return new Response(
        JSON.stringify({ error: 'Este turno ya fue resuelto' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Traer sala y jugador en paralelo
    const [{ data: sala, error: salaError }, { data: jugador, error: jugadorError }] =
      await Promise.all([
        supabase.from('salas').select('*').eq('id', turno.sala_id).single(),
        supabase.from('jugadores').select('*').eq('id', jugador_id).single(),
      ]);

    if (salaError || !sala) {
      return new Response(
        JSON.stringify({ error: 'Sala no encontrada' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (jugadorError || !jugador) {
      return new Response(
        JSON.stringify({ error: 'Jugador no encontrado' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Traer todos los jugadores para calcular siguiente turno y fin de partida
    const { data: todosJugadores, error: jugadoresError } = await supabase
      .from('jugadores')
      .select('id, orden, balance, activo')
      .eq('sala_id', turno.sala_id)
      .order('orden', { ascending: true });

    if (jugadoresError) throw jugadoresError;

    const jugadoresLista = todosJugadores ?? [];

    const jugadoresActivos = jugadoresLista.filter((j: { activo?: boolean }) => j.activo !== false);

    function findNextActivoOrden(currentOrden: number): number | null {
      if (jugadoresActivos.length === 0) return null;

      const ordenesActivos = jugadoresActivos
        .map((j: { orden: number }) => j.orden)
        .sort((a: number, b: number) => a - b);

      const idxActual = ordenesActivos.findIndex((orden: number) => orden === currentOrden);
      if (idxActual === -1) {
        return ordenesActivos[0] ?? null;
      }

      const idxSiguiente = (idxActual + 1) % ordenesActivos.length;
      return ordenesActivos[idxSiguiente] ?? null;
    }

    // ── CASO: PASO ──────────────────────────────────────────────────────────
    if (Number(apuesta) === 0) {
      await supabase
        .from('turnos')
        .update({ apuesta: 0, resultado: 'paso', ganancia: 0 })
        .eq('id', turno_id);

      const nextOrden = findNextActivoOrden(jugador.orden);
      let finPartida = false;

      if (nextOrden === null) {
        finPartida = true;
        await supabase
          .from('salas')
          .update({ estado: 'terminada', pozo: sala.pozo })
          .eq('id', turno.sala_id);
      } else {
        await supabase
          .from('salas')
          .update({ turno_actual: nextOrden, pozo: sala.pozo })
          .eq('id', turno.sala_id);
      }

      return new Response(
        JSON.stringify({
          carta3: null,
          resultado: 'paso',
          ganancia: 0,
          pozo: sala.pozo,
          fin_partida: finPartida,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── CASO: APUESTA ────────────────────────────────────────────────────────
    const apuestaNum = Number(apuesta);
    if (!Number.isInteger(apuestaNum) || apuestaNum <= 0) {
      return new Response(
        JSON.stringify({ error: 'La apuesta debe ser un entero positivo' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (apuestaNum > sala.pozo) {
      return new Response(
        JSON.stringify({ error: 'La apuesta supera el pozo actual' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Traer cartas ya usadas en esta sala para sacar carta3
    const { data: turnosExistentes, error: turnosError2 } = await supabase
      .from('turnos')
      .select('carta1, carta2, carta3')
      .eq('sala_id', turno.sala_id);

    if (turnosError2) throw turnosError2;

    const usedKeys = new Set<string>();
    for (const t of turnosExistentes ?? []) {
      const c1 = parseCarta(t.carta1);
      const c2 = parseCarta(t.carta2);
      const c3 = parseCarta(t.carta3);
      if (c1) usedKeys.add(`${c1.valor}-${c1.palo}`);
      if (c2) usedKeys.add(`${c2.valor}-${c2.palo}`);
      if (c3) usedKeys.add(`${c3.valor}-${c3.palo}`);
    }

    const available = buildDeck().filter((c) => !usedKeys.has(`${c.valor}-${c.palo}`));

    if (available.length === 0) {
      // Sin cartas — termina partida
      await supabase
        .from('turnos')
        .update({ apuesta: apuestaNum, resultado: 'paso', ganancia: 0 })
        .eq('id', turno_id);
      await supabase
        .from('salas')
        .update({ estado: 'terminada' })
        .eq('id', turno.sala_id);

      return new Response(
        JSON.stringify({
          carta3: null,
          resultado: 'paso',
          ganancia: 0,
          pozo: sala.pozo,
          fin_partida: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sacar carta3 aleatoria
    const idx = Math.floor(Math.random() * available.length);
    const carta3 = available[idx] as Carta;

    // ── Calcular resultado ──────────────────────────────────────────────────
    const carta1 = parseCarta(turno.carta1);
    const carta2 = parseCarta(turno.carta2);

    if (!carta1 || !carta2) {
      return new Response(
        JSON.stringify({ error: 'Turno inválido: faltan cartas iniciales' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const v1 = carta1.valor;
    const v2 = carta2.valor;
    const v3 = carta3.valor;
    const minV = Math.min(v1, v2);
    const maxV = Math.max(v1, v2);

    let resultado: 'gano' | 'perdio';
    let ganancia: number;
    let nuevoBalance: number;
    let nuevoPozo: number;

    if (v1 === v2) {
      // Cartas iguales — no hay rango, pierde la apuesta simple
      resultado = 'perdio';
      ganancia = -apuestaNum;
      nuevoBalance = jugador.balance - apuestaNum;
      nuevoPozo = sala.pozo + apuestaNum;
    } else if (v3 > minV && v3 < maxV) {
      // Carta dentro del rango → gana
      resultado = 'gano';
      ganancia = apuestaNum;
      nuevoBalance = jugador.balance + apuestaNum;
      nuevoPozo = sala.pozo - apuestaNum;
    } else if (v3 === v1 || v3 === v2) {
      // Carta igual a una de las dos → pierde el doble
      resultado = 'perdio';
      ganancia = -(apuestaNum * 2);
      nuevoBalance = jugador.balance - apuestaNum * 2;
      nuevoPozo = sala.pozo + apuestaNum * 2;
    } else {
      // Fuera del rango → pierde la apuesta
      resultado = 'perdio';
      ganancia = -apuestaNum;
      nuevoBalance = jugador.balance - apuestaNum;
      nuevoPozo = sala.pozo + apuestaNum;
    }

    // Guardar resultado en turno
    await supabase
      .from('turnos')
      .update({
        carta3,
        apuesta: apuestaNum,
        resultado,
        ganancia,
      })
      .eq('id', turno_id);

    // Actualizar balance del jugador
    await supabase
      .from('jugadores')
      .update({ balance: nuevoBalance })
      .eq('id', jugador_id);

    // ── Verificar fin de partida ─────────────────────────────────────────────
    const jugadoresActualizados = jugadoresLista.map((j: { id: string; orden: number; balance: number; activo?: boolean }) =>
      j.id === jugador_id ? { ...j, balance: nuevoBalance } : j
    );

    const jugadoresActivosActualizados = jugadoresActualizados.filter(
      (j: { activo?: boolean }) => j.activo !== false
    );

    let finPartida = false;

    // Fin si pozo llegó a 0 o menos
    if (nuevoPozo <= 0) {
      finPartida = true;
    }

    // Fin si no quedan cartas para un turno completo (necesitamos 3)
    // usedKeys.size + 1 porque carta3 recién se usó
    if (!finPartida && 48 - (usedKeys.size + 1) < 3) {
      finPartida = true;
    }

    if (finPartida) {
      await supabase
        .from('salas')
        .update({ pozo: nuevoPozo, estado: 'terminada' })
        .eq('id', turno.sala_id);
    } else {
      const ordenesActivos = jugadoresActivosActualizados
        .map((j: { orden: number }) => j.orden)
        .sort((a: number, b: number) => a - b);
      const idxActual = ordenesActivos.findIndex((orden: number) => orden === jugador.orden);
      const nextOrden =
        ordenesActivos.length === 0
          ? null
          : idxActual === -1
            ? ordenesActivos[0]
            : ordenesActivos[(idxActual + 1) % ordenesActivos.length];

      if (nextOrden === null) {
        finPartida = true;
        await supabase
          .from('salas')
          .update({ pozo: nuevoPozo, estado: 'terminada' })
          .eq('id', turno.sala_id);
      } else {
        // Se bloquea en "resolviendo" hasta que el jugador confirme desde Result.
        await supabase
          .from('salas')
          .update({ pozo: nuevoPozo, turno_actual: nextOrden, estado: 'resolviendo' })
          .eq('id', turno.sala_id);
      }
    }

    return new Response(
      JSON.stringify({
        turno_id,
        carta3,
        resultado,
        ganancia,
        pozo: nuevoPozo,
        fin_partida: finPartida,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('resolver-turno error:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
