---
name: carloncho-mobile-feature
description: 'Implement features, screens, navigation, and backend-integrated game flows for the Carloncho React Native + Expo app. Use when building HomeScreen, LobbyScreen, GameScreen, ResultScreen, EndScreen, wiring React Navigation, modeling Spanish-card game logic, adding Supabase auth/database/realtime flows, enforcing strict TypeScript, or checking iOS risks.'
argument-hint: 'Describe the screen, flow, or game feature to build for Carloncho'
user-invocable: true
---

# Carloncho Mobile Feature Workflow

## What This Skill Produces

This skill guides implementation of project-specific mobile features for Carloncho, a React Native + Expo game app with:

- strict TypeScript
- functional components with hooks
- React Navigation native stack
- StyleSheet-based styling
- Supabase for auth, database, and realtime
- Supabase Edge Functions for game-critical validation
- portrait-only iPhone-first UX
- anonymous room-code access for the MVP

It is intended for work inside this repository, not as a general React Native skill.

## When to Use

Use this skill when the request involves any of the following:

- creating or updating Carloncho screens
- configuring app navigation or screen flow
- implementing game actions like join game, bet, pass, draw, resolve turn, or end match
- designing Supabase-backed multiplayer flows
- mapping Spanish deck rules into typed models
- reviewing whether logic is incorrectly trusted on the client
- checking whether a change could cause problems on iOS

## Product Context

Carloncho is a betting game played with a 48-card Spanish deck:

- cards go from 1 to 12 across espada, basto, copa, and oro
- Sota = 10, Caballo = 11, Rey = 12
- players contribute the same amount to a shared pozo
- each player gets 2 hidden cards and decides to pass or bet
- if betting, the player chooses an amount up to the current pozo
- a third card is drawn
- if the third card falls strictly between the first two, the player wins that amount from the pozo
- if the third card equals either initial card, the player loses double the bet
- if it falls outside the range, the player loses the bet
- the match ends when someone wins the full pozo or the deck runs out

## Required Constraints

Always preserve these constraints unless the user explicitly changes them:

- TypeScript must remain strict
- components must be functional and hook-based
- styles must use React Native StyleSheet
- no `any` unless it is clearly justified
- primary colors are #1a1a2e for background, #e94560 for accent, and #16213e for secondary surfaces
- app orientation is portrait-only
- game logic must be validated in Supabase Edge Functions, never trusted only on the client
- realtime game synchronization uses Supabase Realtime
- MVP room access is anonymous with a 6-digit room code
- potential iOS issues must be called out during implementation

## Procedure

1. Identify the feature type.
   Decide whether the request is mainly about UI, navigation, domain modeling, realtime multiplayer state, or backend validation.

2. Restate the game impact.
   Translate the request into game terms such as player joins lobby, player receives cards, player passes, player places bet, server resolves draw, or match ends.

3. Define the client-server boundary.
   Put all authoritative logic on the server side, especially:
   - card dealing
   - turn ownership
   - bet limits
   - pozo mutations
   - win or loss resolution
   - deck exhaustion
   - anti-cheat or replay protection
   Implement this authority in Supabase Edge Functions by default. The client should render state, collect intent, and send commands.

4. Model types before UI complexity grows.
   Prefer explicit TypeScript types for:
   - suit
   - card value
   - card
   - player
   - game status
   - turn result
   - bet command
   - server response payloads

5. Implement UI with React Native conventions.
   Use functional components, hooks, and StyleSheet. Keep screens focused and split reusable UI into components when a screen starts mixing layout, state handling, and domain formatting.

6. Keep navigation explicit.
   When adding screens or flows, wire them through React Navigation with typed params. Validate that navigation handles the planned screen set:
   - HomeScreen
   - LobbyScreen
   - GameScreen
   - ResultScreen
   - EndScreen

7. Design for realtime multiplayer.
   When state must stay synchronized across devices, define:
   - source of truth in Supabase
   - subscription events needed for the lobby or game
   - optimistic updates to avoid, if they can desync game state
   - reconnect behavior and stale-state handling
   Assume the free tier Realtime connection cap can become a product constraint and call it out when relevant.

8. Check iOS-specific risks before finishing.
   Review whether the change may affect:
   - safe areas and notch layout
   - keyboard overlap
   - gesture conflicts with navigation
   - modal presentation differences
   - Expo Go limitations versus native builds
   - unsupported packages or native modules
   Default to portrait layouts and mention when a package or feature would require EAS Build instead of Expo Go.

9. Validate completion.
   Confirm that:
   - strict TypeScript types still hold
   - game-critical rules are not enforced only in the client
   - styling uses the project color palette unless the user requests otherwise
   - screen behavior matches the betting rules
   - navigation paths are coherent
   - iOS concerns were checked and mentioned if relevant

## Decision Rules

### If the request is a screen build

- start from the player action on that screen
- define the minimum data required from Supabase
- keep loading, empty, error, and waiting states explicit
- do not embed hidden game authority in local component state
- prefer turn-result summaries in the main flow; reserve full history for end-of-game views unless the user asks otherwise

### If the request is navigation setup

- create typed route params first
- ensure screen names are stable and consistent
- prefer a single clear flow over ad hoc navigation branching

### If the request is game logic

- model the rule in server terms first
- only mirror the resolved result on the client
- reject client-originated state mutations that bypass server checks

### If the request is realtime or lobby behavior

- define join, leave, ready, and disconnect states explicitly
- assume mobile networks are unreliable
- design for duplicate events and stale subscriptions
- use anonymous room-code entry for MVP flows unless the task explicitly introduces auth

## Quality Bar

The work is not complete unless all of these are true:

- the change matches the Carloncho ruleset
- server authority is preserved in Edge Functions for all meaningful game outcomes
- TypeScript types are specific enough to prevent invalid states
- the UI is implementable with React Native and Expo without hidden native requirements
- the result is reasonable on portrait iPhone layouts and interaction patterns
- Expo Go compatibility is preserved unless the task explicitly introduces a native-build requirement

## Example Prompts

- Build the HomeScreen for Carloncho with create or join game actions and the project color palette.
- Configure native stack navigation for Home, Lobby, Game, Result, and End screens with strict TypeScript params.
- Design Supabase tables and Edge Functions for dealing cards and resolving bets in Carloncho.
- Implement the GameScreen UI for viewing two cards, passing, betting, and receiving the third-card result.
- Review this Carloncho feature and tell me if any client-side logic should move to the server.

## Fixed Decisions

Treat these as defaults unless the user explicitly overrides them:

- backend authority lives in Supabase Edge Functions
- realtime synchronization uses Supabase Realtime
- MVP access is anonymous via a 6-digit room code
- authentication is a later, optional phase
- orientation is portrait-only
- the main turn flow shows result summaries, not full card history
- Expo Go is the default development target, but app configuration should stay ready for future EAS Build adoption

## Risks To Call Out

- Supabase Realtime free-tier connection limits can constrain multiplayer scale
- anonymous room codes are acceptable for MVP use, but guessed codes become a risk without expiration or later auth hardening
- some native capabilities, such as push notifications or unsupported libraries, require EAS Build and will not be fully testable in Expo Go

## Kickoff Questions

If a task depends on these and the repository does not already answer them, ask the user:

- whether the task touches game logic and therefore needs Edge Function work, or is client-only UI
- whether the feature needs shared game state or is self-contained
- whether the work is a new screen or a change to an existing one
- whether the feature must handle offline behavior or can require connectivity
- whether the change affects turn flow, betting resolution, or card dealing and therefore needs server coordination