# NataBridge PWA - Maternal Healthcare Progressive Web App

## Overview
NataBridge is an offline-first Progressive Web App designed for maternal healthcare management in Nigeria. It provides comprehensive tools for PHC staff, Community Health Workers (CHWs), and pregnant mothers to improve maternal care outcomes.

## Project Structure
```
├── app.py                 # Main Flask application with all API routes
├── database.py            # Database schema and initialization
├── templates/
│   └── index.html         # Main PWA template
├── static/
│   ├── css/
│   │   └── style.css      # Glassmorphism UI styles
│   ├── js/
│   │   ├── app.js         # Main application logic
│   │   ├── api.js         # API client with offline support
│   │   └── db.js          # IndexedDB for offline storage
│   ├── sw.js              # Service Worker for PWA
│   ├── manifest.json      # PWA manifest
│   └── icons/             # PWA icons (SVG format)
```

## Key Features
1. **User Authentication** - Three role types: PHC Admin/Staff, CHW, Mother
2. **Mother Registration** - Offline-first forms with auto-sync
3. **AI-Guided Digital Triage** - Risk scoring (Normal/Caution/High-Risk/Emergency)
4. **CHW Follow-Up Module** - Home visit tracking
5. **Emergency Referral System** - One-tap alerts with transport directory
6. **Multilingual Education Hub** - English, Yoruba, Hausa, Igbo, Pidgin
7. **PHC Dashboard** - Analytics and high-risk monitoring
8. **NataBand Device Integration** - Manual vital input with threshold alerts
9. **Notifications Module** - Works offline and online

## Default Login Credentials
- **PHC Admin**: admin@natabridge.com / admin123
- **CHW**: chw@natabridge.com / chw123
- **Mother**: mother@natabridge.com / mother123

## Technology Stack
- **Backend**: Python Flask, psycopg (PostgreSQL)
- **Frontend**: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript
- **Database**: PostgreSQL (Neon-backed)
- **PWA**: Service Workers, IndexedDB, Background Sync

## API Endpoints
### Authentication
- POST `/api/auth/register` - User registration
- POST `/api/auth/login` - User login
- GET `/api/auth/me` - Get current user

### Mothers
- GET/POST `/api/mothers` - List/create mothers
- GET/PUT `/api/mothers/<id>` - Get/update mother

### Triage
- POST `/api/triage` - Create triage assessment
- GET `/api/triage/history/<mother_id>` - Get triage history

### CHW
- GET `/api/chw/assignments` - Get CHW assignments
- POST `/api/chw/visits` - Record home visit
- GET `/api/chw/visits/<mother_id>` - Get visit history

### Emergency
- POST `/api/emergency/alert` - Create emergency alert
- GET `/api/emergency/alerts` - Get all alerts
- PUT `/api/emergency/alerts/<id>` - Update alert status
- POST `/api/referral` - Create referral
- GET `/api/transport-contacts` - Get transport directory

### Education
- GET `/api/education/modules` - Get education content
- GET `/api/education/categories` - Get categories

### NataBand
- POST `/api/nataband/vitals` - Record device vitals
- GET `/api/nataband/readings/<mother_id>` - Get readings

### Dashboard
- GET `/api/dashboard/stats` - Get statistics
- GET `/api/dashboard/high-risk` - Get high-risk mothers

### Notifications
- GET `/api/notifications` - Get notifications
- PUT `/api/notifications/<id>/read` - Mark as read

### Sync (Offline)
- POST `/api/sync/push` - Push offline data
- GET `/api/sync/pull` - Pull latest data

## Risk Scoring System
The triage system calculates risk based on:
- Symptoms checklist (danger signs)
- Vital signs (BP, heart rate, temperature, SpO2)
- Historical risk factors

Risk Levels:
- **Normal**: Score < 15
- **Caution**: Score 15-29
- **High Risk**: Score 30-49
- **Emergency**: Score >= 50

## Offline Capabilities
- All forms work offline with IndexedDB storage
- Background sync when connection restored
- Education content cached for offline access
- Transport contacts available offline

## Running the Application
The app runs on port 5000 with Flask's development server.

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - JWT secret key
