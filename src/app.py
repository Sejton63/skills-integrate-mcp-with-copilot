"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

from fastapi import FastAPI, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
import os
import json
import hashlib
import hmac
import secrets
import time
import re
import threading
from pathlib import Path

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

USERS_FILE = current_dir / "users.json"
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SESSION_TTL_SECONDS = 12 * 60 * 60
account_lock = threading.RLock()


class UserCredentials(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.@+-]+$")
    password: str = Field(min_length=12, max_length=128)


class PasswordResetRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.@+-]+$")
    new_password: str = Field(min_length=12, max_length=128)

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1
    )
    return f"scrypt${salt.hex()}${password_hash.hex()}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, salt_hex, expected_hash = encoded_hash.split("$")
        if algorithm != "scrypt":
            return False
        actual_hash = hashlib.scrypt(
            password.encode("utf-8"), salt=bytes.fromhex(salt_hex),
            n=2**14, r=8, p=1
        )
    except (ValueError, TypeError):
        return False

    return hmac.compare_digest(actual_hash.hex(), expected_hash)


def load_users() -> dict[str, dict[str, str]]:
    if not USERS_FILE.exists():
        return {}

    try:
        with USERS_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not load user accounts from {USERS_FILE}") from error

    if not isinstance(data, dict) or not isinstance(data.get("users"), dict):
        raise RuntimeError(f"Invalid user account data in {USERS_FILE}")

    for username, user in data["users"].items():
        if (not isinstance(username, str) or not isinstance(user, dict)
                or user.get("role") not in {"student", "admin"}
                or not isinstance(user.get("password_hash"), str)):
            raise RuntimeError(f"Invalid user account data in {USERS_FILE}")

    return data["users"]


def save_users() -> None:
    temporary_file = USERS_FILE.with_suffix(".tmp")
    with account_lock:
        try:
            descriptor = os.open(
                temporary_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600
            )
            with os.fdopen(descriptor, "w", encoding="utf-8") as file:
                os.fchmod(file.fileno(), 0o600)
                json.dump({"users": users}, file, indent=2)
                file.write("\n")
            os.replace(temporary_file, USERS_FILE)
        except OSError as error:
            try:
                temporary_file.unlink(missing_ok=True)
            except OSError:
                pass
            raise RuntimeError(f"Could not save user accounts to {USERS_FILE}") from error


users = load_users()
if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise RuntimeError("Set both ADMIN_USERNAME and ADMIN_PASSWORD to bootstrap an administrator")
if ADMIN_USERNAME and not re.fullmatch(r"[a-z0-9_.@+-]{3,64}", ADMIN_USERNAME):
    raise RuntimeError("ADMIN_USERNAME must be 3-64 valid username characters")
if ADMIN_PASSWORD and len(ADMIN_PASSWORD) < 12:
    raise RuntimeError("ADMIN_PASSWORD must be at least 12 characters long")
if ADMIN_USERNAME:
    configured_admin = users.get(ADMIN_USERNAME)
    if configured_admin and configured_admin["role"] != "admin":
        raise RuntimeError("ADMIN_USERNAME is already registered as a non-admin account")
    if not configured_admin:
        users[ADMIN_USERNAME] = {
            "role": "admin",
            "password_hash": hash_password(ADMIN_PASSWORD),
        }
        save_users()

active_sessions: dict[str, tuple[str, float]] = {}
dummy_password_hash = hash_password(secrets.token_urlsafe(32))


def get_authenticated_user(auth_token: str | None) -> tuple[str, dict[str, str]]:
    session = active_sessions.get(auth_token or "")
    if not session or session[1] <= time.time():
        if auth_token:
            active_sessions.pop(auth_token, None)
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    username = session[0]
    user = users.get(username)
    if not user:
        active_sessions.pop(auth_token, None)
        raise HTTPException(status_code=401, detail="Authentication required")
    return username, user


def require_admin(auth_token: str | None) -> tuple[str, dict[str, str]]:
    username, user = get_authenticated_user(auth_token)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return username, user


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/auth/register")
def register(request: UserCredentials):
    username = request.username.lower()
    with account_lock:
        if username == ADMIN_USERNAME or username in users:
            raise HTTPException(status_code=409, detail="Username is already registered")

        users[username] = {
            "role": "student",
            "password_hash": hash_password(request.password),
        }
        try:
            save_users()
        except RuntimeError:
            users.pop(username, None)
            raise
    return {"message": "Account created successfully", "username": username, "role": "student"}


@app.post("/auth/login")
def login(request: UserCredentials):
    username = request.username.lower()
    with account_lock:
        user = users.get(username)
    encoded_hash = user["password_hash"] if user else dummy_password_hash
    if not verify_password(request.password, encoded_hash) or not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    active_sessions[token] = (username, time.time() + SESSION_TTL_SECONDS)

    return {
        "message": "Logged in successfully",
        "token": token,
        "username": username,
        "role": user["role"],
    }


@app.post("/auth/logout")
def logout(x_auth_token: str | None = Header(default=None)):
    if x_auth_token:
        active_sessions.pop(x_auth_token, None)

    return {"message": "Logged out"}


@app.get("/auth/status")
def auth_status(x_auth_token: str | None = Header(default=None)):
    if not x_auth_token or x_auth_token not in active_sessions:
        return {"authenticated": False}

    try:
        username, user = get_authenticated_user(x_auth_token)
    except HTTPException:
        return {"authenticated": False}

    return {
        "authenticated": True,
        "username": username,
        "role": user["role"],
    }


@app.post("/auth/password-reset")
def reset_password(request: PasswordResetRequest, x_auth_token: str | None = Header(default=None)):
    require_admin(x_auth_token)
    username = request.username.lower()
    with account_lock:
        user = users.get(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        previous_hash = user["password_hash"]
        user["password_hash"] = hash_password(request.new_password)
        try:
            save_users()
        except RuntimeError:
            user["password_hash"] = previous_hash
            raise
    for token, session in list(active_sessions.items()):
        if session[0] == username:
            active_sessions.pop(token, None)
    return {"message": f"Password reset for {username}"}


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: str, x_auth_token: str | None = Header(default=None)):
    """Sign up a student for an activity"""
    require_admin(x_auth_token)

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is not already signed up
    if email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    # Add student
    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(activity_name: str, email: str, x_auth_token: str | None = Header(default=None)):
    """Unregister a student from an activity"""
    require_admin(x_auth_token)

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
