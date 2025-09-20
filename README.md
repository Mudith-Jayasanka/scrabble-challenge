# Scrabble

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.17.

## Modes

- Play vs Bot: starts instantly, no login required (fully client-side).
- Play vs Human (Online): requires login (localStorage demo). The app will find another player via Socket.IO matchmaking and start a shared game using the built-in WebSocket relay.

## Quick start (Frontend + Matchmaking server)
1. npm install
2. npm run start
   - This runs Angular dev server on http://localhost:4200 and the Node server (server.js) on port 3000.
   - The WebSocket relay for in-game sync runs on ws://localhost:8080.
3. Open http://localhost:4200 in two different browsers or devices, login on both, then choose Play vs Human. You should be paired automatically.

Notes:
- Login/registration are stored in localStorage for demo purposes only. Do not use real credentials.
- If you change ports or hostnames, update the URLs in server.js and src/app/ws.service.ts as needed.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Further help

To get more help on the Angular CLI use `ng help` or check the [Angular CLI docs](https://angular.io/cli).
