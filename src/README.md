# Mergington High School Activities API

## Features

- View all available extracurricular activities
- Administrator-only activity registration and unregistration
- Student account registration and login
- Scrypt-hashed passwords and role-based authorization
- Administrator-only password resets

## Getting Started

1. Install the dependencies:

   ```
   pip install -r requirements.txt
   ```

2. Configure the first administrator using environment variables. Both values
   are required, and the password must be at least 12 characters:

   ```
   export ADMIN_USERNAME=school-admin
   export ADMIN_PASSWORD='use-a-unique-password-of-at-least-12-characters'
   ```

   The administrator account is created on first startup and its password is
   stored only as a salted scrypt hash. Do not commit real credentials.

3. Run the application from the repository root:

   ```
   python -m uvicorn app:app --app-dir src --reload
   ```

4. Open your browser and go to:
   - API documentation: http://localhost:8000/docs
   - Alternative documentation: http://localhost:8000/redoc
   - Activities website: http://localhost:8000/

Account records are stored in `src/users.json` and are excluded from version
control. Public registration always creates a student account; administrator
roles can only be granted by configuring the initial administrator. Existing
sessions expire after 12 hours and are cleared when the server restarts.

## API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/auth/register` | Create a student account (`username`, `password`) |
| POST | `/auth/login` | Log in and receive a session token |
| GET | `/auth/status` | Check the current session |
| POST | `/auth/logout` | Revoke the current session |
| POST | `/auth/password-reset` | Reset a user's password (administrator only; `username`, `new_password`) |
| GET | `/activities` | Get all activities and participant details |
| POST | `/activities/{activity_name}/signup?email=student@mergington.edu` | Register a student (administrator only) |
| DELETE | `/activities/{activity_name}/unregister?email=student@mergington.edu` | Unregister a student (administrator only) |

New passwords must be 12 to 128 characters. Send the login token in the
`X-Auth-Token` header for authenticated requests. Password resets are performed
by an administrator through the API or the account menu; no email reset links
are sent.

Activity data remains in memory and resets when the server restarts.
