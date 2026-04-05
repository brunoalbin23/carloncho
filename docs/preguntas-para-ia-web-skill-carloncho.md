## Contexto

Estoy construyendo una app móvil llamada Carloncho con React Native + Expo y TypeScript estricto.

Es un juego de apuestas con cartas españolas de 48 cartas:

- 4 palos: espada, basto, copa y oro
- valores del 1 al 12
- Sota = 10
- Caballo = 11
- Rey = 12

### Reglas del juego

- Cualquier cantidad de jugadores forman un pozo poniendo el mismo monto cada uno.
- Se reparten 2 cartas boca abajo a cada jugador por turno.
- El jugador ve sus cartas y decide: PASAR o APOSTAR.
- Si apuesta, elige un monto máximo igual al pozo actual.
- Se le da una 3ra carta.
- Si la 3ra carta cae estrictamente ENTRE las dos primeras, gana ese monto del pozo.
- Si la 3ra carta es IGUAL a una de las dos primeras, pierde el DOBLE de lo apostado.
- Si cae FUERA del rango, pierde lo apostado.
- La partida termina cuando alguien gana todo el pozo o se acaban las cartas.

### Stack técnico

- React Native + Expo
- TypeScript
- @react-navigation/native + @react-navigation/native-stack
- Supabase para auth, base de datos y realtime

### Pantallas planeadas

1. HomeScreen
2. LobbyScreen
3. GameScreen
4. ResultScreen
5. EndScreen

### Restricciones del proyecto

- Siempre usar TypeScript estricto.
- Componentes funcionales con hooks.
- Estilos con StyleSheet de React Native.
- Colores principales: fondo #1a1a2e, acento #e94560, secundario #16213e.
- La lógica del juego debe validarse del lado del servidor, nunca solo en el cliente.
- Hay que avisar si algo puede causar problemas en iOS.

## Decisiones cerradas para el skill

### 1. Backend autoritativo

Usar Supabase Edge Functions para toda la lógica autoritativa del juego.

Motivos:

- la validación corre en servidor y evita trampas desde el cliente
- encaja bien con Expo y Supabase
- mantiene la lógica de negocio separada de la base de datos
- simplifica el mantenimiento frente a una solución basada principalmente en SQL o RPC

Riesgo concreto:

- Supabase Realtime tiene límite de conexiones simultáneas en el plan gratuito; sirve para MVP pero puede ser cuello de botella si escala

### 2. Acceso a partidas

Usar una combinación por etapas.

Definición:

- V1: acceso anónimo con nombre y código de sala de 6 dígitos
- V2: login opcional para historial, estadísticas y lista de amigos

Riesgo concreto:

- sin autenticación, una sala puede ser vulnerable si alguien adivina el código; para una fase posterior conviene agregar expiración de códigos y endurecimiento del acceso

### 3. UX iPhone

Definiciones:

- orientación solo portrait
- mostrar solo el resultado del turno en el flujo principal
- dejar el historial completo para fin de partida
- desarrollar con Expo Go al principio, pero dejar la configuración preparada para EAS Build

Riesgo concreto:

- algunas librerías o features nativas no funcionan plenamente en Expo Go y recién fallan al pasar a build nativo
- si se agregan push notifications u otras capacidades nativas, EAS Build pasa a ser obligatorio

### 4. Decisiones fijas del skill

- Stack: React Native + Expo + TypeScript + Supabase
- Código: TypeScript estricto, sin `any` salvo justificación clara
- Navegación: `@react-navigation/native-stack`
- Estilos: `StyleSheet` de React Native
- Colores: fondo `#1a1a2e`, acento `#e94560`, secundario `#16213e`
- Orientación: solo portrait
- Validación de jugadas: siempre en Supabase Edge Functions
- Realtime: Supabase Realtime
- Acceso V1: anónimo con código de sala de 6 dígitos

### 5. Preguntas que el skill debe hacer al comenzar

1. ¿La tarea toca lógica del juego y requiere Edge Function, o es solo UI?
2. ¿El cambio necesita estado compartido de la partida o es autocontenido?
3. ¿Es una pantalla nueva o una modificación de una existente?
4. ¿Debe funcionar offline o puede requerir conexión?
5. ¿El cambio afecta turnos, apuestas o reparto de cartas y por lo tanto necesita coordinación con backend?