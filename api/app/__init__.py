import os
import base64
import hashlib
import time
import requests
from datetime import datetime
from secrets import token_urlsafe

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from app.extensions import db
from app.models import Area, Store, User, Message, MessageRecipient, Thread, ThreadMember, ThreadMessage, ThreadMessageAck, UserStoreAssignment, ThreadMessageReaction


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key")

    database_url = os.getenv("DATABASE_URL", "").strip()

    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url or "sqlite:///bpi_connect.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    CORS(app)
    db.init_app(app)

    @app.get("/")
    def health():
        return jsonify({
            "success": True,
            "app": "BPI Connect API",
            "status": "running",
        })

    def require_dev_admin_secret():
        expected_secret = os.getenv("DEV_ADMIN_SECRET", "").strip()
        provided_secret = request.headers.get("X-Dev-Admin-Secret", "").strip()

        if not expected_secret:
            return jsonify({
                "success": False,
                "error": "DEV_ADMIN_SECRET is not configured.",
            }), 403

        if provided_secret != expected_secret:
            return jsonify({
                "success": False,
                "error": "Unauthorized.",
            }), 403

        return None


    @app.get("/dev/tables")
    def dev_tables():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        inspector = db.inspect(db.engine)
        return jsonify({
            "success": True,
            "tables": sorted(inspector.get_table_names()),
            "database": str(db.engine.url).split("@")[-1],
        })


    @app.post("/dev/test-invite-email")
    def test_invite_email():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        data = request.get_json() or {}
        email = (data.get("email") or "vlad@bostonpie.com").strip()
        name = (data.get("name") or "Vlad").strip()

        class TestUser:
            def __init__(self, name, email):
                self.name = name
                self.email = email

        invite_url = "https://bpi-connect.onrender.com/invite/test-email-only"
        email_result = send_invite_email(TestUser(name, email), invite_url)

        return jsonify({
            "success": email_result.get("sent", False),
            "email_sent": email_result.get("sent", False),
            "email_error": email_result.get("error"),
            "provider_response": email_result.get("provider_response"),
        })


    @app.post("/dev/reset-admin-only")
    def reset_admin_only():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        db.session.remove()
        db.drop_all()
        db.create_all()

        company = Area(name="Company")
        db.session.add(company)
        db.session.flush()

        admin = User(
            name="Vlad",
            email="vlad@bostonpie.com",
            role="admin",
            area_id=company.id,
            password_hash=generate_password_hash("password123", method="pbkdf2:sha256"),
            invite_accepted_at=datetime.utcnow(),
            is_active=True,
        )
        db.session.add(admin)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Database reset to admin-only.",
            "admin": serialize_user(admin),
        })


    @app.post("/dev/init-db")
    def init_db():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        # Development/demo reset. Creates the current schema before seeding data.
        db.session.remove()
        db.drop_all()
        db.create_all()

        north = Area(name="North Area")
        company = Area(name="Company")
        db.session.add_all([north, company])
        db.session.flush()

        store_3001 = Store(store_number="3001", name="Store 3001", area_id=north.id)
        store_3209 = Store(store_number="3209", name="Store 3209", area_id=north.id)
        db.session.add_all([store_3001, store_3209])
        db.session.flush()

        users = [
            User(name="Vlad", email="vlad@bostonpie.com", role="admin", area_id=company.id),
            User(name="HR Team", email="hr@bostonpie.com", role="hr", area_id=company.id),
            User(name="North Area Coach", email="coach@bostonpie.com", role="coach", area_id=north.id),
            User(name="Store 3001 GM", email="gm3001@bostonpie.com", role="general_manager", store_id=store_3001.id, area_id=north.id),
            User(name="Store 3001 Manager", email="manager3001@bostonpie.com", role="manager", store_id=store_3001.id, area_id=north.id),
            User(name="Alex", email="alex3001@bostonpie.com", role="tm", store_id=store_3001.id, area_id=north.id),
            User(name="Jordan", email="jordan3001@bostonpie.com", role="tm", store_id=store_3001.id, area_id=north.id),
            User(name="Store 3209 Manager", email="manager3209@bostonpie.com", role="manager", store_id=store_3209.id, area_id=north.id),
            User(name="Taylor", email="taylor3209@bostonpie.com", role="tm", store_id=store_3209.id, area_id=north.id),
        ]
        db.session.add_all(users)
        db.session.flush()

        # Demo accounts use password: password123
        for user in users:
            user.password_hash = generate_password_hash("password123", method="pbkdf2:sha256")
            user.invite_accepted_at = datetime.utcnow()

        # Store assignments
        # GM / Manager / TM = primary store
        # Coach/Supervisor-style users = oversight stores
        db.session.add_all([
            UserStoreAssignment(user_id=users[2].id, store_id=store_3001.id, assignment_type="oversight"),
            UserStoreAssignment(user_id=users[2].id, store_id=store_3209.id, assignment_type="oversight"),
            UserStoreAssignment(user_id=users[3].id, store_id=store_3001.id, assignment_type="primary"),
            UserStoreAssignment(user_id=users[4].id, store_id=store_3001.id, assignment_type="primary"),
            UserStoreAssignment(user_id=users[5].id, store_id=store_3001.id, assignment_type="primary"),
            UserStoreAssignment(user_id=users[6].id, store_id=store_3001.id, assignment_type="primary"),
            UserStoreAssignment(user_id=users[7].id, store_id=store_3209.id, assignment_type="primary"),
            UserStoreAssignment(user_id=users[8].id, store_id=store_3209.id, assignment_type="primary"),
        ])

        sender = users[0]
        recipients = users[1:]

        message = Message(
            sender_user_id=sender.id,
            title="Welcome to BPI Connect",
            body="This is the first seeded API message. The mobile app will connect here next.",
            message_type="announcement",
            priority="normal",
            target_type="company",
            target_label="Company-wide",
            requires_ack=True,
        )
        db.session.add(message)
        db.session.flush()

        for user in recipients:
            db.session.add(MessageRecipient(message_id=message.id, user_id=user.id))

        # Demo chat threads
        def add_thread(thread_type, name, group_key, members, messages):
            thread = Thread(
                thread_type=thread_type,
                name=name,
                group_key=group_key,
                created_by_user_id=sender.id,
            )
            db.session.add(thread)
            db.session.flush()

            for member in members:
                db.session.add(ThreadMember(thread_id=thread.id, user_id=member.id))

            db.session.flush()

            for message_data in messages:
                thread_message = ThreadMessage(
                    thread_id=thread.id,
                    sender_user_id=message_data["sender"].id,
                    body=message_data["body"],
                    requires_ack=message_data.get("requires_ack", False),
                )
                db.session.add(thread_message)

            return thread

        add_thread(
            "store",
            "Store 3001",
            "store-3001",
            [users[0], users[3], users[4], users[5], users[6]],
            [
                {"sender": users[4], "body": "Team, please confirm tonight's closing checklist is covered."},
                {"sender": users[5], "body": "I can handle makeline and labels before I leave."},
                {"sender": users[0], "body": "Good. Make sure the walk-in proofing is checked too."},
            ],
        )

        add_thread(
            "store",
            "Store 3209",
            "store-3209",
            [users[0], users[7], users[8]],
            [
                {"sender": users[7], "body": "Store 3209, please post any maintenance follow-ups here."},
            ],
        )

        add_thread(
            "area",
            "North Area",
            "area-north",
            [users[0], users[2], users[3], users[4], users[7]],
            [
                {"sender": users[2], "body": "Weekend focus is Load & Go and image standards."},
                {"sender": users[0], "body": "Let's make sure every rush has a certified load captain."},
            ],
        )

        add_thread(
            "role",
            "All General Managers",
            "role-general-manager",
            [users[0], users[3]],
            [
                {"sender": users[1], "body": "GM call notes will be posted here.", "requires_ack": True},
            ],
        )

        add_thread(
            "company",
            "Company-wide",
            "company-all",
            users,
            [
                {"sender": users[0], "body": "Welcome to BPI Connect. Company-wide updates will live here."},
            ],
        )

        add_thread(
            "hr",
            "HR Announcements",
            "hr-announcements",
            users,
            [
                {"sender": users[1], "body": "HR announcements and required acknowledgements will live here.", "requires_ack": True},
            ],
        )

        add_thread(
            "direct",
            "Vlad + Alex",
            "direct-1-6",
            [users[0], users[5]],
            [
                {"sender": users[0], "body": "Can you check this and let me know?"},
                {"sender": users[5], "body": "Yes, I got it."},
            ],
        )

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Database initialized with demo BPI Connect data.",
        })

    @app.post("/api/auth/login")
    def login():
        data = request.get_json() or {}

        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({
                "success": False,
                "error": "Email and password are required.",
            }), 400

        user = User.query.filter(db.func.lower(User.email) == email).first()

        if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
            return jsonify({
                "success": False,
                "error": "Invalid email or password.",
            }), 401

        if not user.is_active:
            return jsonify({
                "success": False,
                "error": "This account is inactive.",
            }), 403

        user.last_login_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user(user),
        })


    @app.post("/api/invites")
    def create_invite():
        data = request.get_json() or {}

        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip().lower()
        role = (data.get("role") or "").strip().lower()
        store_number = (data.get("store_number") or "").strip()
        area_name = (data.get("area") or "").strip()

        if not name or not email or not role:
            return jsonify({
                "success": False,
                "error": "name, email, and role are required.",
            }), 400

        existing = User.query.filter(db.func.lower(User.email) == email).first()
        if existing:
            return jsonify({
                "success": False,
                "error": "A user with this email already exists.",
            }), 409

        store = None
        area = None

        if store_number:
            store = Store.query.filter_by(store_number=store_number).first()

        if area_name:
            area = Area.query.filter_by(name=area_name).first()

        if store and not area:
            area = store.area

        invite_token = token_urlsafe(32)

        user = User(
            name=name,
            email=email,
            role=role,
            store_id=store.id if store else None,
            area_id=area.id if area else None,
            invite_token=invite_token,
            invite_sent_at=datetime.utcnow(),
            is_active=True,
        )

        db.session.add(user)
        db.session.commit()

        app_invite_base_url = os.getenv("APP_INVITE_BASE_URL", "bpi-connect://accept-invite").strip().rstrip("/")
        invite_url = f"{app_invite_base_url}/{invite_token}"

        email_result = send_invite_email(user, invite_url)

        return jsonify({
            "success": True,
            "user": serialize_user(user),
            "invite_token": invite_token,
            "invite_url": invite_url,
            "invite_email_sent": email_result.get("sent", False),
            "invite_email_error": email_result.get("error"),
        }), 201


    @app.get("/invite/<invite_token>")
    def invite_setup_page(invite_token):
        user = User.query.filter_by(invite_token=invite_token).first()

        if not user:
            return """
            <!doctype html>
            <html>
              <head>
                <title>BPI Connect Invite</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <style>
                  body { margin:0; font-family: Arial, sans-serif; background:#07111f; color:#fff; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:22px; }
                  .card { max-width:440px; width:100%; background:#fff; color:#10212b; border-radius:28px; padding:28px; box-shadow:0 20px 60px rgba(0,0,0,.28); }
                  .badge { background:#e91f3f; color:#fff; width:72px; height:72px; border-radius:24px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:24px; margin-bottom:18px; }
                  h1 { font-size:32px; line-height:1.05; margin:0 0 10px; letter-spacing:-1px; }
                  p { color:#526273; line-height:1.45; font-size:15px; }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="badge">BPI</div>
                  <h1>Invite not found</h1>
                  <p>This invite link is invalid or has already been removed. Please ask your manager or HR for a new invite.</p>
                </div>
              </body>
            </html>
            """, 404

        if user.invite_accepted_at:
            return """
            <!doctype html>
            <html>
              <head>
                <title>BPI Connect Invite</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <style>
                  body { margin:0; font-family: Arial, sans-serif; background:#07111f; color:#fff; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:22px; }
                  .card { max-width:440px; width:100%; background:#fff; color:#10212b; border-radius:28px; padding:28px; box-shadow:0 20px 60px rgba(0,0,0,.28); }
                  .badge { background:#e91f3f; color:#fff; width:72px; height:72px; border-radius:24px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:24px; margin-bottom:18px; }
                  h1 { font-size:32px; line-height:1.05; margin:0 0 10px; letter-spacing:-1px; }
                  p { color:#526273; line-height:1.45; font-size:15px; }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="badge">BPI</div>
                  <h1>Account already set up</h1>
                  <p>This BPI Connect account has already been activated. Open the BPI Connect app and sign in.</p>
                </div>
              </body>
            </html>
            """

        return f"""
        <!doctype html>
        <html>
          <head>
            <title>Set up BPI Connect</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              * {{ box-sizing:border-box; }}
              body {{
                margin:0;
                font-family: Arial, sans-serif;
                background: radial-gradient(circle at top left, #152337 0, #07111f 46%, #030912 100%);
                color:#fff;
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:22px;
              }}
              .card {{
                max-width:460px;
                width:100%;
                background:#ffffff;
                color:#10212b;
                border-radius:32px;
                padding:30px;
                box-shadow:0 24px 70px rgba(0,0,0,.32);
              }}
              .badge {{
                background:#e91f3f;
                color:#fff;
                width:76px;
                height:76px;
                border-radius:26px;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:900;
                font-size:25px;
                margin-bottom:20px;
              }}
              .eyebrow {{
                color:#e91f3f;
                font-weight:900;
                letter-spacing:3px;
                font-size:12px;
                margin-bottom:8px;
              }}
              h1 {{
                font-size:34px;
                line-height:1.04;
                margin:0 0 10px;
                letter-spacing:-1.4px;
              }}
              .sub {{
                color:#526273;
                line-height:1.45;
                font-size:15px;
                margin:0 0 20px;
              }}
              .person {{
                background:#eef5f8;
                border-radius:18px;
                padding:14px;
                margin-bottom:18px;
              }}
              .person strong {{
                display:block;
                font-size:16px;
                margin-bottom:3px;
              }}
              .person span {{
                color:#697b8d;
                font-size:13px;
                font-weight:700;
              }}
              label {{
                display:block;
                font-size:12px;
                font-weight:900;
                text-transform:uppercase;
                letter-spacing:.8px;
                margin:12px 0 7px;
              }}
              input {{
                width:100%;
                border:0;
                background:#eef5f8;
                border-radius:16px;
                padding:14px;
                font-size:16px;
                font-weight:700;
                color:#10212b;
                outline:none;
              }}
              button {{
                width:100%;
                border:0;
                background:#e91f3f;
                color:#fff;
                border-radius:18px;
                padding:15px;
                font-size:16px;
                font-weight:900;
                margin-top:20px;
                cursor:pointer;
              }}
              .error {{
                display:none;
                background:#ffe4e8;
                color:#991b2f;
                border-radius:14px;
                padding:12px;
                font-weight:800;
                font-size:13px;
                margin-top:14px;
              }}
              .success {{
                display:none;
                background:#dcfce7;
                color:#166534;
                border-radius:14px;
                padding:12px;
                font-weight:800;
                font-size:13px;
                margin-top:14px;
              }}
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">BPI</div>
              <div class="eyebrow">BPI CONNECT</div>
              <h1>Set up your account</h1>
              <p class="sub">Create your password to activate BPI Connect.</p>

              <div class="person">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>

              <form id="inviteForm">
                <label>Password</label>
                <input id="password" type="password" placeholder="Create password" minlength="8" required />

                <label>Confirm password</label>
                <input id="confirmPassword" type="password" placeholder="Confirm password" minlength="8" required />

                <div id="error" class="error"></div>
                <div id="success" class="success"></div>

                <button id="submitButton" type="submit">Activate Account</button>
              </form>
            </div>

            <script>
              const form = document.getElementById("inviteForm");
              const errorBox = document.getElementById("error");
              const successBox = document.getElementById("success");
              const button = document.getElementById("submitButton");

              form.addEventListener("submit", async (event) => {{
                event.preventDefault();

                errorBox.style.display = "none";
                successBox.style.display = "none";

                const password = document.getElementById("password").value;
                const confirmPassword = document.getElementById("confirmPassword").value;

                if (password.length < 8) {{
                  errorBox.textContent = "Password must be at least 8 characters.";
                  errorBox.style.display = "block";
                  return;
                }}

                if (password !== confirmPassword) {{
                  errorBox.textContent = "Passwords do not match.";
                  errorBox.style.display = "block";
                  return;
                }}

                button.disabled = true;
                button.textContent = "Activating...";

                try {{
                  const response = await fetch("/api/invites/accept", {{
                    method: "POST",
                    headers: {{ "Content-Type": "application/json" }},
                    body: JSON.stringify({{
                      invite_token: "{invite_token}",
                      password: password
                    }})
                  }});

                  const data = await response.json();

                  if (!response.ok || !data.success) {{
                    throw new Error(data.error || "Could not activate account.");
                  }}

                  successBox.textContent = "Account activated. You can now open BPI Connect and sign in.";
                  successBox.style.display = "block";
                  form.reset();
                  button.textContent = "Account Activated";
                }} catch (error) {{
                  errorBox.textContent = error.message || "Could not activate account.";
                  errorBox.style.display = "block";
                  button.disabled = false;
                  button.textContent = "Activate Account";
                }}
              }});
            </script>
          </body>
        </html>
        """


    @app.post("/api/invites/accept")
    def accept_invite():
        data = request.get_json() or {}

        invite_token = (data.get("invite_token") or "").strip()
        password = data.get("password") or ""

        if not invite_token or not password:
            return jsonify({
                "success": False,
                "error": "invite_token and password are required.",
            }), 400

        if len(password) < 8:
            return jsonify({
                "success": False,
                "error": "Password must be at least 8 characters.",
            }), 400

        user = User.query.filter_by(invite_token=invite_token).first()

        if not user:
            return jsonify({
                "success": False,
                "error": "Invite not found.",
            }), 404

        if not user.is_active:
            return jsonify({
                "success": False,
                "error": "This invite is for an inactive account.",
            }), 403

        user.password_hash = generate_password_hash(password)
        user.invite_accepted_at = datetime.utcnow()
        user.invite_token = None
        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user(user),
        })


    @app.get("/api/users")
    def list_users():
        query = User.query

        active = request.args.get("active")
        role = (request.args.get("role") or "").strip().lower()
        store_number = (request.args.get("store_number") or "").strip()
        search = (request.args.get("search") or "").strip().lower()

        if active in ["true", "false"]:
            query = query.filter(User.is_active == (active == "true"))

        if role:
            query = query.filter(User.role == role)

        if store_number:
            query = (
                query
                .outerjoin(UserStoreAssignment)
                .outerjoin(Store, UserStoreAssignment.store_id == Store.id)
                .filter(
                    db.or_(
                        Store.store_number == store_number,
                        User.store.has(Store.store_number == store_number),
                    )
                )
            )

        if search:
            like = f"%{search}%"
            query = query.filter(
                db.or_(
                    db.func.lower(User.name).like(like),
                    db.func.lower(User.email).like(like),
                    db.func.lower(User.role).like(like),
                )
            )

        users = (
            query
            .distinct()
            .order_by(User.is_active.desc(), User.role.asc(), User.name.asc())
            .all()
        )

        return jsonify({
            "success": True,
            "users": [serialize_user(user) for user in users],
        })

    @app.get("/api/areas")
    def list_areas():
        areas = Area.query.order_by(Area.name.asc()).all()

        return jsonify({
            "success": True,
            "areas": [serialize_area(area) for area in areas],
        })


    @app.post("/api/areas")
    def create_area():
        data = request.get_json() or {}

        name = (data.get("name") or "").strip()

        if not name:
            return jsonify({
                "success": False,
                "error": "Area name is required.",
            }), 400

        existing = Area.query.filter(db.func.lower(Area.name) == name.lower()).first()

        if existing:
            return jsonify({
                "success": False,
                "error": "An area with this name already exists.",
            }), 409

        area = Area(name=name)
        db.session.add(area)
        db.session.commit()

        return jsonify({
            "success": True,
            "area": serialize_area(area),
        }), 201


    @app.delete("/api/areas/<int:area_id>")
    def delete_area(area_id):
        area = Area.query.get(area_id)

        if not area:
            return jsonify({"success": False, "error": "Area not found."}), 404

        if area.name.lower() == "company":
            return jsonify({
                "success": False,
                "error": "Company area cannot be deleted.",
            }), 400

        stores_count = Store.query.filter_by(area_id=area.id).count()
        users_count = User.query.filter_by(area_id=area.id).count()

        if stores_count or users_count:
            return jsonify({
                "success": False,
                "error": "Area is still assigned to stores or users. Reassign them before deleting.",
                "stores_count": stores_count,
                "users_count": users_count,
            }), 400

        db.session.delete(area)
        db.session.commit()

        return jsonify({"success": True})


    @app.get("/api/stores")
    def list_stores():
        stores = Store.query.order_by(Store.store_number.asc()).all()

        return jsonify({
            "success": True,
            "stores": [serialize_store(store) for store in stores],
        })


    @app.post("/api/stores")
    def create_store():
        data = request.get_json() or {}

        store_number = (data.get("store_number") or "").strip()
        name = (data.get("name") or "").strip()
        area_name = (data.get("area") or "").strip()

        if not store_number:
            return jsonify({
                "success": False,
                "error": "store_number is required.",
            }), 400

        existing = Store.query.filter_by(store_number=store_number).first()
        if existing:
            return jsonify({
                "success": False,
                "error": "A store with that number already exists.",
            }), 409

        area = None
        if area_name:
            area = Area.query.filter(db.func.lower(Area.name) == area_name.lower()).first()

            if not area:
                return jsonify({
                    "success": False,
                    "error": "Area not found.",
                }), 404

        store = Store(
            store_number=store_number,
            name=name or f"Store {store_number}",
            area_id=area.id if area else None,
            is_active=True,
        )

        db.session.add(store)
        db.session.commit()

        return jsonify({
            "success": True,
            "store": serialize_store(store),
        }), 201


    @app.patch("/api/stores/<int:store_id>")
    def update_store(store_id):
        store = Store.query.get(store_id)

        if not store:
            return jsonify({"success": False, "error": "Store not found."}), 404

        data = request.get_json() or {}

        if "store_number" in data:
            new_store_number = (data.get("store_number") or "").strip()

            if new_store_number:
                existing = Store.query.filter(
                    Store.store_number == new_store_number,
                    Store.id != store.id,
                ).first()

                if existing:
                    return jsonify({
                        "success": False,
                        "error": "Another store already has that number.",
                    }), 409

                store.store_number = new_store_number

        if "name" in data:
            store.name = (data.get("name") or "").strip() or store.name

        if "area" in data:
            area_name = (data.get("area") or "").strip()

            if area_name:
                area = Area.query.filter(db.func.lower(Area.name) == area_name.lower()).first()

                if not area:
                    return jsonify({
                        "success": False,
                        "error": "Area not found.",
                    }), 404

                store.area_id = area.id
            else:
                store.area_id = None

        if "is_active" in data:
            store.is_active = bool(data.get("is_active"))

        db.session.commit()

        return jsonify({
            "success": True,
            "store": serialize_store(store),
        })


    @app.get("/api/users/<int:user_id>")
    def get_user(user_id):
        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
        })


    @app.post("/api/users/<int:user_id>/avatar")
    def upload_user_avatar(user_id):
        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        data = request.get_json() or {}
        image_data = data.get("image_data")

        if not image_data:
            return jsonify({
                "success": False,
                "error": "image_data is required.",
            }), 400

        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
        api_key = os.getenv("CLOUDINARY_API_KEY", "").strip()
        api_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()

        if not cloud_name or not api_key or not api_secret:
            return jsonify({
                "success": False,
                "error": "Cloudinary is not configured.",
            }), 500

        timestamp = int(time.time())
        folder = "bpi-connect/avatars"
        public_id = f"user-{user.id}-{timestamp}"

        signature_payload = f"folder={folder}&public_id={public_id}&timestamp={timestamp}{api_secret}"
        signature = hashlib.sha1(signature_payload.encode("utf-8")).hexdigest()

        response = requests.post(
            f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload",
            data={
                "file": image_data,
                "api_key": api_key,
                "timestamp": timestamp,
                "signature": signature,
                "folder": folder,
                "public_id": public_id,
                "overwrite": "true",
            },
            timeout=30,
        )

        if response.status_code >= 400:
            return jsonify({
                "success": False,
                "error": response.text,
            }), 500

        uploaded = response.json()
        avatar_url = uploaded.get("secure_url")

        if not avatar_url:
            return jsonify({
                "success": False,
                "error": "Upload succeeded but no secure_url was returned.",
            }), 500

        user.avatar_url = avatar_url
        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
            "avatar_url": avatar_url,
        })


    @app.patch("/api/users/<int:user_id>")
    def update_user(user_id):
        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        data = request.get_json() or {}

        if "name" in data:
            user.name = (data.get("name") or "").strip() or user.name

        if "email" in data:
            new_email = (data.get("email") or "").strip().lower()
            if new_email:
                existing = User.query.filter(
                    db.func.lower(User.email) == new_email,
                    User.id != user.id,
                ).first()

                if existing:
                    return jsonify({
                        "success": False,
                        "error": "Another user already has that email.",
                    }), 409

                user.email = new_email

        if "role" in data:
            user.role = (data.get("role") or "").strip().lower() or user.role

        if "avatar_url" in data:
            avatar_url = (data.get("avatar_url") or "").strip()
            user.avatar_url = avatar_url or None

        if "is_active" in data:
            user.is_active = bool(data.get("is_active"))

        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
        })


    @app.post("/api/users/<int:user_id>/store-assignments")
    def add_store_assignment(user_id):
        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        data = request.get_json() or {}

        store_number = (data.get("store_number") or "").strip()
        assignment_type = (data.get("assignment_type") or "primary").strip().lower()

        if assignment_type not in ["primary", "oversight"]:
            return jsonify({
                "success": False,
                "error": "assignment_type must be primary or oversight.",
            }), 400

        store = Store.query.filter_by(store_number=store_number).first()

        if not store:
            return jsonify({"success": False, "error": "Store not found."}), 404

        # Enforce one primary store for GM / Manager / TM
        if assignment_type == "primary":
            UserStoreAssignment.query.filter_by(
                user_id=user.id,
                assignment_type="primary",
            ).delete()

            user.store_id = store.id
            user.area_id = store.area_id

        existing = UserStoreAssignment.query.filter_by(
            user_id=user.id,
            store_id=store.id,
            assignment_type=assignment_type,
        ).first()

        if not existing:
            existing = UserStoreAssignment(
                user_id=user.id,
                store_id=store.id,
                assignment_type=assignment_type,
            )
            db.session.add(existing)

        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
        })


    @app.delete("/api/users/<int:user_id>/store-assignments/<int:assignment_id>")
    def remove_store_assignment(user_id, assignment_id):
        assignment = UserStoreAssignment.query.filter_by(
            id=assignment_id,
            user_id=user_id,
        ).first()

        if not assignment:
            return jsonify({"success": False, "error": "Assignment not found."}), 404

        was_primary = assignment.assignment_type == "primary"
        user = assignment.user

        db.session.delete(assignment)

        if was_primary:
            user.store_id = None

        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
        })


    @app.get("/api/messages")
    def list_messages():
        user_id = request.args.get("user_id", type=int)

        query = Message.query.order_by(Message.created_at.desc())

        if user_id:
            query = (
                query
                .join(MessageRecipient)
                .filter(MessageRecipient.user_id == user_id)
            )

        messages = query.all()

        return jsonify({
            "success": True,
            "messages": [serialize_message(message, user_id=user_id) for message in messages],
        })

    @app.post("/api/messages")
    def create_message():
        data = request.get_json() or {}

        sender_user_id = data.get("sender_user_id")
        title = (data.get("title") or "").strip()
        body = (data.get("body") or "").strip()
        recipient_user_ids = data.get("recipient_user_ids") or []

        if not sender_user_id or not title or not body or not recipient_user_ids:
            return jsonify({
                "success": False,
                "error": "sender_user_id, title, body, and recipient_user_ids are required.",
            }), 400

        sender = User.query.get(sender_user_id)
        if not sender:
            return jsonify({"success": False, "error": "Sender not found."}), 404

        message = Message(
            sender_user_id=sender.id,
            title=title,
            body=body,
            message_type=data.get("message_type", "private"),
            priority=data.get("priority", "normal"),
            target_type=data.get("target_type", "individual"),
            target_label=data.get("target_label"),
            requires_ack=bool(data.get("requires_ack", False)),
        )
        db.session.add(message)
        db.session.flush()

        for recipient_id in recipient_user_ids:
            user = User.query.get(recipient_id)
            if user:
                db.session.add(MessageRecipient(message_id=message.id, user_id=user.id))

        db.session.commit()

        return jsonify({
            "success": True,
            "message": serialize_message(message),
        }), 201

    @app.post("/api/messages/<int:message_id>/read")
    def mark_message_read(message_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")

        recipient = MessageRecipient.query.filter_by(
            message_id=message_id,
            user_id=user_id,
        ).first()

        if not recipient:
            return jsonify({"success": False, "error": "Recipient record not found."}), 404

        recipient.read_at = datetime.utcnow()
        db.session.commit()

        return jsonify({"success": True})

    @app.post("/api/messages/<int:message_id>/acknowledge")
    def acknowledge_message(message_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")

        recipient = MessageRecipient.query.filter_by(
            message_id=message_id,
            user_id=user_id,
        ).first()

        if not recipient:
            return jsonify({"success": False, "error": "Recipient record not found."}), 404

        recipient.read_at = recipient.read_at or datetime.utcnow()
        recipient.acknowledged_at = datetime.utcnow()
        db.session.commit()

        return jsonify({"success": True})


    @app.get("/api/threads")
    def list_threads():
        user_id = request.args.get("user_id", type=int)

        query = Thread.query.order_by(Thread.created_at.desc())

        if user_id:
            query = (
                query
                .join(ThreadMember)
                .filter(ThreadMember.user_id == user_id)
            )

        threads = query.all()

        return jsonify({
            "success": True,
            "threads": [serialize_thread(thread, user_id=user_id) for thread in threads],
        })

    @app.post("/api/threads/direct")
    def find_or_create_direct_thread():
        data = request.get_json() or {}

        sender_user_id = data.get("sender_user_id")
        recipient_user_id = data.get("recipient_user_id")

        if not sender_user_id or not recipient_user_id:
            return jsonify({
                "success": False,
                "error": "sender_user_id and recipient_user_id are required.",
            }), 400

        if int(sender_user_id) == int(recipient_user_id):
            return jsonify({
                "success": False,
                "error": "Cannot create a direct thread with yourself.",
            }), 400

        sender = User.query.get(sender_user_id)
        recipient = User.query.get(recipient_user_id)

        if not sender or not recipient:
            return jsonify({
                "success": False,
                "error": "Sender or recipient not found.",
            }), 404

        ordered_ids = sorted([int(sender.id), int(recipient.id)])
        group_key = f"direct-{ordered_ids[0]}-{ordered_ids[1]}"

        thread = Thread.query.filter_by(group_key=group_key).first()

        if not thread:
            thread = Thread(
                thread_type="direct",
                name=f"{sender.name} + {recipient.name}",
                group_key=group_key,
                created_by_user_id=sender.id,
            )
            db.session.add(thread)
            db.session.flush()

            db.session.add(ThreadMember(thread_id=thread.id, user_id=sender.id))
            db.session.add(ThreadMember(thread_id=thread.id, user_id=recipient.id))
            db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, user_id=sender.id),
        })

    @app.post("/api/thread-messages/<int:message_id>/reactions")
    def toggle_thread_message_reaction(message_id):
        data = request.get_json() or {}

        user_id = data.get("user_id")
        emoji = (data.get("emoji") or "👍").strip()

        if not user_id:
            return jsonify({
                "success": False,
                "error": "user_id is required.",
            }), 400

        message = ThreadMessage.query.get(message_id)
        user = User.query.get(user_id)

        if not message:
            return jsonify({"success": False, "error": "Message not found."}), 404

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        existing = ThreadMessageReaction.query.filter_by(
            thread_message_id=message.id,
            user_id=user.id,
            emoji=emoji,
        ).first()

        action = "added"

        if existing:
            db.session.delete(existing)
            action = "removed"
        else:
            db.session.add(ThreadMessageReaction(
                thread_message_id=message.id,
                user_id=user.id,
                emoji=emoji,
            ))

        db.session.commit()

        return jsonify({
            "success": True,
            "action": action,
            "message_id": message.id,
            "reactions": serialize_message_reactions(message, user.id),
        })


    @app.get("/api/threads/<int:thread_id>/messages")
    def list_thread_messages(thread_id):
        user_id = request.args.get("user_id", type=int)

        thread = Thread.query.get(thread_id)
        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        messages = (
            ThreadMessage.query
            .filter_by(thread_id=thread.id)
            .order_by(ThreadMessage.created_at.asc())
            .all()
        )

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, user_id=user_id),
            "messages": [serialize_thread_message(message, user_id=user_id) for message in messages],
        })

    @app.post("/api/threads/<int:thread_id>/messages")
    def create_thread_message(thread_id):
        data = request.get_json() or {}

        sender_user_id = data.get("sender_user_id")
        body = (data.get("body") or "").strip()
        requires_ack = bool(data.get("requires_ack", False))

        if not sender_user_id or not body:
            return jsonify({
                "success": False,
                "error": "sender_user_id and body are required.",
            }), 400

        thread = Thread.query.get(thread_id)
        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        sender = User.query.get(sender_user_id)
        if not sender:
            return jsonify({"success": False, "error": "Sender not found."}), 404

        membership = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=sender.id,
        ).first()

        if not membership:
            return jsonify({"success": False, "error": "Sender is not a member of this thread."}), 403

        message = ThreadMessage(
            thread_id=thread.id,
            sender_user_id=sender.id,
            body=body,
            requires_ack=requires_ack,
        )
        db.session.add(message)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": serialize_thread_message(message, user_id=sender.id),
        }), 201

    @app.post("/api/threads/<int:thread_id>/read")
    def mark_thread_read(thread_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")

        membership = ThreadMember.query.filter_by(
            thread_id=thread_id,
            user_id=user_id,
        ).first()

        if not membership:
            return jsonify({"success": False, "error": "Thread membership not found."}), 404

        membership.last_read_at = datetime.utcnow()
        db.session.commit()

        return jsonify({"success": True})

    @app.post("/api/thread-messages/<int:thread_message_id>/acknowledge")
    def acknowledge_thread_message(thread_message_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")

        message = ThreadMessage.query.get(thread_message_id)
        if not message:
            return jsonify({"success": False, "error": "Thread message not found."}), 404

        existing_ack = ThreadMessageAck.query.filter_by(
            thread_message_id=message.id,
            user_id=user_id,
        ).first()

        if not existing_ack:
            ack = ThreadMessageAck(
                thread_message_id=message.id,
                user_id=user_id,
            )
            db.session.add(ack)

        membership = ThreadMember.query.filter_by(
            thread_id=message.thread_id,
            user_id=user_id,
        ).first()

        if membership:
            membership.last_read_at = datetime.utcnow()

        db.session.commit()

        return jsonify({"success": True})

    return app



def send_invite_email(user, invite_url):
    resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
    invite_email_from = os.getenv("INVITE_EMAIL_FROM", "BPI Connect <onboarding@resend.dev>").strip()

    if not resend_api_key:
        return {
            "sent": False,
            "error": "RESEND_API_KEY is not configured.",
        }

    if not user.email:
        return {
            "sent": False,
            "error": "User email is missing.",
        }

    html = f"""
    <div style="font-family: Arial, sans-serif; color: #10212b; line-height: 1.5; max-width: 560px;">
      <h2 style="margin-bottom: 8px;">You’re invited to BPI Connect</h2>
      <p>Hi {user.name},</p>
      <p>You’ve been invited to join BPI Connect for Boston Pie team communication.</p>
      <p style="margin: 24px 0;">
        <a href="{invite_url}" style="background:#e91f3f;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:bold;display:inline-block;">
          Set up your account
        </a>
      </p>
      <p>If the button does not work, copy and paste this link:</p>
      <p style="word-break: break-all; color:#526273;">{invite_url}</p>
      <p style="color:#697b8d;font-size:13px;margin-top:24px;">
        This invite was sent by Boston Pie, Inc.
      </p>
    </div>
    """

    text_body = f"""Hi {user.name},

You’ve been invited to join BPI Connect for Boston Pie team communication.

Set up your account:
{invite_url}

This invite was sent by Boston Pie, Inc.
"""

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": invite_email_from,
            "to": [user.email],
            "subject": "You’re invited to BPI Connect",
            "html": html,
            "text": text_body,
        },
        timeout=12,
    )

    if response.status_code >= 400:
        return {
            "sent": False,
            "error": response.text,
        }

    try:
        data = response.json()
    except Exception:
        data = {}

    return {
        "sent": True,
        "provider_response": data,
    }


