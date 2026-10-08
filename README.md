# EduFlow v5

Smart Student Academic Management & Productivity System.

## What's improved
- Professional responsive dashboard UI
- Student login + OTP registration + approval workflow
- Dynamic CAPTCHA for Faculty/HOD/Admin login
- Role-based permissions
- Assignment creation with due dates
- Real file submission from student dashboard (up to 8 MB)
- Faculty/HOD/Admin submission monitor
- Attendance synchronization for HOD/Admin
- College notices
- Student attendance, assignments, resources and profile dashboard
- Session tokens and basic login-rate limiting
- Local JSON persistence for easy demo/testing

## Run locally
```bash
npm install
npm start
```
Then open:
`http://localhost:3000`

## Demo accounts
- Student: `23CSE001` / `student123`
- Faculty: `faculty` / `faculty123`
- HOD: `hod` / `hod123`
- Admin: `admin` / `admin123`

Staff login requires the on-screen CAPTCHA.

## Important deployment note
GitHub Pages can host the static frontend but cannot execute `server.js`. For a full working EduFlow deployment, run this Node.js server on a Node-compatible hosting platform and point the frontend API requests to that backend. For a same-origin deployment, keep `public/` and `server.js` together as provided here.

## Data
`data.json` is the demo database. Uploaded assignment files are stored in `uploads/`.
