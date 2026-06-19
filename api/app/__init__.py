import os
import re
import secrets
import base64
import hashlib
import time
import requests
from datetime import datetime
from secrets import token_urlsafe

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, join_room
from werkzeug.security import generate_password_hash, check_password_hash

from app.extensions import db
from app.models import (
    Area,
    Store,
    User,
    UserStoreAssignment,
    Message,
    MessageRecipient,
    Thread,
    ThreadMember,
    ThreadFavorite,
    ThreadMessage,
    ThreadMessageAck,
    ThreadMessageAttachment,
    ThreadMessageReaction,
    PushToken,
)
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode="threading",
    ping_timeout=30,
    ping_interval=10,
)


def get_store_thread_key(store):
    return f"store:{store.store_number}"


def ensure_store_thread(store, created_by_user_id=None):
    group_key = get_store_thread_key(store)

    thread = Thread.query.filter_by(group_key=group_key).first()

    if not thread:
        thread = Thread(
            thread_type="store",
            name=f"Store {store.store_number}",
            group_key=group_key,
            created_by_user_id=created_by_user_id,
        )
        db.session.add(thread)
        db.session.flush()

    return thread


def ensure_thread_member(thread_id, user_id):
    existing = ThreadMember.query.filter_by(
        thread_id=thread_id,
        user_id=user_id,
    ).first()

    if not existing:
        db.session.add(ThreadMember(thread_id=thread_id, user_id=user_id))


def sync_user_to_store_chat(user, store):
    if not user or not store:
        return None

    thread = ensure_store_thread(store, created_by_user_id=user.id)
    ensure_thread_member(thread.id, user.id)
    return thread


def get_company_thread_key():
    return "company:company-announcements"


def ensure_company_thread(created_by_user_id=None):
    group_key = get_company_thread_key()

    thread = Thread.query.filter_by(group_key=group_key).first()

    if not thread:
        thread = Thread(
            thread_type="company",
            name="Company Announcements",
            group_key=group_key,
            created_by_user_id=created_by_user_id,
        )
        db.session.add(thread)
        db.session.flush()

    return thread


def get_area_thread_key(area):
    safe_name = str(area.name).strip().lower().replace(" ", "-")
    return f"area:{safe_name}"


def ensure_area_thread(area, created_by_user_id=None):
    if not area:
        return None

    if str(area.name or "").strip().lower() == "company":
        return None

    group_key = get_area_thread_key(area)

    thread = Thread.query.filter_by(group_key=group_key).first()

    if not thread:
        thread = Thread(
            thread_type="area",
            name=f"{area.name} Area",
            group_key=group_key,
            created_by_user_id=created_by_user_id,
        )
        db.session.add(thread)
        db.session.flush()

    return thread


def get_role_thread_key(role):
    return f"role:{str(role).strip().lower()}"


def get_role_thread_name(role):
    role_map = {
        "admin": "Admins",
        "hr": "HR",
        "coach": "Coaches",
        "supervisor": "Coaches",
        "general_manager": "General Managers",
        "manager": "MITs",
        "tm": "TMs",
    }

    return role_map.get(str(role).strip().lower(), str(role).strip().title())


def ensure_role_thread(role, created_by_user_id=None):
    if not role:
        return None

    role_key = str(role).strip().lower()
    group_key = get_role_thread_key(role_key)

    thread = Thread.query.filter_by(group_key=group_key).first()

    if not thread:
        thread = Thread(
            thread_type="role",
            name=get_role_thread_name(role_key),
            group_key=group_key,
            created_by_user_id=created_by_user_id,
        )
        db.session.add(thread)
        db.session.flush()

    return thread


def sync_user_to_default_chats(user):
    if not user:
        return

    desired_group_keys = set()

    if user.is_active:
        company_thread = ensure_company_thread(created_by_user_id=user.id)
        desired_group_keys.add(company_thread.group_key)

        role_thread = ensure_role_thread(user.role, created_by_user_id=user.id)
        if role_thread:
            desired_group_keys.add(role_thread.group_key)

        if user.area:
            area_thread = ensure_area_thread(user.area, created_by_user_id=user.id)
            if area_thread:
                desired_group_keys.add(area_thread.group_key)

        assigned_stores = []

        if user.store:
            assigned_stores.append(user.store)

        for assignment in getattr(user, "store_assignments", []) or []:
            if assignment.store:
                assigned_stores.append(assignment.store)

        seen_store_ids = set()

        for store in assigned_stores:
            if store.id in seen_store_ids:
                continue

            seen_store_ids.add(store.id)
            store_thread = ensure_store_thread(store, created_by_user_id=user.id)

            if store_thread:
                desired_group_keys.add(store_thread.group_key)

    auto_threads = Thread.query.filter(
        Thread.thread_type.in_(["company", "area", "store", "role"])
    ).all()

    for thread in auto_threads:
        membership = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=user.id,
        ).first()

        should_be_member = thread.group_key in desired_group_keys

        if should_be_member and not membership:
            db.session.add(ThreadMember(thread_id=thread.id, user_id=user.id))

        if membership and not should_be_member:
            db.session.delete(membership)





def user_store_ids(user):
    if not user:
        return set()

    store_ids = set()

    if user.store_id:
        store_ids.add(user.store_id)

    for assignment in getattr(user, "store_assignments", []) or []:
        if assignment.store_id:
            store_ids.add(assignment.store_id)

    return store_ids


def user_is_admin_or_hr(user):
    return (user.role or "").strip().lower() in {"admin", "hr"} if user else False


def user_is_area_leader(user):
    return (user.role or "").strip().lower() in {"coach", "supervisor"} if user else False


def can_user_message_user(sender, recipient):
    if not sender or not recipient:
        return False

    if not sender.is_active or not recipient.is_active:
        return False

    if int(sender.id) == int(recipient.id):
        return False

    sender_role = (sender.role or "").strip().lower()

    if sender_role in {"admin", "hr"}:
        return True

    sender_stores = user_store_ids(sender)
    recipient_stores = user_store_ids(recipient)

    if sender_stores and recipient_stores and sender_stores.intersection(recipient_stores):
        return True

    if sender_role in {"coach", "supervisor"}:
        if sender.area_id and recipient.area_id and sender.area_id == recipient.area_id:
            return True

    return False


def can_user_access_thread(user, thread):
    if not user or not thread:
        return False

    membership = ThreadMember.query.filter_by(
        thread_id=thread.id,
        user_id=user.id,
    ).first()

    if membership:
        return True

    # Admin/HR can access group/company/store/area/role threads without explicit membership.
    # Direct messages still require membership.
    if user_is_admin_or_hr(user) and thread.thread_type != "direct":
        return True

    return False