def serialize_user(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "role": user.role,
        "store": user.store.store_number if user.store else None,
        "store_name": user.store.name if user.store else None,
        "area": user.area.name if user.area else None,
        "is_active": user.is_active,
        "invite_sent_at": user.invite_sent_at.isoformat() if user.invite_sent_at else None,
        "invite_accepted_at": user.invite_accepted_at.isoformat() if user.invite_accepted_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


def serialize_message(message, user_id=None):
    recipient = None

    if user_id:
        recipient = MessageRecipient.query.filter_by(
            message_id=message.id,
            user_id=user_id,
        ).first()

    return {
        "id": message.id,
        "sender": serialize_user(message.sender),
        "title": message.title,
        "body": message.body,
        "message_type": message.message_type,
        "priority": message.priority,
        "target_type": message.target_type,
        "target_label": message.target_label,
        "requires_ack": message.requires_ack,
        "created_at": message.created_at.isoformat(),
        "read_at": recipient.read_at.isoformat() if recipient and recipient.read_at else None,
        "acknowledged_at": recipient.acknowledged_at.isoformat() if recipient and recipient.acknowledged_at else None,
    }

def serialize_thread(thread, user_id=None):
    last_message = (
        ThreadMessage.query
        .filter_by(thread_id=thread.id)
        .order_by(ThreadMessage.created_at.desc())
        .first()
    )

    membership = None
    unread_count = 0

    if user_id:
        membership = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=user_id,
        ).first()

        if membership:
            message_query = ThreadMessage.query.filter_by(thread_id=thread.id)

            if membership.last_read_at:
                message_query = message_query.filter(ThreadMessage.created_at > membership.last_read_at)

            unread_count = message_query.filter(ThreadMessage.sender_user_id != user_id).count()

    return {
        "id": thread.id,
        "thread_type": thread.thread_type,
        "name": thread.name,
        "group_key": thread.group_key,
        "created_at": thread.created_at.isoformat(),
        "last_message": last_message.body if last_message else "",
        "last_time": last_message.created_at.isoformat() if last_message else None,
        "unread": unread_count,
        "members": [serialize_user(member.user) for member in thread.members],
        "muted": membership.muted if membership else False,
    }


