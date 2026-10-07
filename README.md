# EduFlow v4
Smart Student Academic Management & Productivity System.

## Features
- Student login: Roll Number + Password (no OTP/CAPTCHA)
- Student registration: mobile OTP only during registration, then in-charge/HOD approval
- Faculty/HOD/Admin staff portal with CAPTCHA
- Student approval dashboard
- Faculty/HOD assignment creation
- Student assignment submission/status
- Attendance integration demo endpoint for authorized college API/database sync
- JSON file persistence for prototype use

## Run
1. Open terminal in this folder
2. `npm install`
3. `node server.js`
4. Open `http://localhost:3000`

## Demo accounts
Student: `23CSE001` / `student123`
Faculty: `faculty` / `faculty123`
HOD: `hod` / `hod123`
Admin: `admin` / `admin123`
Staff CAPTCHA demo answer: `12`
Registration OTP demo: `123456`

For production: use PostgreSQL/MySQL/MongoDB, bcrypt/Argon2 password hashing, real SMS OTP provider, HTTPS, CSRF/rate limiting, and an authorized attendance API/database integration.