def require_thread_access(user_id, thread):
    if not user_id:
        return None, (jsonify({
            "success": False,
            "error": "user_id is required.",
        }), 400)

    user = User.query.get(user_id)

    if not user:
        return None, (jsonify({
            "success": False,
            "error": "User not found.",
        }), 404)

    if not can_user_access_thread(user, thread):
        return None, (jsonify({
            "success": False,
            "error": "You do not have access to this thread.",
        }), 403)

    return user, None



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
    socketio.init_app(app, cors_allowed_origins="*")

    def ensure_user_phone_number_column():
        inspector = db.inspect(db.engine)

        if "users" not in inspector.get_table_names():
            return

        existing_columns = {column["name"] for column in inspector.get_columns("users")}

        if "phone_number" in existing_columns:
            return

        engine_name = db.engine.url.get_backend_name()

        with db.engine.begin() as connection:
            if engine_name == "postgresql":
                connection.execute(db.text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(40)"
                ))
            else:
                connection.execute(db.text(
                    "ALTER TABLE users ADD COLUMN phone_number VARCHAR(40)"
                ))

    with app.app_context():
        ensure_user_phone_number_column()


    @app.post("/dev/remove-company-area-chat")
    def dev_remove_company_area_chat():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        thread = Thread.query.filter_by(group_key="area:company").first()

        if not thread:
            thread = Thread.query.filter(
                db.func.lower(Thread.name) == "company area"
            ).first()

        if not thread:
            return jsonify({
                "success": True,
                "removed": False,
                "message": "Company Area chat was not found.",
            })

        ThreadMember.query.filter_by(thread_id=thread.id).delete()
        ThreadMessage.query.filter_by(thread_id=thread.id).delete()
        db.session.delete(thread)
        db.session.commit()

        return jsonify({
            "success": True,
            "removed": True,
            "message": "Company Area chat removed.",
        })


    @app.post("/dev/backfill-default-chats")
    def dev_backfill_default_chats():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        users = User.query.filter_by(is_active=True).all()

        before_memberships = ThreadMember.query.count()
        before_threads = Thread.query.count()

        for user in users:
            sync_user_to_default_chats(user)

        db.session.commit()

        after_memberships = ThreadMember.query.count()
        after_threads = Thread.query.count()

        return jsonify({
            "success": True,
            "users_checked": len(users),
            "threads_created": after_threads - before_threads,
            "memberships_added": after_memberships - before_memberships,
        })


    @app.post("/dev/backfill-store-chats")
    def dev_backfill_store_chats():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        stores = Store.query.all()
        created_threads = 0
        added_members = 0

        for store in stores:
            before_thread = Thread.query.filter_by(group_key=get_store_thread_key(store)).first()
            thread = ensure_store_thread(store)
            if not before_thread:
                created_threads += 1

            assigned_user_ids = set()

            for assignment in UserStoreAssignment.query.filter_by(store_id=store.id).all():
                assigned_user_ids.add(assignment.user_id)

            for user in User.query.filter_by(store_id=store.id).all():
                assigned_user_ids.add(user.id)

            for user_id in assigned_user_ids:
                existing_member = ThreadMember.query.filter_by(
                    thread_id=thread.id,
                    user_id=user_id,
                ).first()

                if not existing_member:
                    ensure_thread_member(thread.id, user_id)
                    added_members += 1

        db.session.commit()

        return jsonify({
            "success": True,
            "stores_checked": len(stores),
            "store_threads_created": created_threads,
            "members_added": added_members,
        })


    @app.get("/dev/push-tokens")
    def dev_push_tokens():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        tokens = PushToken.query.order_by(PushToken.updated_at.desc()).all()

        return jsonify({
            "success": True,
            "count": len(tokens),
            "tokens": [
                {
                    "id": item.id,
                    "user_id": item.user_id,
                    "user": item.user.name if item.user else None,
                    "email": item.user.email if item.user else None,
                    "token_preview": f"{item.token[:24]}..." if item.token else None,
                    "platform": item.platform,
                    "device_name": item.device_name,
                    "is_active": item.is_active,
                    "updated_at": item.updated_at.isoformat() if item.updated_at else None,
                }
                for item in tokens
            ],
        })


    @app.post("/dev/test-push")
    def dev_test_push():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        data = request.get_json(silent=True) or {}
        user_id = data.get("user_id")

        if not user_id:
            return jsonify({"success": False, "error": "user_id is required."}), 400

        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        tokens = [
            item.token
            for item in PushToken.query.filter_by(user_id=user.id, is_active=True).all()
        ]

        result = send_expo_push_notifications(
            tokens=tokens,
            title="BPI Connect Test",
            body="Push notifications are connected.",
            data={"type": "test_push"},
        )

        return jsonify({
            "success": True,
            "user": serialize_user(user),
            "token_count": len(tokens),
            "push_result": result,
        })



    @app.get("/dev/media-config")
    def dev_media_config():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        return jsonify({
            "success": True,
            "has_cloudinary_cloud_name": bool(os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()),
            "has_cloudinary_api_key": bool(os.getenv("CLOUDINARY_API_KEY", "").strip()),
            "has_cloudinary_api_secret": bool(os.getenv("CLOUDINARY_API_SECRET", "").strip()),
        })


    @app.get("/dev/email-config")
    def dev_email_config():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        return jsonify({
            "success": True,
            "from_email": get_outbound_email_sender(),
            "has_resend_api_key": bool(os.getenv("RESEND_API_KEY", "").strip()),
            "has_invite_email_from": bool(os.getenv("INVITE_EMAIL_FROM", "").strip()),
            "has_invite_from_email": bool(os.getenv("INVITE_FROM_EMAIL", "").strip()),
            "has_resend_from_email": bool(os.getenv("RESEND_FROM_EMAIL", "").strip()),
            "has_password_reset_from_email": bool(os.getenv("PASSWORD_RESET_FROM_EMAIL", "").strip()),
            "has_from_email": bool(os.getenv("FROM_EMAIL", "").strip()),
        })


    @socketio.on("connect")
    def socket_connect():
        return True


    @socketio.on("join_user")
    def socket_join_user(data):
        user_id = data.get("user_id") if isinstance(data, dict) else None

        if not user_id:
            return {"success": False, "error": "user_id is required."}

        user = User.query.get(user_id)

        if not user:
            return {"success": False, "error": "User not found."}

        join_room(f"user:{user.id}")

        memberships = ThreadMember.query.filter_by(user_id=user.id).all()

        for membership in memberships:
            join_room(f"thread:{membership.thread_id}")

        return {
            "success": True,
            "user_id": user.id,
            "threads_joined": len(memberships),
        }


    @socketio.on("thread_typing")
    def socket_thread_typing(data):
        if not isinstance(data, dict):
            return {"success": False, "error": "Invalid payload."}

        user_id = data.get("user_id")
        thread_id = data.get("thread_id")
        is_typing = bool(data.get("is_typing"))

        if not user_id or not thread_id:
            return {"success": False, "error": "user_id and thread_id are required."}

        user = User.query.get(user_id)
        thread = Thread.query.get(thread_id)

        if not user or not thread:
            return {"success": False, "error": "User or thread not found."}

        membership = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=user.id,
        ).first()

        if not membership:
            return {"success": False, "error": "User is not a thread member."}

        socketio.emit(
            "thread_typing",
            {
                "thread_id": thread.id,
                "user_id": user.id,
                "user_name": user.name,
                "is_typing": is_typing,
            },
            room=f"thread:{thread.id}",
            skip_sid=request.sid,
        )

        return {"success": True}


    @socketio.on("typing_started")
    def socket_typing_started(data):
        user_id = data.get("user_id") if isinstance(data, dict) else None
        thread_id = data.get("thread_id") if isinstance(data, dict) else None

        if not user_id or not thread_id:
            return {"success": False, "error": "user_id and thread_id are required."}

        user = User.query.get(user_id)
        membership = ThreadMember.query.filter_by(
            thread_id=thread_id,
            user_id=user_id,
        ).first()

        if not user or not membership:
            return {"success": False, "error": "User is not a member of this thread."}

        socketio.emit(
            "thread_typing_started",
            {
                "thread_id": int(thread_id),
                "user": serialize_user(user),
            },
            room=f"thread:{thread_id}",
            include_self=False,
        )

        return {"success": True}


    @socketio.on("typing_stopped")
    def socket_typing_stopped(data):
        user_id = data.get("user_id") if isinstance(data, dict) else None
        thread_id = data.get("thread_id") if isinstance(data, dict) else None

        if not user_id or not thread_id:
            return {"success": False, "error": "user_id and thread_id are required."}

        user = User.query.get(user_id)
        membership = ThreadMember.query.filter_by(
            thread_id=thread_id,
            user_id=user_id,
        ).first()

        if not user or not membership:
            return {"success": False, "error": "User is not a member of this thread."}

        socketio.emit(
            "thread_typing_stopped",
            {
                "thread_id": int(thread_id),
                "user": serialize_user(user),
            },
            room=f"thread:{thread_id}",
            include_self=False,
        )

        return {"success": True}


    @app.get("/")
    def health():
        return jsonify({
            "success": True,
            "app": "BPI Connect API",
            "status": "running",
        })



    def is_valid_email_address(email):
        email = (email or "").strip()
        return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


    def require_admin_actor(data=None):
        data = data or {}
        actor_user_id = (
            data.get("actor_user_id")
            or data.get("admin_user_id")
            or request.args.get("actor_user_id", type=int)
            or request.args.get("admin_user_id", type=int)
        )

        if not actor_user_id:
            return None, (jsonify({
                "success": False,
                "error": "Admin actor is required.",
            }), 403)

        actor = User.query.get(actor_user_id)
        actor_role = (actor.role or "").strip().lower() if actor else ""

        if not actor or not actor.is_active or actor_role not in {"admin", "hr"}:
            return None, (jsonify({
                "success": False,
                "error": "Admin or HR access is required.",
            }), 403)

        return actor, None



    def require_bpi_ops_integration_secret():
        expected_secret = os.getenv("BPI_OPS_INTEGRATION_SECRET", "").strip()
        provided_secret = (
            request.headers.get("X-BPI-Ops-Secret", "").strip()
            or request.headers.get("X-Integration-Secret", "").strip()
        )

        if not expected_secret:
            return jsonify({
                "success": False,
                "error": "BPI_OPS_INTEGRATION_SECRET is not configured.",
            }), 403

        if provided_secret != expected_secret:
            return jsonify({
                "success": False,
                "error": "Unauthorized integration request.",
            }), 403

        return None


    def normalize_bpi_connect_role(role, position=None):
        raw_role = (role or "").strip().lower()
        raw_position = (position or "").strip().lower()

        if raw_role in {"admin", "hr", "coach", "supervisor", "general_manager", "manager", "tm", "maintenance"}:
            return raw_role

        if raw_role in {"driver", "csr", "customer service rep", "customer_service"}:
            return "tm"

        if raw_role in {"gm", "general manager"}:
            return "general_manager"

        if raw_role in {"mit", "shift runner", "shift_runner"}:
            return "manager"

        if raw_position in {"driver", "csr", "customer service rep", "customer_service"}:
            return "tm"

        if raw_position in {"gm", "general manager"}:
            return "general_manager"

        if raw_position in {"mit", "shift runner", "shift_runner"}:
            return "manager"

        if raw_position in {"supervisor", "coach", "hr", "maintenance"}:
            return raw_position

        return "tm"


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


    @app.post("/dev/migrate-push-tokens")
    def migrate_push_tokens_table():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        db.create_all()

        try:
            ThreadFavorite.__table__.create(db.engine, checkfirst=True)
        except Exception:
            pass

        return jsonify({
            "success": True,
            "message": "Push token table migrated.",
        })




    @app.post("/dev/migrate-username-login")
    def migrate_username_login():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        engine_name = db.engine.url.get_backend_name()

        with db.engine.begin() as connection:
            if engine_name == "postgresql":
                connection.execute(db.text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(120)"
                ))
                connection.execute(db.text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"
                ))
            else:
                existing_columns = [
                    row[1] for row in connection.execute(db.text("PRAGMA table_info(users)")).fetchall()
                ]

                if "username" not in existing_columns:
                    connection.execute(db.text(
                        "ALTER TABLE users ADD COLUMN username VARCHAR(120)"
                    ))

        return jsonify({
            "success": True,
            "message": "Username login field migrated.",
        })


    @app.post("/dev/migrate-bpi-ops-user-link")
    def migrate_bpi_ops_user_link():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        engine_name = db.engine.url.get_backend_name()

        with db.engine.begin() as connection:
            if engine_name == "postgresql":
                connection.execute(db.text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS bpi_ops_user_id INTEGER"
                ))
                connection.execute(db.text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_bpi_ops_user_id ON users (bpi_ops_user_id)"
                ))
            else:
                existing_columns = [
                    row[1] for row in connection.execute(db.text("PRAGMA table_info(users)")).fetchall()
                ]

                if "bpi_ops_user_id" not in existing_columns:
                    connection.execute(db.text(
                        "ALTER TABLE users ADD COLUMN bpi_ops_user_id INTEGER"
                    ))

        return jsonify({
            "success": True,
            "message": "BPI Ops user link field migrated.",
        })


    @app.post("/dev/migrate-password-reset")
    def migrate_password_reset_fields():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        # db.create_all does not add columns to existing tables, so use safe ALTER TABLE.
        engine_name = db.engine.url.get_backend_name()

        with db.engine.begin() as connection:
            if engine_name == "postgresql":
                connection.execute(db.text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255)"
                ))
                connection.execute(db.text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMP"
                ))
            else:
                existing_columns = [
                    row[1] for row in connection.execute(db.text("PRAGMA table_info(users)")).fetchall()
                ]

                if "password_reset_token" not in existing_columns:
                    connection.execute(db.text(
                        "ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255)"
                    ))

                if "password_reset_sent_at" not in existing_columns:
                    connection.execute(db.text(
                        "ALTER TABLE users ADD COLUMN password_reset_sent_at DATETIME"
                    ))

        return jsonify({
            "success": True,
            "message": "Password reset fields migrated.",
        })


    @app.post("/dev/migrate-attachments")
    def migrate_attachments_table():
        auth_error = require_dev_admin_secret()
        if auth_error:
            return auth_error

        db.create_all()

        try:
            ThreadFavorite.__table__.create(db.engine, checkfirst=True)
        except Exception:
            pass

        return jsonify({
            "success": True,
            "message": "Attachment tables migrated.",
        })


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

        try:
            ThreadFavorite.__table__.create(db.engine, checkfirst=True)
        except Exception:
            pass

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

        try:
            ThreadFavorite.__table__.create(db.engine, checkfirst=True)
        except Exception:
            pass

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

    @app.post("/api/auth/forgot-password")
    def forgot_password():
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()

        generic_response = jsonify({
            "success": True,
            "message": "If that email exists, a password reset link has been sent.",
        })

        if not email:
            return generic_response

        user = User.query.filter(db.func.lower(User.email) == email).first()

        if not user:
            return generic_response

        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_sent_at = datetime.utcnow()
        db.session.commit()

        base_url = os.getenv("APP_WEB_BASE_URL", "https://bpi-connect.onrender.com").strip().rstrip("/")
        reset_url = f"{base_url}/reset-password/{token}"

        send_password_reset_email(user, reset_url)

        return generic_response


    @app.post("/api/users/<int:user_id>/send-password-reset")
    def send_user_password_reset(user_id):
        data = request.get_json(silent=True) or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_sent_at = datetime.utcnow()
        db.session.commit()

        base_url = os.getenv("APP_WEB_BASE_URL", "https://bpi-connect.onrender.com").strip().rstrip("/")
        reset_url = f"{base_url}/reset-password/{token}"

        email_result = send_password_reset_email(user, reset_url)

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
            "reset_url": reset_url,
            "reset_email_sent": email_result.get("sent", False),
            "reset_email_error": email_result.get("error"),
        })


    @app.get("/reset-password/<token>")
    def reset_password_page(token):
        user = User.query.filter_by(password_reset_token=token).first()

        if not user:
            return """
            <!doctype html>
            <html>
              <head>
                <title>Password Reset Not Found</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <style>
                  body { font-family: Arial, sans-serif; background:#f4f7fb; margin:0; padding:30px; }
                  .card { max-width:520px; margin:40px auto; background:#fff; padding:28px; border-radius:22px; box-shadow:0 16px 40px rgba(16,33,43,.12); }
                  h1 { color:#10212b; }
                  p { color:#526273; line-height:1.5; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>Reset link not found</h1>
                  <p>This reset link is invalid or has already been used.</p>
                </div>
              </body>
            </html>
            """, 404

        return f"""
        <!doctype html>
        <html>
          <head>
            <title>Reset BPI Connect Password</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body {{
                font-family: Arial, sans-serif;
                background:#f4f7fb;
                margin:0;
                padding:30px;
              }}
              .card {{
                max-width:520px;
                margin:40px auto;
                background:#fff;
                padding:28px;
                border-radius:22px;
                box-shadow:0 16px 40px rgba(16,33,43,.12);
              }}
              h1 {{ color:#10212b; margin-bottom:8px; }}
              p {{ color:#526273; line-height:1.5; }}
              label {{ display:block; font-weight:800; color:#10212b; margin:18px 0 8px; }}
              input {{
                width:100%;
                box-sizing:border-box;
                padding:14px;
                border-radius:14px;
                border:1px solid #d9e2ec;
                font-size:16px;
              }}
              button {{
                width:100%;
                margin-top:18px;
                border:0;
                background:#e91f3f;
                color:#fff;
                padding:14px 18px;
                border-radius:14px;
                font-weight:900;
                font-size:16px;
                cursor:pointer;
              }}
              .small {{ font-size:13px; color:#7b8da0; }}
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Reset Password</h1>
              <p>Set a new password for <strong>{user.email}</strong>.</p>

              <form method="POST">
                <label>New password</label>
                <input name="password" type="password" required placeholder="New password" />

                <label>Confirm password</label>
                <input name="confirm_password" type="password" required placeholder="Confirm password" />

                <button type="submit">Update Password</button>
              </form>

              <p class="small">Choose a password you can remember.</p>
            </div>
          </body>
        </html>
        """


    @app.post("/reset-password/<token>")
    def reset_password_submit(token):
        user = User.query.filter_by(password_reset_token=token).first()

        if not user:
            return "Reset link not found.", 404

        password = (request.form.get("password") or "").strip()
        confirm_password = (request.form.get("confirm_password") or "").strip()

        if not password:
            return "Password is required.", 400

        if password != confirm_password:
            return "Passwords do not match.", 400

        user.password_hash = generate_password_hash(password)
        user.password_reset_token = None
        user.password_reset_sent_at = None
        db.session.commit()

        return """
        <!doctype html>
        <html>
          <head>
            <title>Password Updated</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body { font-family: Arial, sans-serif; background:#f4f7fb; margin:0; padding:30px; }
              .card { max-width:520px; margin:40px auto; background:#fff; padding:28px; border-radius:22px; box-shadow:0 16px 40px rgba(16,33,43,.12); }
              h1 { color:#10212b; }
              p { color:#526273; line-height:1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Password Updated</h1>
              <p>Your BPI Connect password has been updated. You can now return to the app and sign in.</p>
            </div>
          </body>
        </html>
        """


    @app.post("/api/auth/login")
    def login():
        data = request.get_json() or {}

        login_identifier = (
            data.get("email")
            or data.get("username")
            or data.get("login")
            or ""
        ).strip().lower()
        password = data.get("password") or ""

        if not login_identifier or not password:
            return jsonify({
                "success": False,
                "error": "Email/username and password are required.",
            }), 400

        user = User.query.filter(
            db.or_(
                db.func.lower(User.email) == login_identifier,
                db.func.lower(User.username) == login_identifier,
            )
        ).first()

        if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
            return jsonify({
                "success": False,
                "error": "Invalid email/username or password.",
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


    @app.post("/api/users/<int:user_id>/resend-invite")
    def resend_user_invite(user_id):
        data = request.get_json(silent=True) or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        if user.invite_accepted_at:
            return jsonify({
                "success": False,
                "error": "This user has already accepted their invite.",
            }), 400

        if not user.invite_token:
            user.invite_token = secrets.token_urlsafe(32)

        user.invite_sent_at = datetime.utcnow()
        db.session.commit()

        app_invite_base_url = os.getenv("APP_INVITE_BASE_URL", "bpi-connect://accept-invite").strip().rstrip("/")
        invite_url = f"{app_invite_base_url}/{user.invite_token}"

        email_result = send_invite_email(user, invite_url)

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
            "invite_url": invite_url,
            "invite_email_sent": email_result.get("sent", False),
            "invite_email_error": email_result.get("error"),
        })


    @app.post("/api/users/invite")
    @app.post("/api/invites")
    def create_invite():
        data = request.get_json() or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        name = " ".join((data.get("name") or "").strip().split())
        email = (data.get("email") or "").strip().lower()
        phone_number = (data.get("phone_number") or data.get("phoneNumber") or "").strip()
        role = (data.get("role") or "").strip().lower()
        bpi_ops_user_id = data.get("bpi_ops_user_id") or data.get("bpiOpsUserId")
        store_number = (data.get("store_number") or data.get("storeNumber") or "").strip()
        area_name = (data.get("area") or data.get("areaName") or "").strip()

        try:
            bpi_ops_user_id = int(bpi_ops_user_id) if bpi_ops_user_id not in [None, ""] else None
        except (TypeError, ValueError):
            bpi_ops_user_id = None

        if not name or not email or not role:
            return jsonify({
                "success": False,
                "error": "name, email, and role are required.",
            }), 400

        if not is_valid_email_address(email):
            return jsonify({
                "success": False,
                "error": "A valid email address is required.",
            }), 400

        existing = User.query.filter(db.func.lower(User.email) == email).first()
        if existing:
            return jsonify({
                "success": False,
                "error": "A user with this email already exists.",
            }), 409

        if bpi_ops_user_id:
            existing_ops_link = User.query.filter_by(bpi_ops_user_id=bpi_ops_user_id).first()
            if existing_ops_link:
                return jsonify({
                    "success": False,
                    "error": "A BPI Ops user is already linked to another BPI Connect account.",
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
            phone_number=phone_number or None,
            bpi_ops_user_id=bpi_ops_user_id,
            role=role,
            store_id=store.id if store else None,
            area_id=area.id if area else None,
            invite_token=invite_token,
            invite_sent_at=datetime.utcnow(),
            is_active=True,
        )

        db.session.add(user)
        db.session.flush()

        if store:
            existing_assignment = UserStoreAssignment.query.filter_by(
                user_id=user.id,
                store_id=store.id,
                assignment_type="primary",
            ).first()

            if not existing_assignment:
                db.session.add(UserStoreAssignment(
                    user_id=user.id,
                    store_id=store.id,
                    assignment_type="primary",
                ))

            sync_user_to_store_chat(user, store)

        sync_user_to_default_chats(user)

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

        if user.store:
            sync_user_to_store_chat(user, user.store)

        sync_user_to_default_chats(user)

        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user(user),
        })




    @app.post("/api/integrations/bpi-ops/hr-documents/notify")
    def notify_bpi_ops_hr_document():
        auth_error = require_bpi_ops_integration_secret()
        if auth_error:
            return auth_error

        data = request.get_json(silent=True) or {}

        email = (data.get("email") or "").strip().lower()
        document_title = (data.get("document_title") or data.get("title") or "Required Document").strip()
        document_url = (data.get("document_url") or "").strip()
        due_date = (data.get("due_date") or "").strip()
        action = (data.get("action") or "assigned").strip()

        if not email:
            return jsonify({"success": False, "error": "email is required."}), 400

        user = User.query.filter(db.func.lower(User.email) == email).first()
        if not user:
            return jsonify({
                "success": False,
                "error": "No BPI Connect user found for that email.",
                "email": email,
            }), 404

        tokens = []
        for push_token in getattr(user, "push_tokens", []) or []:
            token_value = (
                getattr(push_token, "token", None)
                or getattr(push_token, "push_token", None)
                or getattr(push_token, "expo_push_token", None)
            )
            if token_value:
                tokens.append(token_value)

        title = "BPI Ops Document"
        if action == "resend":
            title = "BPI Ops Document Reminder"

        body = f"Tap to review and acknowledge: {document_title}"
        if due_date:
            body = f"{body} · Due {due_date}"

        push_result = None
        if tokens:
            push_result = send_expo_push_notifications(
                tokens,
                title=title,
                body=body,
                data={
                    "type": "hr_document",
                    "source": "bpi_ops",
                    "document_title": document_title,
                    "document_url": document_url,
                    "url": document_url,
                },
            )

        print(
            "BPI_OPS_HR_DOC_NOTIFY_RECEIVED",
            {
                "email": email,
                "user_id": user.id,
                "document_title": document_title,
                "token_count": len(tokens),
                "notified": bool(tokens),
                "push_result": push_result,
            },
            flush=True,
        )

        return jsonify({
            "success": True,
            "notified": bool(tokens),
            "user_id": user.id,
            "email": user.email,
        "phone_number": user.phone_number,
            "token_count": len(tokens),
            "push_result": push_result,
        })

    @app.post("/api/integrations/bpi-ops/users/sync")
    def sync_bpi_ops_user():
        auth_error = require_bpi_ops_integration_secret()
        if auth_error:
            return auth_error

        data = request.get_json() or {}

        bpi_ops_user_id = data.get("bpi_ops_user_id") or data.get("bpiOpsUserId")
        name = " ".join((data.get("name") or "").strip().split())
        username = (data.get("username") or "").strip().lower()
        email = (data.get("email") or "").strip().lower()
        phone_number = (data.get("phone_number") or data.get("phoneNumber") or "").strip()
        password_hash = (data.get("password_hash") or data.get("passwordHash") or "").strip()
        role = normalize_bpi_connect_role(data.get("role"), data.get("position"))
        store_number = (data.get("store_number") or data.get("storeNumber") or "").strip()
        area_name = (data.get("area") or data.get("area_name") or data.get("areaName") or "").strip()
        is_active = bool(data.get("is_active", True))
        send_invite = bool(data.get("send_invite", True))

        try:
            bpi_ops_user_id = int(bpi_ops_user_id) if bpi_ops_user_id not in [None, ""] else None
        except (TypeError, ValueError):
            bpi_ops_user_id = None

        if not bpi_ops_user_id:
            return jsonify({
                "success": False,
                "error": "bpi_ops_user_id is required.",
            }), 400

        if not name or not email:
            return jsonify({
                "success": False,
                "error": "name and email are required.",
            }), 400

        if not is_valid_email_address(email):
            return jsonify({
                "success": False,
                "error": "A valid email address is required.",
            }), 400

        area = None
        if area_name:
            area = Area.query.filter(db.func.lower(Area.name) == area_name.lower()).first()
            if not area:
                area = Area(name=area_name)
                db.session.add(area)
                db.session.flush()

        store = None
        if store_number:
            store = Store.query.filter_by(store_number=store_number).first()

            if not store:
                store = Store(
                    store_number=store_number,
                    name=f"Store {store_number}",
                    area_id=area.id if area else None,
                    is_active=True,
                )
                db.session.add(store)
                db.session.flush()
                ensure_store_thread(store)

            elif area and store.area_id != area.id:
                store.area_id = area.id

        if store and not area:
            area = store.area

        user = User.query.filter_by(bpi_ops_user_id=bpi_ops_user_id).first()
        action = "updated"

        if not user:
            user = User.query.filter(db.func.lower(User.email) == email).first()

            if user and user.bpi_ops_user_id and int(user.bpi_ops_user_id) != int(bpi_ops_user_id):
                return jsonify({
                    "success": False,
                    "error": "Email already belongs to another linked BPI Connect account.",
                }), 409

        if not user:
            action = "created"
            user = User(
                name=name,
                username=username or None,
                email=email,
                phone_number=phone_number or None,
                bpi_ops_user_id=bpi_ops_user_id,
                role=role,
                store_id=store.id if store else None,
                area_id=area.id if area else None,
                is_active=is_active,
            )
            db.session.add(user)
            db.session.flush()
        else:
            user.name = name
            user.username = username or user.username
            user.email = email
            user.phone_number = phone_number or None
            user.bpi_ops_user_id = bpi_ops_user_id
            user.role = role
            user.store_id = store.id if store else None
            user.area_id = area.id if area else None
            user.is_active = is_active

        if password_hash:
            user.password_hash = password_hash
            user.invite_accepted_at = user.invite_accepted_at or datetime.utcnow()
            user.invite_token = None

        if store:
            if role in {"coach", "supervisor"}:
                assignment_type = "oversight"
            else:
                assignment_type = "primary"

            if assignment_type == "primary":
                UserStoreAssignment.query.filter_by(
                    user_id=user.id,
                    assignment_type="primary",
                ).delete()
                user.store_id = store.id
                user.area_id = store.area_id or (area.id if area else None)

            existing_assignment = UserStoreAssignment.query.filter_by(
                user_id=user.id,
                store_id=store.id,
                assignment_type=assignment_type,
            ).first()

            if not existing_assignment:
                db.session.add(UserStoreAssignment(
                    user_id=user.id,
                    store_id=store.id,
                    assignment_type=assignment_type,
                ))

            sync_user_to_store_chat(user, store)

        sync_user_to_default_chats(user)

        invite_url = None
        invite_email_sent = False
        invite_email_error = None

        if send_invite and is_active and not user.invite_accepted_at:
            if not user.invite_token:
                user.invite_token = secrets.token_urlsafe(32)

            user.invite_sent_at = datetime.utcnow()

            app_invite_base_url = os.getenv("APP_INVITE_BASE_URL", "https://bpi-connect.onrender.com/invite").strip().rstrip("/")
            invite_url = f"{app_invite_base_url}/{user.invite_token}"

            email_result = send_invite_email(user, invite_url)
            invite_email_sent = email_result.get("sent", False)
            invite_email_error = email_result.get("error")

        db.session.commit()

        return jsonify({
            "success": True,
            "action": action,
            "user": serialize_user_detail(user),
            "invite_url": invite_url,
            "invite_email_sent": invite_email_sent,
            "invite_email_error": invite_email_error,
        })


    @app.post("/api/users/<int:user_id>/push-token")
    def save_user_push_token(user_id):
        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        data = request.get_json() or {}
        token = (data.get("token") or "").strip()
        platform = (data.get("platform") or "").strip() or None
        device_name = (data.get("device_name") or "").strip() or None

        if not token:
            return jsonify({
                "success": False,
                "error": "Push token is required.",
            }), 400

        existing = PushToken.query.filter_by(token=token).first()

        if existing:
            existing.user_id = user.id
            existing.platform = platform
            existing.device_name = device_name
            existing.is_active = True
        else:
            existing = PushToken(
                user_id=user.id,
                token=token,
                platform=platform,
                device_name=device_name,
                is_active=True,
            )
            db.session.add(existing)

        db.session.commit()

        return jsonify({
            "success": True,
            "push_token": {
                "id": existing.id,
                "user_id": existing.user_id,
                "token": existing.token,
                "platform": existing.platform,
                "device_name": existing.device_name,
                "is_active": existing.is_active,
            },
        })


    @app.get("/api/users")
    def list_users():
        query = User.query

        active = request.args.get("active")
        role = (request.args.get("role") or "").strip().lower()
        store_number = (request.args.get("store_number") or "").strip()
        search = (request.args.get("search") or "").strip().lower()
        viewer_user_id = request.args.get("viewer_user_id", type=int)

        viewer = User.query.get(viewer_user_id) if viewer_user_id else None

        if viewer:
            viewer_role = (viewer.role or "").strip().lower()

            if viewer_role not in ["admin", "hr"]:
                if viewer_role in ["coach", "supervisor"]:
                    oversight_store_ids = [
                        assignment.store_id
                        for assignment in UserStoreAssignment.query.filter_by(
                            user_id=viewer.id,
                            assignment_type="oversight",
                        ).all()
                    ]

                    if oversight_store_ids:
                        query = query.filter(
                            db.or_(
                                User.area_id == viewer.area_id,
                                User.store_id.in_(oversight_store_ids),
                            )
                        )
                    elif viewer.area_id:
                        query = query.filter(User.area_id == viewer.area_id)
                    else:
                        query = query.filter(User.id == viewer.id)
                else:
                    viewer_store_ids = list(user_store_ids(viewer))

                    if viewer_store_ids:
                        query = (
                            query
                            .outerjoin(UserStoreAssignment, UserStoreAssignment.user_id == User.id)
                            .filter(
                                db.or_(
                                    User.store_id.in_(viewer_store_ids),
                                    UserStoreAssignment.store_id.in_(viewer_store_ids),
                                )
                            )
                        )
                    elif viewer.area_id:
                        query = query.filter(User.area_id == viewer.area_id)
                    else:
                        query = query.filter(User.id == viewer.id)

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
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

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
        data = request.get_json(silent=True) or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

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
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

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
        db.session.flush()

        ensure_store_thread(store)

        db.session.commit()

        return jsonify({
            "success": True,
            "store": serialize_store(store),
        }), 201


    @app.patch("/api/stores/<int:store_id>")
    def update_store(store_id):
        data = request.get_json() or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        store = Store.query.get(store_id)

        if not store:
            return jsonify({"success": False, "error": "Store not found."}), 404

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

        signature_payload = f"folder={folder}&overwrite=true&public_id={public_id}&timestamp={timestamp}{api_secret}"
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
        data = request.get_json() or {}
        actor, actor_error = require_admin_actor(data)

        # Legacy mobile fallback:
        # Current App Store builds toggle active status without sending actor_user_id.
        # Limit this fallback ONLY to activate/deactivate requests.
        if actor_error and "is_active" in data and set(data.keys()).issubset({"is_active"}):
            actor = User.query.filter(
                User.is_active.is_(True),
                db.func.lower(User.role).in_(["admin", "hr"]),
            ).order_by(User.id.asc()).first()
            actor_error = None if actor else actor_error

        if actor_error:
            return actor_error

        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        if "name" in data:
            user.name = (data.get("name") or "").strip() or user.name

        if "email" in data:
            new_email = (data.get("email") or "").strip().lower()
            if new_email:
                if not is_valid_email_address(new_email):
                    return jsonify({
                        "success": False,
                        "error": "A valid email address is required.",
                    }), 400

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

        if "phone_number" in data or "phoneNumber" in data:
            phone_number = (data.get("phone_number") or data.get("phoneNumber") or "").strip()
            user.phone_number = phone_number or None

        role_changed = False

        if "role" in data:
            next_role = (data.get("role") or "").strip().lower() or user.role
            role_changed = next_role != user.role
            user.role = next_role

        if role_changed:
            sync_user_to_default_chats(user)

        if "avatar_url" in data:
            avatar_url = (data.get("avatar_url") or "").strip()
            user.avatar_url = avatar_url or None

        if "is_active" in data:
            user.is_active = bool(data.get("is_active"))

        sync_user_to_default_chats(user)

        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
        })



    @app.post("/api/users/<int:user_id>/delete-account")
    def delete_own_account(user_id):
        data = request.get_json(silent=True) or {}

        requester_user_id = data.get("requester_user_id")
        confirm_text = (data.get("confirm_text") or "").strip().upper()

        if int(requester_user_id or 0) != int(user_id):
            return jsonify({
                "success": False,
                "error": "You can only delete your own account from the app.",
            }), 403

        if confirm_text != "DELETE":
            return jsonify({
                "success": False,
                "error": "Type DELETE to confirm account deletion.",
            }), 400

        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        deleted_label = f"Deleted User {user.id}"
        deleted_email = f"deleted-user-{user.id}@deleted.bpi-connect.local"
        deleted_username = f"deleted_user_{user.id}"

        # Remove access and personal/contact data.
        # Keep non-personal placeholder email/username so uniqueness/null edge cases do not break later.
        user.is_active = False
        user.name = deleted_label
        user.email = deleted_email
        user.username = deleted_username
        user.phone_number = None
        user.avatar_url = None
        user.password_hash = None
        user.invite_token = None
        user.invite_sent_at = None
        user.invite_accepted_at = None
        user.password_reset_token = None
        user.password_reset_sent_at = None
        user.last_login_at = None
        user.bpi_ops_user_id = None

        # Stop notifications and remove future chat membership/access.
        try:
            PushToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        except Exception:
            db.session.rollback()

        try:
            ThreadFavorite.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        except Exception:
            db.session.rollback()

        try:
            UserStoreAssignment.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        except Exception:
            db.session.rollback()

        try:
            ThreadMember.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        except Exception:
            db.session.rollback()

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Your BPI Connect account has been deleted.",
        })


    @app.post("/api/users/<int:user_id>/store-assignments")
    def add_store_assignment(user_id):
        data = request.get_json() or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

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

        sync_user_to_store_chat(user, store)
        sync_user_to_default_chats(user)

        db.session.commit()

        return jsonify({
            "success": True,
            "user": serialize_user_detail(user),
        })


    @app.delete("/api/users/<int:user_id>/store-assignments/<int:assignment_id>")
    def remove_store_assignment(user_id, assignment_id):
        data = request.get_json(silent=True) or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

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

        sync_user_to_default_chats(user)

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


    @app.post("/api/threads")
    def create_thread():
        data = request.get_json() or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        name = (data.get("name") or "").strip()
        thread_type = (data.get("thread_type") or "group").strip()
        created_by_user_id = data.get("created_by_user_id")
        member_ids = data.get("member_ids") or []

        if not isinstance(member_ids, list):
            member_ids = []

        if not name:
            return jsonify({
                "success": False,
                "error": "Thread name is required.",
            }), 400

        base_key = (
            data.get("group_key")
            or f"{thread_type}:{name.lower().replace(' ', '-')}"
        )
        group_key = "".join(
            char if char.isalnum() or char in [":", "-", "_"] else "-"
            for char in base_key.lower()
        )

        existing = Thread.query.filter_by(group_key=group_key).first()
        if existing:
            return jsonify({
                "success": False,
                "error": "A group with that key already exists.",
            }), 409

        thread = Thread(
            name=name,
            thread_type=thread_type,
            group_key=group_key,
            created_by_user_id=created_by_user_id,
        )

        db.session.add(thread)
        db.session.flush()

        added_member_ids = set()

        if created_by_user_id:
            creator = User.query.get(created_by_user_id)
            if creator:
                db.session.add(ThreadMember(
                    thread_id=thread.id,
                    user_id=creator.id,
                    member_role="owner",
                ))
                added_member_ids.add(int(creator.id))

        for raw_member_id in member_ids:
            try:
                member_id = int(raw_member_id)
            except (TypeError, ValueError):
                continue

            if member_id in added_member_ids:
                continue

            member = User.query.filter_by(id=member_id, is_active=True).first()
            if not member:
                continue

            db.session.add(ThreadMember(
                thread_id=thread.id,
                user_id=member.id,
                member_role="member",
            ))
            added_member_ids.add(int(member.id))

        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, created_by_user_id),
        }), 201


    @app.patch("/api/threads/<int:thread_id>")
    def update_thread(thread_id):
        data = request.get_json() or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        thread = Thread.query.get(thread_id)

        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        data = request.get_json() or {}

        if "name" in data:
            name = (data.get("name") or "").strip()

            if not name:
                return jsonify({
                    "success": False,
                    "error": "Thread name cannot be blank.",
                }), 400

            thread.name = name

        if "thread_type" in data:
            thread.thread_type = (data.get("thread_type") or thread.thread_type).strip()

        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread),
        })


        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        data = request.get_json() or {}

        if "name" in data:
            name = (data.get("name") or "").strip()

            if not name:
                return jsonify({
                    "success": False,
                    "error": "Thread name cannot be blank.",
                }), 400

            existing = Thread.query.filter(
                db.func.lower(Thread.name) == name.lower(),
                Thread.id != thread.id,
            ).first()

            if existing:
                return jsonify({
                    "success": False,
                    "error": "Another group already has that name.",
                }), 409

            thread.name = name

        if "thread_type" in data:
            thread.thread_type = (data.get("thread_type") or thread.thread_type).strip()

        if "store_number" in data:
            store_number = (data.get("store_number") or "").strip()
            thread.store_number = store_number or None

        if "area" in data:
            area = (data.get("area") or "").strip()
            thread.area = area or None

        if "is_active" in data:
            thread.is_active = bool(data.get("is_active"))

        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread),
        })


    @app.get("/api/threads")
    def list_threads():
        user_id = request.args.get("user_id", type=int)

        user = User.query.get(user_id) if user_id else None
        role = (user.role or "").strip().lower() if user else ""

        query = Thread.query

        if user_id:
            if role in ["admin", "hr"]:
                # Admin/HR should see all group threads without needing explicit membership.
                # Direct messages should still only show when the user is a member.
                direct_thread_ids = [
                    membership.thread_id
                    for membership in ThreadMember.query.filter_by(user_id=user_id).all()
                ]

                query = query.filter(
                    db.or_(
                        Thread.thread_type != "direct",
                        Thread.id.in_(direct_thread_ids),
                    )
                )
            else:
                query = (
                    query
                    .join(ThreadMember)
                    .filter(ThreadMember.user_id == user_id)
                )

        latest_message_subquery = (
            db.session.query(
                ThreadMessage.thread_id.label("thread_id"),
                db.func.max(ThreadMessage.created_at).label("last_activity_at"),
            )
            .group_by(ThreadMessage.thread_id)
            .subquery()
        )

        threads = (
            query
            .outerjoin(latest_message_subquery, Thread.id == latest_message_subquery.c.thread_id)
            .order_by(
                db.case(
                    (latest_message_subquery.c.last_activity_at.is_(None), 1),
                    else_=0,
                ),
                latest_message_subquery.c.last_activity_at.desc(),
                Thread.created_at.desc(),
            )
            .all()
        )

        if user_id and role in ["admin", "hr"]:
            membership_added = False

            for thread in threads:
                if thread.thread_type == "direct":
                    continue

                membership = ThreadMember.query.filter_by(
                    thread_id=thread.id,
                    user_id=user_id,
                ).first()

                if not membership:
                    db.session.add(ThreadMember(
                        thread_id=thread.id,
                        user_id=user_id,
                        member_role="admin",
                    ))
                    membership_added = True

            if membership_added:
                db.session.commit()

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

        if not can_user_message_user(sender, recipient):
            return jsonify({
                "success": False,
                "error": "You do not have permission to message this user.",
            }), 403

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

    @app.post("/api/thread-messages/<int:message_id>/ack")
    def acknowledge_thread_message_short(message_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")

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

        if not can_user_access_thread(user, message.thread):
            return jsonify({
                "success": False,
                "error": "You do not have access to this message.",
            }), 403

        if not message.requires_ack:
            return jsonify({
                "success": False,
                "error": "This message does not require acknowledgment.",
            }), 400

        existing = ThreadMessageAck.query.filter_by(
            thread_message_id=message.id,
            user_id=user.id,
        ).first()

        if not existing:
            db.session.add(ThreadMessageAck(
                thread_message_id=message.id,
                user_id=user.id,
            ))
            db.session.commit()

        return jsonify({
            "success": True,
            "message": serialize_thread_message(message, user.id),
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

        if not can_user_access_thread(user, message.thread):
            return jsonify({
                "success": False,
                "error": "You do not have access to this message.",
            }), 403

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


    @app.post("/api/threads/<int:thread_id>/members")
    def add_thread_member(thread_id):
        data = request.get_json() or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        thread = Thread.query.get(thread_id)

        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        data = request.get_json() or {}
        user_id = data.get("user_id")
        member_role = (data.get("member_role") or "member").strip()

        if not user_id:
            return jsonify({
                "success": False,
                "error": "user_id is required.",
            }), 400

        user = User.query.get(user_id)

        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        existing = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=user.id,
        ).first()

        if existing:
            existing.member_role = member_role
        else:
            db.session.add(ThreadMember(
                thread_id=thread.id,
                user_id=user.id,
                member_role=member_role,
            ))

        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, user.id),
        })


    @app.delete("/api/threads/<int:thread_id>/members/<int:user_id>")
    def remove_thread_member(thread_id, user_id):
        data = request.get_json(silent=True) or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        thread = Thread.query.get(thread_id)

        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        membership = ThreadMember.query.filter_by(
            thread_id=thread_id,
            user_id=user_id,
        ).first()

        if not membership:
            return jsonify({
                "success": False,
                "error": "Membership not found.",
            }), 404

        db.session.delete(membership)
        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread),
        })


    @app.get("/api/threads/<int:thread_id>/messages")
    def list_thread_messages(thread_id):
        user_id = request.args.get("user_id", type=int)

        thread = Thread.query.get(thread_id)
        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        user, access_error = require_thread_access(user_id, thread)
        if access_error:
            return access_error

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

    @app.post("/api/threads/<int:thread_id>/image-messages")
    @app.post("/api/threads/<int:thread_id>/messages/image")
    def create_thread_image_message(thread_id):
        thread = Thread.query.get(thread_id)

        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        data = request.get_json() or {}
        sender_user_id = data.get("sender_user_id")
        body = (data.get("body") or data.get("caption") or "").strip()
        image_data = data.get("image_data")
        mime_type = (data.get("mime_type") or "image/jpeg").strip()
        original_filename = (
            data.get("original_filename")
            or data.get("file_name")
            or "chat-image.jpg"
        ).strip()
        requires_ack = bool(data.get("requires_ack", False))

        if not sender_user_id:
            return jsonify({"success": False, "error": "sender_user_id is required."}), 400

        if not image_data:
            return jsonify({"success": False, "error": "image_data is required."}), 400

        sender = User.query.get(sender_user_id)

        if not sender:
            return jsonify({"success": False, "error": "Sender not found."}), 404

        if not can_user_access_thread(sender, thread):
            return jsonify({
                "success": False,
                "error": "Sender is not a member of this thread.",
            }), 403

        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
        api_key = os.getenv("CLOUDINARY_API_KEY", "").strip()
        api_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()

        if not cloud_name or not api_key or not api_secret:
            return jsonify({
                "success": False,
                "error": "Cloudinary is not configured.",
            }), 500

        timestamp = int(time.time())
        folder = "bpi-connect/chat-images"
        public_id = f"thread-{thread.id}-user-{sender.id}-{timestamp}"

        signature_payload = f"folder={folder}&overwrite=true&public_id={public_id}&timestamp={timestamp}{api_secret}"
        signature = hashlib.sha1(signature_payload.encode("utf-8")).hexdigest()

        upload_response = requests.post(
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
            timeout=45,
        )

        if upload_response.status_code >= 400:
            return jsonify({
                "success": False,
                "error": upload_response.text,
            }), 500

        uploaded = upload_response.json()
        image_url = uploaded.get("secure_url")

        if not image_url:
            return jsonify({
                "success": False,
                "error": "Upload succeeded but no secure_url was returned.",
            }), 500

        message = ThreadMessage(
            thread_id=thread.id,
            sender_user_id=sender.id,
            body=body or "Photo",
            requires_ack=requires_ack,
        )

        db.session.add(message)
        db.session.flush()

        attachment = ThreadMessageAttachment(
            thread_message_id=message.id,
            file_type="image",
            url=image_url,
            thumbnail_url=image_url,
            original_filename=original_filename,
            mime_type=mime_type,
            size_bytes=uploaded.get("bytes"),
        )

        db.session.add(attachment)
        db.session.commit()

        emit_thread_message_created(thread, message)

        push_result = notify_thread_members(thread, sender, message)

        return jsonify({
            "success": True,
            "message": serialize_thread_message(message, sender.id),
            "push_result": push_result,
        }), 201


    def send_expo_push_notifications(tokens, title, body, data=None):
        if not tokens:
            return {"sent": 0, "skipped": True}

        messages = []

        for token in tokens:
            if not token or not (
                token.startswith("ExpoPushToken") or token.startswith("ExponentPushToken")
            ):
                continue

            messages.append({
                "to": token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
            })

        if not messages:
            return {"sent": 0, "skipped": True}

        try:
            response = requests.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=20,
            )

            return {
                "sent": len(messages),
                "status_code": response.status_code,
                "response": response.text,
            }
        except Exception as error:
            return {
                "sent": 0,
                "error": str(error),
            }


    def emit_thread_message_created(thread, message):
        memberships = ThreadMember.query.filter_by(thread_id=thread.id).all()

        for membership in memberships:
            payload = {
                "thread_id": thread.id,
                "thread": serialize_thread(thread, user_id=membership.user_id),
                "message": serialize_thread_message(message, user_id=membership.user_id),
            }

            socketio.emit(
                "thread_message_created",
                payload,
                room=f"user:{membership.user_id}",
            )


    def notify_thread_members(thread, sender, message):
        member_user_ids = [
            membership.user_id
            for membership in ThreadMember.query.filter_by(thread_id=thread.id).all()
            if membership.user_id != sender.id and not membership.muted
        ]

        if not member_user_ids:
            return {"sent": 0, "skipped": True}

        tokens = [
            item.token
            for item in PushToken.query.filter(
                PushToken.user_id.in_(member_user_ids),
                PushToken.is_active == True,
            ).all()
        ]

        preview = message.body or "New message"
        if preview == "Photo":
            preview = "Sent a photo"

        return send_expo_push_notifications(
            tokens=tokens,
            title=f"{sender.name} in {thread.name}",
            body=preview[:160],
            data={
                "type": "thread_message",
                "thread_id": thread.id,
                "message_id": message.id,
            },
        )


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

        sender_role = (sender.role or "").strip().lower()
        sender_can_access_group_thread = (
            sender_role in ["admin", "hr"]
            and thread.thread_type != "direct"
        )

        if not membership and not sender_can_access_group_thread:
            return jsonify({"success": False, "error": "Sender is not a member of this thread."}), 403

        if thread.thread_type == "company" and sender_role not in ["admin", "hr"]:
            return jsonify({
                "success": False,
                "error": "Only Admin or HR can send company-wide messages.",
            }), 403

        if requires_ack and sender_role not in ["admin", "hr", "coach", "supervisor"]:
            return jsonify({
                "success": False,
                "error": "Only Admin, HR, Coach, or Supervisor accounts can require acknowledgements.",
            }), 403

        message = ThreadMessage(
            thread_id=thread.id,
            sender_user_id=sender.id,
            body=body,
            requires_ack=requires_ack,
        )
        db.session.add(message)
        db.session.commit()

        emit_thread_message_created(thread, message)

        push_result = notify_thread_members(thread, sender, message)

        return jsonify({
            "success": True,
            "message": serialize_thread_message(message, user_id=sender.id),
            "push_result": push_result,
        }), 201

    @app.post("/api/threads/<int:thread_id>/favorite")
    def toggle_thread_favorite(thread_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")
        favorite = bool(data.get("favorite"))

        if not user_id:
            return jsonify({
                "success": False,
                "error": "user_id is required.",
            }), 400

        thread = Thread.query.get(thread_id)

        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        membership = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=user_id,
        ).first()

        if not membership:
            return jsonify({"success": False, "error": "Thread membership not found."}), 404

        if not ensure_thread_favorites_table():
            return jsonify({
                "success": False,
                "error": "Could not prepare favorites table.",
            }), 500

        existing = ThreadFavorite.query.filter_by(
            thread_id=thread.id,
            user_id=user_id,
        ).first()

        if favorite and not existing:
            db.session.add(ThreadFavorite(thread_id=thread.id, user_id=user_id))

        if not favorite and existing:
            db.session.delete(existing)

        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, user_id=user_id),
        })


    @app.post("/api/threads/<int:thread_id>/mute")
    def toggle_thread_mute(thread_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")
        muted = bool(data.get("muted", True))

        if not user_id:
            return jsonify({
                "success": False,
                "error": "user_id is required.",
            }), 400

        thread = Thread.query.get(thread_id)

        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        membership = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=user_id,
        ).first()

        if not membership:
            return jsonify({"success": False, "error": "Thread membership not found."}), 404

        membership.muted = muted
        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, user_id=user_id),
            "muted": membership.muted,
        })


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

        thread = Thread.query.get(thread_id)

        socketio.emit(
            "thread_read_updated",
            {
                "thread_id": int(thread_id),
                "user_id": int(user_id),
                "last_read_at": membership.last_read_at.isoformat(),
            },
            room=f"thread:{thread_id}",
        )

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, user_id=user_id) if thread else None,
        })

    @app.post("/api/thread-messages/<int:thread_message_id>/acknowledge")
    def acknowledge_thread_message(thread_message_id):
        data = request.get_json() or {}
        user_id = data.get("user_id")

        message = ThreadMessage.query.get(thread_message_id)
        if not message:
            return jsonify({"success": False, "error": "Thread message not found."}), 404

        user = User.query.get(user_id)
        if not user:
            return jsonify({"success": False, "error": "User not found."}), 404

        if not can_user_access_thread(user, message.thread):
            return jsonify({
                "success": False,
                "error": "You do not have access to this message.",
            }), 403

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



