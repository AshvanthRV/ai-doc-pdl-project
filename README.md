# MediBook doctor consultation app

MediBook is a local full-stack appointment booking demo with separate patient and doctor portals. It includes doctor discovery, appointment scheduling, availability management, notifications, patient history, reviews, and optional Gemini symptom triage and doctor decision support.

## Requirements

- Node.js 22.5 or newer (the API uses the built-in `node:sqlite` module)
- npm

## Start the app

From the project root:

```sh
npm install
npm run seed
npm run dev
```

Open the patient portal at [http://localhost:3001](http://localhost:3001), the doctor dashboard at [http://localhost:3002](http://localhost:3002), and the API health endpoint at [http://localhost:3000/api/health](http://localhost:3000/api/health).

The database is created at `server/database.sqlite`. The seed command inserts demo accounts and sample appointments; it skips seeding when doctors already exist.

### Demo sign-ins

- Patient: `john@patient.com` / `password123`
- Doctor: `sarah@clinic.com` / `password123`

Other seeded doctors use the same password.

## Gemini AI configuration

AI features are optional. Set `GEMINI_API_KEY` in the environment before starting the API server, or enter a key in the doctor dashboard’s Gemini settings. Keys entered in the app are held in server memory and are lost when the server restarts; environment configuration persists across restarts. The patient portal can run triage but cannot change server credentials.

The app uses Google’s Gemini generateContent API, currently preferring Gemini 3.8 Flash with Gemini 3.6 Flash and Gemini 3.5 Flash-Lite fallbacks. Without a valid key, the rest of the booking app remains available and AI requests return a configuration error.

## Available commands

- `npm run dev` — start the API, patient portal, and doctor dashboard
- `npm run start:server` — start only the API on port 3000
- `npm run start:patient` — serve the patient portal on port 3001
- `npm run start:doctor` — serve the doctor dashboard on port 3002
- `npm run seed` — create the demo data if the database is empty

The video consultation controls are a local UI simulation; they do not establish a peer-to-peer call. AI triage and generated clinical insights are decision support and require review by a qualified clinician.