def serialize_thread_message(message, user_id=None):
    acknowledged = False

    if user_id:
        acknowledged = ThreadMessageAck.query.filter_by(
            thread_message_id=message.id,
            user_id=user_id,
        ).first() is not None

    return {
        "id": message.id,
        "thread_id": message.thread_id,
        "sender": serialize_user(message.sender),
        "body": message.body,
        "requires_ack": message.requires_ack,
        "acknowledged": acknowledged,
        "created_at": message.created_at.isoformat(),
        "is_me": message.sender_user_id == user_id if user_id else False,
    }

def serialize_store(store):
    return {
        "id": store.id,
        "store_number": store.store_number,
        "name": store.name,
        "area": store.area.name if store.area else None,
        "is_active": store.is_active,
    }


def serialize_store_assignment(assignment):
    return {
        "id": assignment.id,
        "assignment_type": assignment.assignment_type,
        "store": serialize_store(assignment.store),
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
    }


def serialize_user_detail(user):
    data = serialize_user(user)
    data["store_assignments"] = [
        serialize_store_assignment(assignment)
        for assignment in sorted(
            user.store_assignments,
            key=lambda item: (item.assignment_type, item.store.store_number),
        )
    ]
    return data

def serialize_area(area):
    return {
        "id": area.id,
        "name": area.name,
        "created_at": area.created_at.isoformat() if area.created_at else None,
    }

def serialize_message_reactions(message, current_user_id=None):
    counts = {}
    reacted_by_me = {}

    for reaction in message.reactions:
        counts[reaction.emoji] = counts.get(reaction.emoji, 0) + 1

        if current_user_id and int(reaction.user_id) == int(current_user_id):
            reacted_by_me[reaction.emoji] = True

    return [
        {
            "emoji": emoji,
            "count": count,
            "reacted_by_me": bool(reacted_by_me.get(emoji)),
        }
        for emoji, count in sorted(counts.items())
    ]