def get_outbound_email_sender():
    return (
        os.getenv("PASSWORD_RESET_FROM_EMAIL", "").strip()
        or os.getenv("INVITE_EMAIL_FROM", "").strip()
        or os.getenv("INVITE_FROM_EMAIL", "").strip()
        or os.getenv("RESEND_FROM_EMAIL", "").strip()
        or os.getenv("FROM_EMAIL", "").strip()
        or "BPI Connect <onboarding@resend.dev>"
    )


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



def send_password_reset_email(user, reset_url):
    resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
    from_email = get_outbound_email_sender()

    if not resend_api_key:
        return {
            "sent": False,
            "error": "RESEND_API_KEY is not configured.",
        }

    payload = {
        "from": from_email,
        "to": [user.email],
        "subject": "Reset your BPI Connect password",
        "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
                <h2 style="color:#10212b;">Reset your BPI Connect password</h2>
                <p>Hi {user.name},</p>
                <p>A password reset was requested for your BPI Connect account.</p>
                <p>
                    <a href="{reset_url}"
                       style="display:inline-block;background:#e91f3f;color:#ffffff;text-decoration:none;
                              padding:12px 18px;border-radius:12px;font-weight:bold;">
                        Reset Password
                    </a>
                </p>
                <p>If the button does not work, copy and paste this link into your browser:</p>
                <p style="word-break:break-all;color:#526273;">{reset_url}</p>
                <p style="color:#526273;font-size:13px;">
                    If you did not request this, you can ignore this email.
                </p>
            </div>
        """,
    }

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )

        if response.status_code >= 400:
            return {
                "sent": False,
                "error": response.text,
            }

        return {
            "sent": True,
            "provider_response": response.json(),
        }
    except Exception as error:
        return {
            "sent": False,
            "error": str(error),
        }


def serialize_user(user):
    assigned_stores = []

    if user.store:
        assigned_stores.append(user.store)

    for assignment in getattr(user, "store_assignments", []) or []:
        if assignment.store:
            assigned_stores.append(assignment.store)

    seen_store_ids = set()
    store_numbers = []
    store_labels = []

    for store in assigned_stores:
        if store.id in seen_store_ids:
            continue

        seen_store_ids.add(store.id)
        store_numbers.append(store.store_number)
        store_labels.append(f"Store {store.store_number}")

    return {
        "id": user.id,
        "name": user.name,
        "username": getattr(user, "username", None),
        "email": user.email,
        "phone_number": user.phone_number,
        "bpi_ops_user_id": getattr(user, "bpi_ops_user_id", None),
        "avatar_url": user.avatar_url,
        "role": user.role,
        "store": user.store.store_number if user.store else None,
        "store_name": user.store.name if user.store else None,
        "store_numbers": store_numbers,
        "store_labels": store_labels,
        "stores_display": ", ".join(store_labels),
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

def ensure_thread_favorites_table():
    try:
        ThreadFavorite.__table__.create(db.engine, checkfirst=True)
        return True
    except Exception:
        db.session.rollback()
        return False


def serialize_thread(thread, user_id=None):
    last_message = (
        ThreadMessage.query
        .filter_by(thread_id=thread.id)
        .order_by(ThreadMessage.created_at.desc())
        .first()
    )

    membership = None
    unread_count = 0
    favorite = False

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

        if ensure_thread_favorites_table():
            try:
                favorite = ThreadFavorite.query.filter_by(
                    thread_id=thread.id,
                    user_id=user_id,
                ).first() is not None
            except Exception:
                db.session.rollback()
                favorite = False

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
        "favorite": favorite,
    }


def serialize_thread_message_attachment(attachment):
    return {
        "id": attachment.id,
        "file_type": attachment.file_type,
        "url": attachment.url,
        "thumbnail_url": attachment.thumbnail_url,
        "original_filename": attachment.original_filename,
        "mime_type": attachment.mime_type,
        "size_bytes": attachment.size_bytes,
        "created_at": attachment.created_at.isoformat() if attachment.created_at else None,
    }


def serialize_thread_message(message, user_id=None):
    acknowledged = False
    seen_by_count = 0
    delivered_to_count = 0

    if user_id:
        acknowledged = ThreadMessageAck.query.filter_by(
            thread_message_id=message.id,
            user_id=user_id,
        ).first() is not None

    try:
        delivered_to_count = ThreadMember.query.filter(
            ThreadMember.thread_id == message.thread_id,
            ThreadMember.user_id != message.sender_user_id,
        ).count()

        seen_by_count = ThreadMember.query.filter(
            ThreadMember.thread_id == message.thread_id,
            ThreadMember.user_id != message.sender_user_id,
            ThreadMember.last_read_at.isnot(None),
            ThreadMember.last_read_at >= message.created_at,
        ).count()
    except Exception:
        db.session.rollback()
        seen_by_count = 0
        delivered_to_count = 0

    return {
        "id": message.id,
        "thread_id": message.thread_id,
        "sender": serialize_user(message.sender),
        "body": message.body,
        "requires_ack": message.requires_ack,
        "acknowledged": acknowledged,
        "created_at": message.created_at.isoformat(),
        "is_me": message.sender_user_id == user_id if user_id else False,
        "seen_by_count": seen_by_count,
        "seen_count": seen_by_count,
        "delivered_to_count": delivered_to_count,
        "reactions": serialize_message_reactions(message, user_id),
        "attachments": [serialize_thread_message_attachment(item) for item in message.attachments],
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

