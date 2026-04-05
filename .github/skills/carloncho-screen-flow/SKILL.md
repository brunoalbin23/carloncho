---
name: carloncho-screen-flow
description: 'Build or refactor Carloncho screens, screen flows, and navigation. Use when creating HomeScreen, LobbyScreen, GameScreen, ResultScreen, EndScreen, replacing the Expo Router starter tabs, wiring route params, organizing React Native screen state, or checking iPhone navigation risks.'
argument-hint: 'Describe the screen or navigation flow to build for Carloncho'
user-invocable: true
---

# Carloncho Screen And Navigation Workflow

## What This Skill Produces

This skill guides screen-level work for Carloncho, including:

- screen creation and refactors
- route design and navigation wiring
- migration away from starter scaffolding that does not match the planned game flow
- loading, empty, waiting, and error states for multiplayer mobile screens
- iPhone-safe layouts in portrait orientation

Use it together with the Carloncho architecture skill when the task also touches backend authority, realtime, or game rules.

## Current Repository Reality

Before writing code, account for the current repo state:

- the app currently boots through `expo-router/entry`
- the starter template still has tab navigation under `app/(tabs)`
- the planned product flow is game-oriented, not tab-oriented
- `@react-navigation/native` and `@react-navigation/native-stack` are installed, but the app shell is still Expo Router based

Do not casually mix a new native-stack setup with the existing Expo Router tree. First decide whether the task should:

- keep Expo Router and reshape the route tree around the game flow, or
- migrate off the starter router structure into a more explicit navigation shell

If the task does not explicitly authorize a migration, prefer adapting the existing router structure with the smallest coherent change.

## Fixed Defaults

- portrait-only UX
- strict TypeScript
- functional components with hooks
- StyleSheet for styling
- color palette: background #1a1a2e, accent #e94560, secondary #16213e
- main flow screens: Home, Lobby, Game, Result, End
- primary target is iPhone via Expo Go, while avoiding choices that block later EAS Build

## When To Use

Use this skill when the request involves:

- building a new Carloncho screen
- changing the navigation flow between planned screens
- replacing placeholder starter content
- adding typed params or screen contracts
- converting the tab-based starter app into a room and match flow
- reviewing whether a screen is overloaded with game state or navigation logic

## Procedure

1. Classify the change.
   Decide whether the task is a new screen, a screen refactor, a route-tree change, or a full navigation migration.

2. Map the screen to the game flow.
   Place the request in one of these product states:
   - Home: create or join room
   - Lobby: waiting room and player list
   - Game: current hand, pass, bet, resolve
   - Result: turn outcome
   - End: final ranking and match summary

3. Check the router boundary first.
   Inspect whether the existing Expo Router layout can express the flow cleanly.
   If yes, extend it coherently.
   If no, propose or implement a contained migration instead of layering another navigation pattern on top.

4. Define route contracts before JSX grows.
   Write down the params each screen needs. Keep params serializable and minimal. Shared live state should come from the server or client store, not from oversized navigation payloads.

5. Design explicit screen states.
   For each screen, account for:
   - loading
   - empty
   - waiting
   - error
   - success or resolved state

6. Separate orchestration from presentation.
   Keep data loading, subscriptions, and action dispatching in the screen or container layer. Move reusable visual pieces into components when the JSX becomes difficult to scan.

7. Validate game-state ownership.
   Screens may collect intent, but they must not become the authority for:
   - current turn
   - card distribution
   - betting outcome
   - pozo updates

8. Review iPhone behavior.
   Confirm portrait layout, safe-area handling, keyboard behavior, and touch targets before considering the task complete.

## Decision Rules

### If the current code is still starter content

- remove or replace scaffolding decisively instead of preserving demo UI that no longer matches the product
- avoid partial migration states where the app still exposes unrelated Explore or Modal sample flows unless the task explicitly keeps them

### If the task is a single screen

- keep the screen focused on one player goal
- accept only the params needed to render or fetch that state
- prefer derived display data over duplicating server state in local component state

### If the task changes navigation

- decide whether tabs still belong in the product
- prefer one top-level flow model instead of hybrid routing patterns
- ensure back navigation makes sense on iPhone and does not break turn progression

### If the task introduces forms

- handle keyboard overlap and submit states explicitly
- keep validation clear on the client for UX, but do not confuse it with authoritative server validation

## Route Planning Checklist

Use this checklist before editing navigation files:

1. What is the first screen the player sees?
2. How does the player create or join a room?
3. What condition moves the app from Lobby to Game?
4. How does Result return to Game or advance to End?
5. Which screens should allow back navigation and which should lock the flow?

## Completion Checks

The task is only done when:

- the screen flow matches the actual product states
- no leftover starter route confuses the app experience
- route params are typed and minimal
- portrait iPhone use is reasonable
- styling follows the project palette and React Native conventions
- screen code does not quietly take ownership of server-authoritative state

## Example Prompts

- Replace the Expo Router starter tabs with a Carloncho Home to Lobby to Game flow.
- Build the Lobby screen with waiting states, player list, and room code actions.
- Refactor the Game screen so UI intent is separate from game-state orchestration.
- Review whether this navigation change should stay in Expo Router or migrate to a different stack setup.