import os
import re
import secrets
import base64
import hashlib
import time
import requests
from datetime import datetime, timedelta
from secrets import token_urlsafe

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from flask_socketio import SocketIO, join_room
from sqlalchemy import inspect
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from app.extensions import db
from app.admin_web import admin_web_bp
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
    ping_interval=20,
    logger=False,
    engineio_logger=False,
)



def ensure_thread_pinned_message_id_column():
    inspector = inspect(db.engine)
    columns = {column["name"] for column in inspector.get_columns("threads")}

    if "pinned_message_id" not in columns:
        with db.engine.begin() as connection:
            connection.execute(db.text(
                "ALTER TABLE threads ADD COLUMN pinned_message_id INTEGER"
            ))


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


def user_is_company_messaging_role(user):
    return (user.role or "").strip().lower() in {"admin", "hr", "coach"} if user else False


def can_user_message_user(sender, recipient):
    if not sender or not recipient:
        return False

    if not sender.is_active or not recipient.is_active:
        return False

    if int(sender.id) == int(recipient.id):
        return False

    sender_role = (sender.role or "").strip().lower()

    if sender_role in {"admin", "hr", "coach"}:
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
    if user_is_company_messaging_role(user) and thread.thread_type != "direct":
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

    if database_url:
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "pool_pre_ping": True,
            "pool_recycle": 280,
            "pool_size": 10,
            "max_overflow": 20,
            "pool_timeout": 30,
        }
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    CORS(app)
    db.init_app(app)
    socketio.init_app(app, cors_allowed_origins="*")
    app.register_blueprint(admin_web_bp)

    def ensure_user_phone_number_column():
        inspector = db.inspect(db.engine)

        if "users" not in inspector.get_table_names():
            return

        existing_columns = {column["name"] for column in inspector.get_columns("users")}
        engine_name = db.engine.url.get_backend_name()

        needed_columns = {
            "username": "VARCHAR(120)",
            "phone_number": "VARCHAR(40)",
            "bpi_ops_user_id": "INTEGER",
            "avatar_url": "TEXT",
            "invite_token": "VARCHAR(255)",
            "invite_sent_at": "DATETIME",
            "invite_accepted_at": "DATETIME",
            "password_reset_token": "VARCHAR(255)",
            "password_reset_sent_at": "DATETIME",
            "last_login_at": "DATETIME",
        }

        with db.engine.begin() as connection:
            for column_name, column_type in needed_columns.items():
                if column_name in existing_columns:
                    continue

                if engine_name == "postgresql":
                    connection.execute(db.text(
                        f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {column_name} {column_type}"
                    ))
                else:
                    connection.execute(db.text(
                        f"ALTER TABLE users ADD COLUMN {column_name} {column_type}"
                    ))

    with app.app_context():
        ensure_user_phone_number_column()
        ensure_thread_pinned_message_id_column()
        ensure_thread_hidden_at_column()


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
        Thread.query.filter_by(
            id=thread.id
        ).delete(synchronize_session=False)

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
        app.logger.warning(
            "REALTIME connected sid=%s transport=%s user_agent=%s",
            request.sid,
            request.args.get("transport"),
            request.headers.get("User-Agent", "-")[:160],
        )
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

        app.logger.warning(
            "REALTIME joined sid=%s user_id=%s threads=%s",
            request.sid,
            user.id,
            len(memberships),
        )

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



    def api_token_serializer():
        secret = (
            os.getenv("CONNECT_API_TOKEN_SECRET", "").strip()
            or os.getenv("SECRET_KEY", "").strip()
            or str(app.config.get("SECRET_KEY") or "").strip()
        )

        if not secret:
            return None

        return URLSafeTimedSerializer(
            secret,
            salt="bpi-connect-mobile-api-v1",
        )


    def create_mobile_api_token(user):
        serializer = api_token_serializer()

        if not serializer:
            return None

        return serializer.dumps({
            "user_id": user.id,
            "purpose": "mobile_api",
        })


    def require_mobile_api_user():
        authorization = (
            request.headers.get("Authorization")
            or ""
        ).strip()

        if not authorization.lower().startswith("bearer "):
            return None, (
                jsonify({
                    "success": False,
                    "error": "Authentication token is required.",
                }),
                401,
            )

        token = authorization.split(" ", 1)[1].strip()
        serializer = api_token_serializer()

        if not serializer:
            return None, (
                jsonify({
                    "success": False,
                    "error": "Mobile API authentication is not configured.",
                }),
                503,
            )

        try:
            payload = serializer.loads(
                token,
                max_age=int(
                    os.getenv(
                        "CONNECT_API_TOKEN_MAX_AGE_SECONDS",
                        str(60 * 60 * 24 * 30),
                    )
                ),
            )
        except SignatureExpired:
            return None, (
                jsonify({
                    "success": False,
                    "error": "Your session has expired. Please sign in again.",
                }),
                401,
            )
        except BadSignature:
            return None, (
                jsonify({
                    "success": False,
                    "error": "Invalid authentication token.",
                }),
                401,
            )

        if payload.get("purpose") != "mobile_api":
            return None, (
                jsonify({
                    "success": False,
                    "error": "Invalid authentication token.",
                }),
                401,
            )

        user = User.query.get(payload.get("user_id"))

        if not user or not user.is_active:
            return None, (
                jsonify({
                    "success": False,
                    "error": "User account not found or inactive.",
                }),
                401,
            )

        return user, None


    def bpi_ops_connect_headers():
        secret = os.getenv(
            "BPI_OPS_INTEGRATION_SECRET",
            "",
        ).strip()

        return {
            "X-BPI-Connect-Secret": secret,
            "X-Integration-Secret": secret,
        }


    def bpi_ops_hr_api_base():
        base = (
            os.getenv("BPI_OPS_API_BASE", "").strip()
            or "https://ops.bostonpie.net"
        )

        return base.rstrip("/")


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

        api_token = create_mobile_api_token(user)

        if not api_token:
            return jsonify({
                "success": False,
                "error": "Mobile API authentication is not configured.",
            }), 503

        return jsonify({
            "success": True,
            "user": serialize_user(user),
            "api_token": api_token,
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






    @app.get("/api/integrations/bpi-ops/admin/threads")
    def bpi_ops_admin_threads():
        auth_error = require_bpi_ops_integration_secret()
        if auth_error:
            return auth_error

        member_counts = (
            db.session.query(
                ThreadMember.thread_id.label("thread_id"),
                db.func.count(ThreadMember.id).label("member_count"),
            )
            .group_by(ThreadMember.thread_id)
            .subquery()
        )

        message_counts = (
            db.session.query(
                ThreadMessage.thread_id.label("thread_id"),
                db.func.count(ThreadMessage.id).label("message_count"),
                db.func.max(ThreadMessage.created_at).label("last_message_at"),
            )
            .group_by(ThreadMessage.thread_id)
            .subquery()
        )

        rows = (
            db.session.query(
                Thread,
                db.func.coalesce(member_counts.c.member_count, 0).label("member_count"),
                db.func.coalesce(message_counts.c.message_count, 0).label("message_count"),
                message_counts.c.last_message_at.label("last_message_at"),
            )
            .outerjoin(member_counts, Thread.id == member_counts.c.thread_id)
            .outerjoin(message_counts, Thread.id == message_counts.c.thread_id)
            .order_by(
                message_counts.c.last_message_at.desc().nullslast(),
                Thread.created_at.desc().nullslast(),
            )
            .all()
        )

        def infer_scope(thread):
            group_key = thread.group_key or ""
            parts = group_key.split(":", 1)

            scope_type = parts[0] if parts else thread.thread_type
            scope_value = parts[1] if len(parts) > 1 else None

            return {
                "scope_type": scope_type,
                "scope_value": scope_value,
            }

        threads = []
        by_type = {}
        total_memberships = 0
        total_messages = 0

        for thread, member_count, message_count, last_message_at in rows:
            thread_type = thread.thread_type or "unknown"
            by_type[thread_type] = by_type.get(thread_type, 0) + 1

            member_count = int(member_count or 0)
            message_count = int(message_count or 0)
            total_memberships += member_count
            total_messages += message_count

            scope = infer_scope(thread)

            threads.append({
                "id": thread.id,
                "name": thread.name,
                "type": thread_type,
                "group_key": thread.group_key,
                "scope_type": scope["scope_type"],
                "scope_value": scope["scope_value"],
                "member_count": member_count,
                "message_count": message_count,
                "last_message_at": last_message_at.isoformat() if last_message_at else None,
                "created_at": iso_utc(thread.created_at) if thread.created_at else None,
            })

        return jsonify({
            "success": True,
            "source": "bpi_connect",
            "counts": {
                "total": len(threads),
                "by_type": by_type,
                "memberships": total_memberships,
                "messages": total_messages,
            },
            "threads": threads,
        })


    @app.get("/api/integrations/bpi-ops/admin/summary")
    def bpi_ops_admin_summary():
        auth_error = require_bpi_ops_integration_secret()
        if auth_error:
            return auth_error

        users_total = User.query.count()
        users_active = User.query.filter_by(is_active=True).count()
        users_inactive = User.query.filter_by(is_active=False).count()

        stores_total = Store.query.count()
        stores_active = Store.query.filter_by(is_active=True).count()
        stores_inactive = Store.query.filter_by(is_active=False).count()

        areas_total = Area.query.count()
        threads_total = Thread.query.count()
        thread_messages_total = ThreadMessage.query.count()
        legacy_messages_total = Message.query.count()
        thread_members_total = ThreadMember.query.count()

        active_push_tokens = PushToken.query.filter_by(is_active=True).count()

        users_with_login = User.query.filter(User.last_login_at.isnot(None)).count()
        users_without_login = User.query.filter(User.last_login_at.is_(None)).count()
        pending_invites = User.query.filter(
            User.invite_sent_at.isnot(None),
            User.invite_accepted_at.is_(None),
            User.is_active.is_(True),
        ).count()

        users_by_role_rows = (
            db.session.query(User.role, db.func.count(User.id))
            .group_by(User.role)
            .order_by(User.role)
            .all()
        )

        threads_by_type_rows = (
            db.session.query(Thread.thread_type, db.func.count(Thread.id))
            .group_by(Thread.thread_type)
            .order_by(Thread.thread_type)
            .all()
        )

        stores_by_area_rows = (
            db.session.query(
                Area.name,
                db.func.count(Store.id),
            )
            .outerjoin(Store, Store.area_id == Area.id)
            .group_by(Area.name)
            .order_by(Area.name)
            .all()
        )

        return jsonify({
            "success": True,
            "source": "bpi_connect",
            "users": {
                "total": users_total,
                "active": users_active,
                "inactive": users_inactive,
                "with_login": users_with_login,
                "without_login": users_without_login,
                "pending_invites": pending_invites,
                "by_role": {
                    (role or "unknown"): count
                    for role, count in users_by_role_rows
                },
            },
            "stores": {
                "total": stores_total,
                "active": stores_active,
                "inactive": stores_inactive,
                "by_area": {
                    (area_name or "Unassigned"): count
                    for area_name, count in stores_by_area_rows
                },
            },
            "areas": {
                "total": areas_total,
            },
            "threads": {
                "total": threads_total,
                "by_type": {
                    (thread_type or "unknown"): count
                    for thread_type, count in threads_by_type_rows
                },
                "memberships": thread_members_total,
            },
            "messages": {
                "thread_messages": thread_messages_total,
                "legacy_messages": legacy_messages_total,
                "total": thread_messages_total + legacy_messages_total,
            },
            "push": {
                "active_tokens": active_push_tokens,
            },
        })


    @app.get("/api/integrations/bpi-ops/admin/users")
    def bpi_ops_admin_users():
        auth_error = require_bpi_ops_integration_secret()
        if auth_error:
            return auth_error

        users = (
            User.query
            .outerjoin(Store, User.store_id == Store.id)
            .outerjoin(Area, User.area_id == Area.id)
            .order_by(User.is_active.desc(), Store.store_number.asc(), User.role.asc(), User.name.asc())
            .all()
        )

        serialized_users = []

        for user in users:
            store = getattr(user, "store", None)
            area = getattr(user, "area", None)

            push_tokens = getattr(user, "push_tokens", []) or []
            active_push_tokens = [
                token for token in push_tokens
                if getattr(token, "is_active", True)
            ]

            has_logged_in = bool(getattr(user, "last_login_at", None))
            invite_sent = bool(getattr(user, "invite_sent_at", None))
            invite_accepted = bool(getattr(user, "invite_accepted_at", None))
            pending_invite = bool(invite_sent and not invite_accepted and user.is_active)

            serialized_users.append({
                "id": user.id,
                "bpi_ops_user_id": user.bpi_ops_user_id,
                "name": user.name,
                "username": user.username,
                "email": user.email,
                "phone_number": user.phone_number,
                "role": user.role,
                "store_number": getattr(store, "store_number", None),
                "store_name": getattr(store, "name", None),
                "area": getattr(area, "name", None),
                "is_active": bool(user.is_active),
                "has_logged_in": has_logged_in,
                "pending_invite": pending_invite,
                "invite_sent_at": user.invite_sent_at.isoformat() if user.invite_sent_at else None,
                "invite_accepted_at": user.invite_accepted_at.isoformat() if user.invite_accepted_at else None,
                "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "active_push_tokens": len(active_push_tokens),
            })

        return jsonify({
            "success": True,
            "source": "bpi_connect",
            "users": serialized_users,
            "counts": {
                "total": len(serialized_users),
                "active": sum(1 for user in serialized_users if user["is_active"]),
                "inactive": sum(1 for user in serialized_users if not user["is_active"]),
                "with_login": sum(1 for user in serialized_users if user["has_logged_in"]),
                "without_login": sum(1 for user in serialized_users if not user["has_logged_in"]),
                "pending_invites": sum(1 for user in serialized_users if user["pending_invite"]),
            },
        })



    @app.post("/api/integrations/bpi-ops/admin/announcements/send")
    def bpi_ops_admin_send_announcement():
        auth_error = require_bpi_ops_integration_secret()
        if auth_error:
            return auth_error

        data = request.get_json(silent=True) or {}

        target_type = (data.get("target_type") or "company").strip().lower()
        target_value = (data.get("target_value") or "").strip()
        title = (data.get("title") or "").strip()
        message = (data.get("message") or "").strip()

        if target_type not in {"company", "area", "store", "role"}:
            return jsonify({
                "success": False,
                "error": "Invalid target_type.",
            }), 400

        if target_type != "company" and not target_value:
            return jsonify({
                "success": False,
                "error": "target_value is required for this target_type.",
            }), 400

        if target_type == "company" and data.get("confirm_company_wide") is not True:
            return jsonify({
                "success": False,
                "error": "Company-wide announcements require confirm_company_wide=true.",
            }), 400

        if not title or not message:
            return jsonify({
                "success": False,
                "error": "Title and message are required.",
            }), 400

        title = title[:120]
        message = message[:600]

        users = User.query.all()

        def is_active_user(user):
            return bool(getattr(user, "is_active", True))

        def user_matches(user):
            if not is_active_user(user):
                return False

            if target_type == "company":
                return True

            if target_type == "store":
                return str(getattr(user, "store_number", "") or "").strip() == target_value

            if target_type == "area":
                return str(getattr(user, "area", "") or "").strip().lower() == target_value.lower()

            if target_type == "role":
                return str(getattr(user, "role", "") or "").strip().lower() == target_value.lower()

            return False

        recipients = [user for user in users if user_matches(user)]
        recipient_ids = [user.id for user in recipients]

        tokens = []
        if recipient_ids:
            tokens = [
                item.token
                for item in PushToken.query.filter(
                    PushToken.user_id.in_(recipient_ids),
                    PushToken.is_active == True,
                ).all()
                if item.token
            ]

        push_result = None
        if tokens:
            push_result = send_expo_push_notifications(
                tokens=tokens,
                title=title,
                body=message,
                data={
                    "type": "announcement",
                    "target_type": target_type,
                    "target_value": target_value,
                    "source": "bpi_ops",
                },
            )

        return jsonify({
            "success": True,
            "sent": bool(tokens),
            "target_type": target_type,
            "target_value": target_value,
            "recipient_count": len(recipients),
            "token_count": len(tokens),
            "push_result": push_result,
        })


    # CONNECT_IN_APP_HR_DOCUMENT_PROXY_20260718

    @app.get("/api/hr-documents")
    def mobile_hr_documents():
        user, auth_error = require_mobile_api_user()
        if auth_error:
            return auth_error

        if not user.bpi_ops_user_id:
            return jsonify({
                "success": False,
                "error": "Your Connect account is not linked to BPI Ops.",
            }), 409

        try:
            upstream = requests.get(
                (
                    f"{bpi_ops_hr_api_base()}"
                    f"/hr-documents/api/connect/users/"
                    f"{user.bpi_ops_user_id}/documents"
                ),
                headers=bpi_ops_connect_headers(),
                timeout=20,
            )
        except requests.RequestException as exc:
            return jsonify({
                "success": False,
                "error": f"BPI Ops could not be reached: {exc}",
            }), 502

        try:
            payload = upstream.json()
        except ValueError:
            return jsonify({
                "success": False,
                "error": "BPI Ops returned an invalid response.",
            }), 502

        return jsonify(payload), upstream.status_code


    @app.get(
        "/api/hr-documents/<int:recipient_id>/file"
    )
    def mobile_hr_document_file(recipient_id):
        user, auth_error = require_mobile_api_user()
        if auth_error:
            return auth_error

        if not user.bpi_ops_user_id:
            return jsonify({
                "success": False,
                "error": "Your Connect account is not linked to BPI Ops.",
            }), 409

        try:
            upstream = requests.get(
                (
                    f"{bpi_ops_hr_api_base()}"
                    f"/hr-documents/api/connect/recipients/"
                    f"{recipient_id}/file"
                ),
                params={
                    "bpi_ops_user_id": user.bpi_ops_user_id,
                },
                headers=bpi_ops_connect_headers(),
                timeout=30,
            )
        except requests.RequestException as exc:
            return jsonify({
                "success": False,
                "error": f"BPI Ops could not be reached: {exc}",
            }), 502

        if not upstream.ok:
            try:
                payload = upstream.json()
            except ValueError:
                payload = {
                    "success": False,
                    "error": "Document could not be loaded.",
                }

            return jsonify(payload), upstream.status_code

        response = Response(
            upstream.content,
            status=upstream.status_code,
            content_type=(
                upstream.headers.get("Content-Type")
                or "application/octet-stream"
            ),
        )

        content_disposition = upstream.headers.get(
            "Content-Disposition"
        )

        if content_disposition:
            response.headers[
                "Content-Disposition"
            ] = content_disposition

        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"

        return response


    @app.post(
        "/api/hr-documents/<int:recipient_id>/acknowledge"
    )
    def mobile_acknowledge_hr_document(recipient_id):
        user, auth_error = require_mobile_api_user()
        if auth_error:
            return auth_error

        if not user.bpi_ops_user_id:
            return jsonify({
                "success": False,
                "error": "Your Connect account is not linked to BPI Ops.",
            }), 409

        data = request.get_json(silent=True) or {}

        acknowledged_name = (
            data.get("acknowledged_name")
            or ""
        ).strip()

        confirmed = data.get("confirmed") is True

        if not acknowledged_name:
            return jsonify({
                "success": False,
                "error": "Please type your name.",
            }), 400

        if not confirmed:
            return jsonify({
                "success": False,
                "error": "Please confirm the acknowledgement.",
            }), 400

        forwarded_for = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or request.remote_addr
            or ""
        )

        user_agent = (
            request.headers.get("User-Agent")
            or ""
        ).strip()

        headers = {
            **bpi_ops_connect_headers(),
            "Content-Type": "application/json",
            "X-Connect-Client-IP": forwarded_for,
            "X-Connect-User-Agent": user_agent,
        }

        try:
            upstream = requests.post(
                (
                    f"{bpi_ops_hr_api_base()}"
                    f"/hr-documents/api/connect/recipients/"
                    f"{recipient_id}/acknowledge"
                ),
                headers=headers,
                json={
                    "bpi_ops_user_id": user.bpi_ops_user_id,
                    "acknowledged_name": acknowledged_name,
                    "confirmed": True,
                },
                timeout=20,
            )
        except requests.RequestException as exc:
            return jsonify({
                "success": False,
                "error": f"BPI Ops could not be reached: {exc}",
            }), 502

        try:
            payload = upstream.json()
        except ValueError:
            return jsonify({
                "success": False,
                "error": "BPI Ops returned an invalid response.",
            }), 502

        return jsonify(payload), upstream.status_code


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

            if viewer_role not in ["admin", "hr", "coach"]:
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

        if "pinned_message_id" in data:
            pinned_message_id = data.get("pinned_message_id")

            if pinned_message_id in ("", None):
                thread.pinned_message_id = None
            else:
                pinned_message = ThreadMessage.query.filter_by(
                    id=pinned_message_id,
                    thread_id=thread.id,
                ).first()

                if not pinned_message:
                    return jsonify({
                        "success": False,
                        "error": "Pinned message was not found in this thread.",
                    }), 404

                thread.pinned_message_id = pinned_message.id

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
            if role in ["admin", "hr", "coach"]:
                # Admin/HR should see all group threads without needing explicit membership.
                # Direct messages should still only show when the user is a member.
                ensure_thread_hidden_at_column()
                direct_thread_ids = [
                    membership.thread_id
                    for membership in ThreadMember.query.filter_by(user_id=user_id, hidden_at=None).all()
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
                    .filter(ThreadMember.hidden_at.is_(None))
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

        thread_list_started_at = datetime.utcnow()
        thread_ids = [thread.id for thread in threads]

        latest_message_times = {}
        latest_messages = {}
        member_counts = {}
        memberships_by_thread = {}
        favorite_thread_ids = set()

        if thread_ids:
            latest_rows = (
                db.session.query(
                    ThreadMessage.thread_id.label("thread_id"),
                    db.func.max(ThreadMessage.created_at).label("last_time"),
                )
                .filter(ThreadMessage.thread_id.in_(thread_ids))
                .group_by(ThreadMessage.thread_id)
                .all()
            )

            latest_message_times = {
                row.thread_id: row.last_time
                for row in latest_rows
                if row.last_time
            }

            if latest_message_times:
                latest_messages = {
                    message.thread_id: message
                    for message in ThreadMessage.query.filter(
                        ThreadMessage.thread_id.in_(list(latest_message_times.keys())),
                        ThreadMessage.created_at.in_(list(latest_message_times.values())),
                    ).all()
                }

            member_counts = {
                row.thread_id: row.member_count
                for row in db.session.query(
                    ThreadMember.thread_id.label("thread_id"),
                    db.func.count(ThreadMember.id).label("member_count"),
                )
                .filter(ThreadMember.thread_id.in_(thread_ids))
                .group_by(ThreadMember.thread_id)
                .all()
            }

            if user_id:
                memberships_by_thread = {
                    membership.thread_id: membership
                    for membership in ThreadMember.query.filter(
                        ThreadMember.thread_id.in_(thread_ids),
                        ThreadMember.user_id == user_id,
                        ThreadMember.hidden_at.is_(None),
                    ).all()
                }

                if ensure_thread_favorites_table():
                    try:
                        favorite_thread_ids = {
                            favorite.thread_id
                            for favorite in ThreadFavorite.query.filter(
                                ThreadFavorite.thread_id.in_(thread_ids),
                                ThreadFavorite.user_id == user_id,
                            ).all()
                        }
                    except Exception:
                        db.session.rollback()
                        favorite_thread_ids = set()

        serialized_threads = []

        for thread in threads:
            membership = memberships_by_thread.get(thread.id)
            unread_count = 0

            if user_id and membership:
                unread_query = ThreadMessage.query.filter(
                    ThreadMessage.thread_id == thread.id,
                    ThreadMessage.sender_user_id != user_id,
                )

                if membership.last_read_at:
                    unread_query = unread_query.filter(ThreadMessage.created_at > membership.last_read_at)

                unread_count = unread_query.count()

            serialized_threads.append(serialize_thread_light(
                thread,
                user_id=user_id,
                last_message=latest_messages.get(thread.id),
                unread_count=unread_count,
                member_count=member_counts.get(thread.id, 0),
                muted=membership.muted if membership else False,
                favorite=thread.id in favorite_thread_ids,
            ))

        elapsed_ms = int((datetime.utcnow() - thread_list_started_at).total_seconds() * 1000)

        app.logger.info(
            "BPI Connect thread list user_id=%s count=%s elapsed_ms=%s",
            user_id,
            len(serialized_threads),
            elapsed_ms,
        )

        return jsonify({
            "success": True,
            "threads": serialized_threads,
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

        for member_user in [sender, recipient]:
            membership = ThreadMember.query.filter_by(
                thread_id=thread.id,
                user_id=member_user.id,
            ).first()

            if membership:
                membership.hidden_at = None
                membership.muted = False
            else:
                db.session.add(ThreadMember(
                    thread_id=thread.id,
                    user_id=member_user.id,
                ))

        db.session.commit()

        return jsonify({
            "success": True,
            "thread": serialize_thread(thread, user_id=sender.id),
        })


    @app.delete("/api/thread-messages/<int:message_id>")
    def delete_thread_message(message_id):
        data = request.get_json(silent=True) or {}
        actor_user_id = data.get("user_id") or data.get("actor_user_id")

        if not actor_user_id:
            return jsonify({
                "success": False,
                "error": "user_id is required.",
            }), 400

        actor = User.query.get(actor_user_id)
        message = ThreadMessage.query.get(message_id)

        if not actor:
            return jsonify({"success": False, "error": "User not found."}), 404

        if not message:
            return jsonify({"success": False, "error": "Message not found."}), 404

        actor_role = (actor.role or "").strip().lower()
        can_delete = (
            int(message.sender_user_id) == int(actor.id)
            or actor_role in ["admin", "hr"]
        )

        if not can_delete:
            return jsonify({
                "success": False,
                "error": "You do not have permission to delete this message.",
            }), 403

        deleted_body = "This message was deleted"

        message.body = deleted_body
        message.requires_ack = False

        try:
            ThreadMessageAttachment.query.filter_by(
                thread_message_id=message.id
            ).delete(synchronize_session=False)
        except Exception:
            db.session.rollback()

        try:
            ThreadMessageReaction.query.filter_by(
                thread_message_id=message.id
            ).delete(synchronize_session=False)
        except Exception:
            db.session.rollback()

        try:
            ThreadMessageAck.query.filter_by(
                thread_message_id=message.id
            ).delete(synchronize_session=False)
        except Exception:
            db.session.rollback()

        db.session.commit()

        thread = Thread.query.get(message.thread_id)

        if thread:
            emit_thread_message_created(thread, message)

        return jsonify({
            "success": True,
            "message": serialize_thread_message(message, user_id=actor.id),
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
        limit = request.args.get("limit", 30, type=int) or 30
        limit = max(1, min(limit, 50))

        thread = Thread.query.get(thread_id)
        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        user, access_error = require_thread_access(user_id, thread)
        if access_error:
            return access_error

        messages = (
            ThreadMessage.query
            .filter_by(thread_id=thread.id)
            .order_by(ThreadMessage.created_at.desc(), ThreadMessage.id.desc())
            .limit(limit)
            .all()
        )
        messages.reverse()

        membership = ThreadMember.query.filter_by(thread_id=thread.id, user_id=user_id).first() if user_id else None
        last_message = messages[-1] if messages else None

        total_messages = ThreadMessage.query.filter_by(thread_id=thread.id).count()

        return jsonify({
            "success": True,
            "thread": serialize_thread_light(
                thread,
                user_id=user_id,
                last_message=last_message,
                unread_count=0,
                member_count=len(thread.members),
                muted=membership.muted if membership else False,
                favorite=False,
                include_members=False,
            ),
            "messages": [
                serialize_thread_message(message, user_id=user_id, include_receipts=False)
                for message in messages
            ],
            "limit": limit,
            "has_more": total_messages > limit,
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

        socketio.start_background_task(
            emit_thread_message_created_background,
            thread.id,
            message.id,
        )

        socketio.start_background_task(
            notify_thread_members_background,
            thread.id,
            sender.id,
            message.id,
        )

        return jsonify({
            "success": True,
            "message": serialize_thread_message(
                message,
                user_id=sender.id,
                include_receipts=False,
            ),
            "push_queued": True,
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
        """
        Broadcast a lightweight message delta.

        Do not serialize the entire thread separately for every member.
        Clients already have the thread and can merge this message locally.
        """
        memberships = ThreadMember.query.filter_by(
            thread_id=thread.id
        ).all()

        member_user_ids = [
            membership.user_id
            for membership in memberships
        ]

        for user_id in member_user_ids:
            payload = {
                "thread_id": thread.id,
                "thread": {
                    "id": thread.id,
                    "name": thread.name,
                    "thread_type": thread.thread_type,
                    "group_key": thread.group_key,
                    "last_message": message.body or "Photo",
                    "last_message_at": iso_utc(message.created_at),
                },
                "message": serialize_thread_message(
                    message,
                    user_id=user_id,
                    include_receipts=False,
                ),
            }

            room_name = f"user:{user_id}"

            connected_sids = list(
                socketio.server.manager.get_participants(
                    "/",
                    room_name,
                )
            )

            app.logger.warning(
                "REALTIME emit message_id=%s thread_id=%s "
                "user_id=%s room=%s connected_sids=%s",
                message.id,
                thread.id,
                user_id,
                room_name,
                len(connected_sids),
            )

            socketio.emit(
                "thread_message_created",
                payload,
                room=room_name,
            )


    def emit_thread_message_created_background(
        thread_id,
        message_id,
    ):
        """
        Perform realtime fan-out after the message request has returned.
        Reload ORM objects inside the background task's app context.
        """
        with app.app_context():
            try:
                thread = db.session.get(Thread, thread_id)
                message = db.session.get(
                    ThreadMessage,
                    message_id,
                )

                if not thread or not message:
                    app.logger.warning(
                        "Realtime emit skipped: thread=%s message=%s",
                        thread_id,
                        message_id,
                    )
                    return

                emit_thread_message_created(
                    thread,
                    message,
                )
            except Exception:
                db.session.rollback()
                app.logger.exception(
                    "Background realtime emit failed: "
                    "thread=%s message=%s",
                    thread_id,
                    message_id,
                )


    def notify_thread_members_background(thread_id, sender_id, message_id):
        """
        Send push notifications without making the message POST wait
        for Expo's network response.
        """
        with app.app_context():
            try:
                thread = db.session.get(Thread, thread_id)
                sender = db.session.get(User, sender_id)
                message = db.session.get(ThreadMessage, message_id)

                if not thread or not sender or not message:
                    app.logger.warning(
                        "Background push skipped: thread=%s sender=%s message=%s",
                        thread_id,
                        sender_id,
                        message_id,
                    )
                    return

                result = notify_thread_members(thread, sender, message)

                app.logger.info(
                    "Background thread push complete: thread=%s message=%s result=%s",
                    thread_id,
                    message_id,
                    result,
                )
            except Exception:
                db.session.rollback()
                app.logger.exception(
                    "Background thread push failed: thread=%s message=%s",
                    thread_id,
                    message_id,
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


    # --------------------------------------------------
    # DOUGHY READ-ONLY CONNECT CONTEXT GATEWAY
    # --------------------------------------------------

    def require_doughy_connect_secret():
        expected_secret = (
            os.getenv(
                "DOUGHY_CONNECT_API_KEY",
                "",
            ).strip()
            or os.getenv(
                "BPI_OPS_INTEGRATION_SECRET",
                "",
            ).strip()
        )

        authorization = (
            request.headers.get(
                "Authorization",
                "",
            ).strip()
        )

        bearer_secret = ""

        if authorization.lower().startswith(
            "bearer "
        ):
            bearer_secret = (
                authorization[7:].strip()
            )

        provided_secret = (
            bearer_secret
            or request.headers.get(
                "X-Doughy-Key",
                "",
            ).strip()
            or request.headers.get(
                "X-Integration-Secret",
                "",
            ).strip()
        )

        if not expected_secret:
            return jsonify({
                "ok": False,
                "error": (
                    "DOUGHY_CONNECT_API_KEY "
                    "is not configured."
                ),
            }), 403

        if provided_secret != expected_secret:
            return jsonify({
                "ok": False,
                "error": (
                    "Unauthorized Doughy "
                    "Connect request."
                ),
            }), 403

        return None


    def parse_doughy_connect_date(
        value,
        end_of_day=False,
    ):
        raw = str(
            value or ""
        ).strip()

        if not raw:
            return None

        try:
            parsed = datetime.fromisoformat(
                raw.replace(
                    "Z",
                    "+00:00",
                )
            )

            if parsed.tzinfo is not None:
                parsed = parsed.replace(
                    tzinfo=None
                )

            if (
                len(raw) == 10
                and end_of_day
            ):
                parsed = (
                    parsed
                    + timedelta(days=1)
                )

            return parsed

        except ValueError:
            return None


    def doughy_connect_thread_scope(
        thread,
    ):
        group_key = (
            thread.group_key
            or ""
        )

        parts = group_key.split(
            ":",
            1,
        )

        return {
            "scope_type": (
                parts[0]
                if parts
                else thread.thread_type
            ),
            "scope_value": (
                parts[1]
                if len(parts) > 1
                else None
            ),
        }


    def doughy_connect_thread_matches(
        thread,
        store="",
        area="",
        thread_type="",
    ):
        requested_store = str(
            store or ""
        ).strip().lower()

        requested_area = str(
            area or ""
        ).strip().lower()

        requested_type = str(
            thread_type or ""
        ).strip().lower()

        actual_type = str(
            thread.thread_type
            or ""
        ).strip().lower()

        name = str(
            thread.name
            or ""
        ).strip().lower()

        group_key = str(
            thread.group_key
            or ""
        ).strip().lower()

        if (
            requested_type
            and actual_type
            != requested_type
        ):
            return False

        if requested_store:
            store_haystack = (
                f"{name} {group_key}"
            )

            if (
                requested_store
                not in store_haystack
            ):
                return False

        if requested_area:
            area_haystack = (
                f"{name} {group_key}"
            )

            if (
                requested_area
                not in area_haystack
            ):
                return False

        return True


    def serialize_doughy_connect_message(
        message,
    ):
        sender = message.sender
        thread = message.thread

        attachments = []

        try:
            message_attachments = (
                message.attachments
                or []
            )

            for attachment in (
                message_attachments
            ):
                attachments.append({
                    "file_type": (
                        attachment.file_type
                    ),
                    "original_filename": (
                        attachment.original_filename
                    ),
                    "mime_type": (
                        attachment.mime_type
                    ),
                    "size_bytes": (
                        attachment.size_bytes
                    ),
                })

        except Exception:
            db.session.rollback()
            attachments = []

        acknowledgement_names = []

        try:
            acknowledgement_names = [
                item.user.name
                for item in (
                    message.acks
                    or []
                )
                if item.user
            ]

        except Exception:
            db.session.rollback()
            acknowledgement_names = []

        scope = (
            doughy_connect_thread_scope(
                thread
            )
        )

        return {
            "id": message.id,
            "thread_id": message.thread_id,
            "thread_name": (
                thread.name
                if thread
                else ""
            ),
            "thread_type": (
                thread.thread_type
                if thread
                else ""
            ),
            "thread_scope_type": (
                scope.get("scope_type")
            ),
            "thread_scope_value": (
                scope.get("scope_value")
            ),
            "sender_id": (
                sender.id
                if sender
                else None
            ),
            "sender_name": (
                sender.name
                if sender
                else "Unknown"
            ),
            "sender_role": (
                sender.role
                if sender
                else None
            ),
            "sender_store": (
                sender.store.store_number
                if (
                    sender
                    and sender.store
                )
                else None
            ),
            "sender_area": (
                sender.area.name
                if (
                    sender
                    and sender.area
                )
                else None
            ),
            "body": (
                message.body
                or ""
            ),
            "requires_ack": bool(
                message.requires_ack
            ),
            "acknowledgement_count": len(
                acknowledgement_names
            ),
            "acknowledged_by": (
                acknowledgement_names
            ),
            "attachments": attachments,
            "created_at": (
                iso_utc(
                    message.created_at
                )
                if message.created_at
                else None
            ),
        }


    @app.post(
        "/api/integrations/doughy/context"
    )
    def doughy_connect_context():
        auth_error = (
            require_doughy_connect_secret()
        )

        if auth_error:
            return auth_error

        data = request.get_json(
            silent=True
        ) or {}

        module = str(
            data.get("module")
            or "messages"
        ).strip().lower()

        allowed_modules = {
            "messages",
            "threads",
            "people",
            "acknowledgements",
        }

        if module not in allowed_modules:
            return jsonify({
                "ok": False,
                "error": (
                    "Unsupported Connect module."
                ),
            }), 400

        requesting_user_id = (
            data.get(
                "requesting_user_id"
            )
            or data.get(
                "requesting_connect_user_id"
            )
        )

        try:
            requesting_user_id = int(
                requesting_user_id
            )
        except (
            TypeError,
            ValueError,
        ):
            return jsonify({
                "ok": False,
                "error": (
                    "requesting_user_id "
                    "is required."
                ),
            }), 400

        requesting_user = User.query.get(
            requesting_user_id
        )

        if (
            not requesting_user
            or not requesting_user.is_active
        ):
            return jsonify({
                "ok": False,
                "error": (
                    "Active requesting user "
                    "not found."
                ),
            }), 404

        requested_limit = (
            data.get("limit")
            or 100
        )

        try:
            requested_limit = int(
                requested_limit
            )
        except (
            TypeError,
            ValueError,
        ):
            requested_limit = 100

        limit = max(
            1,
            min(
                requested_limit,
                200,
            ),
        )

        store = str(
            data.get("store")
            or ""
        ).strip()

        area = str(
            data.get("area")
            or ""
        ).strip()

        person = str(
            data.get("person")
            or data.get("employee")
            or ""
        ).strip().lower()

        search_text = str(
            data.get("query")
            or ""
        ).strip().lower()

        thread_type = str(
            data.get("thread_type")
            or ""
        ).strip().lower()

        include_doughy = bool(
            data.get(
                "include_doughy",
                False,
            )
        )

        date_from = (
            parse_doughy_connect_date(
                data.get("date_from")
            )
        )

        date_to = (
            parse_doughy_connect_date(
                data.get("date_to"),
                end_of_day=True,
            )
        )

        all_threads = Thread.query.all()

        accessible_threads = [
            thread
            for thread in all_threads
            if can_user_access_thread(
                requesting_user,
                thread,
            )
            and doughy_connect_thread_matches(
                thread,
                store=store,
                area=area,
                thread_type=thread_type,
            )
        ]

        accessible_thread_ids = [
            thread.id
            for thread
            in accessible_threads
        ]

        if module == "threads":
            rows = []

            for thread in accessible_threads:
                message_count = (
                    ThreadMessage.query
                    .filter_by(
                        thread_id=thread.id
                    )
                    .count()
                )

                last_message = (
                    ThreadMessage.query
                    .filter_by(
                        thread_id=thread.id
                    )
                    .order_by(
                        ThreadMessage
                        .created_at
                        .desc()
                    )
                    .first()
                )

                member_count = (
                    ThreadMember.query
                    .filter_by(
                        thread_id=thread.id
                    )
                    .count()
                )

                scope = (
                    doughy_connect_thread_scope(
                        thread
                    )
                )

                rows.append({
                    "id": thread.id,
                    "name": thread.name,
                    "thread_type": (
                        thread.thread_type
                    ),
                    "scope_type": (
                        scope.get(
                            "scope_type"
                        )
                    ),
                    "scope_value": (
                        scope.get(
                            "scope_value"
                        )
                    ),
                    "member_count": (
                        member_count
                    ),
                    "message_count": (
                        message_count
                    ),
                    "last_message_at": (
                        iso_utc(
                            last_message
                            .created_at
                        )
                        if last_message
                        else None
                    ),
                })

            rows.sort(
                key=lambda row: (
                    row.get(
                        "last_message_at"
                    )
                    or ""
                ),
                reverse=True,
            )

            rows = rows[:limit]

            return jsonify({
                "ok": True,
                "source": "bpi_connect",
                "module": "threads",
                "count": len(rows),
                "threads": rows,
                "requester": {
                    "id": (
                        requesting_user.id
                    ),
                    "name": (
                        requesting_user.name
                    ),
                    "role": (
                        requesting_user.role
                    ),
                },
            })

        if module == "people":
            visible_user_ids = set()

            memberships = (
                ThreadMember.query
                .filter(
                    ThreadMember.thread_id.in_(
                        accessible_thread_ids
                    )
                )
                .all()
                if accessible_thread_ids
                else []
            )

            for membership in memberships:
                visible_user_ids.add(
                    membership.user_id
                )

            people = (
                User.query
                .filter(
                    User.id.in_(
                        visible_user_ids
                    )
                )
                .filter(
                    User.is_active.is_(True)
                )
                .order_by(
                    User.name.asc()
                )
                .all()
                if visible_user_ids
                else []
            )

            rows = []

            for user in people:
                person_haystack = (
                    f"{user.name or ''} "
                    f"{user.username or ''} "
                    f"{user.role or ''} "
                    f"{user.store.store_number if user.store else ''} "
                    f"{user.area.name if user.area else ''}"
                ).lower()

                if (
                    search_text
                    and search_text
                    not in person_haystack
                ):
                    continue

                rows.append({
                    "id": user.id,
                    "name": user.name,
                    "username": (
                        user.username
                    ),
                    "role": user.role,
                    "store": (
                        user.store.store_number
                        if user.store
                        else None
                    ),
                    "area": (
                        user.area.name
                        if user.area
                        else None
                    ),
                    "is_active": bool(
                        user.is_active
                    ),
                })

                if len(rows) >= limit:
                    break

            return jsonify({
                "ok": True,
                "source": "bpi_connect",
                "module": "people",
                "count": len(rows),
                "people": rows,
            })

        if not accessible_thread_ids:
            return jsonify({
                "ok": True,
                "source": "bpi_connect",
                "module": module,
                "count": 0,
                "messages": [],
            })

        message_query = (
            ThreadMessage.query
            .filter(
                ThreadMessage.thread_id.in_(
                    accessible_thread_ids
                )
            )
        )

        if date_from:
            message_query = (
                message_query.filter(
                    ThreadMessage.created_at
                    >= date_from
                )
            )

        if date_to:
            message_query = (
                message_query.filter(
                    ThreadMessage.created_at
                    < date_to
                )
            )

        if module == "acknowledgements":
            message_query = (
                message_query.filter(
                    ThreadMessage
                    .requires_ack
                    .is_(True)
                )
            )

        candidates = (
            message_query
            .order_by(
                ThreadMessage
                .created_at
                .desc()
            )
            .limit(
                max(
                    1000,
                    limit * 10,
                )
            )
            .all()
        )

        rows = []

        for message in candidates:
            sender = message.sender

            if (
                not include_doughy
                and sender
                and str(
                    sender.username
                    or ""
                ).strip().lower()
                == "doughy"
            ):
                continue

            if person:
                sender_haystack = (
                    f"{sender.name if sender else ''} "
                    f"{sender.username if sender else ''}"
                ).lower()

                if (
                    person
                    not in sender_haystack
                ):
                    continue

            if search_text:
                message_haystack = (
                    f"{message.body or ''} "
                    f"{message.thread.name if message.thread else ''}"
                ).lower()

                if (
                    search_text
                    not in message_haystack
                ):
                    continue

            rows.append(
                serialize_doughy_connect_message(
                    message
                )
            )

            if len(rows) >= limit:
                break

        return jsonify({
            "ok": True,
            "source": "bpi_connect",
            "module": module,
            "count": len(rows),
            "messages": rows,
            "requester": {
                "id": requesting_user.id,
                "name": requesting_user.name,
                "role": requesting_user.role,
            },
            "filters": {
                "date_from": (
                    date_from.isoformat()
                    if date_from
                    else None
                ),
                "date_to": (
                    date_to.isoformat()
                    if date_to
                    else None
                ),
                "store": store or None,
                "area": area or None,
                "person": person or None,
                "query": (
                    search_text
                    or None
                ),
                "thread_type": (
                    thread_type
                    or None
                ),
            },
        })


    # --------------------------------------------------
    # DOUGHY CONNECT INTEGRATION
    # --------------------------------------------------

    def get_or_create_doughy_user():
        doughy = User.query.filter_by(username="doughy").first()

        if doughy:
            changed = False

            if doughy.name != "Doughy":
                doughy.name = "Doughy"
                changed = True

            if doughy.role != "coach":
                doughy.role = "coach"
                changed = True

            if not doughy.is_active:
                doughy.is_active = True
                changed = True

            if changed:
                db.session.commit()

            return doughy

        doughy = User(
            name="Doughy",
            username="doughy",
            role="coach",
            is_active=True,
        )

        db.session.add(doughy)
        db.session.commit()

        return doughy


    def extract_doughy_question(body):
        raw = (body or "").strip()

        if not raw:
            return ""

        patterns = [
            r"(?i)@doughy\b[:,]?\s*",
            r"(?i)^doughy\b[:,]?\s*",
            r"(?i)^ask\s+doughy\b[:,]?\s*",
        ]

        for pattern in patterns:
            if re.search(pattern, raw):
                cleaned = re.sub(
                    pattern,
                    "",
                    raw,
                    count=1,
                ).strip()

                return cleaned or "Please review the recent conversation and help."

        return ""


    def build_doughy_thread_context(thread, requesting_user, source_message):
        recent_messages = (
            ThreadMessage.query
            .filter(
                ThreadMessage.thread_id == thread.id,
                ThreadMessage.id != source_message.id,
            )
            .order_by(ThreadMessage.created_at.desc())
            .limit(10)
            .all()
        )

        recent_messages.reverse()

        conversation_lines = []

        for item in recent_messages:
            sender_name = (
                item.sender.name
                if item.sender
                else "Unknown user"
            )

            message_body = (item.body or "").strip()

            if not message_body:
                continue

            conversation_lines.append(
                f"{sender_name}: {message_body}"
            )

        context_parts = [
            "BPI CONNECT REQUEST CONTEXT",
            f"Thread name: {thread.name}",
            f"Thread type: {thread.thread_type}",
            f"Thread group key: {thread.group_key}",
            f"Requesting user: {requesting_user.name}",
            f"Requesting username: {requesting_user.username}",
            f"Requesting Connect user ID: {requesting_user.id}",
            f"Requesting role: {requesting_user.role}",
        ]

        if requesting_user.store:
            context_parts.append(
                f"Requesting user's store: "
                f"{requesting_user.store.store_number}"
            )

        if requesting_user.area:
            context_parts.append(
                f"Requesting user's area: "
                f"{requesting_user.area.name}"
            )

        if conversation_lines:
            context_parts.extend([
                "",
                "RECENT THREAD CONVERSATION",
                *conversation_lines,
            ])

        context_parts.extend([
            "",
            "CONNECT CONVERSATION INSTRUCTIONS",
            "Answer the user's question from the recent thread conversation first.",
            "Resolve short references such as names, initials, places, or 'where is' questions using the recent messages.",
            "If the recent conversation already contains the answer, answer directly and do not route the request to maintenance, scheduling, checklists, or another operational dataset.",
            "Use this conversation only as temporary context.",
            "Do not treat employee statements as confirmed company policy.",
            "Do not save ordinary Connect conversation into permanent memory.",
        ])

        return "\n".join(context_parts)


    def request_doughy_answer(
        question,
        extra_context,
        agent="",
    ):
        brain_url = (
            os.getenv(
                "DOUGHY_BRAIN_API_URL",
                "https://brain.bostonpie.net/api/brain/ask",
            )
            .strip()
        )

        brain_key = (
            os.getenv("DOUGHY_BRAIN_API_KEY", "")
            .strip()
        )

        if not brain_key:
            raise RuntimeError(
                "DOUGHY_BRAIN_API_KEY is not configured."
            )

        request_payload = {
            "question": question,
            "extra_context": extra_context,
            "source": "bpi_connect",
        }

        if agent:
            request_payload["agent"] = agent

        response = requests.post(
            brain_url,
            headers={
                "Authorization": f"Bearer {brain_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Doughy-Source": "bpi_connect",
            },
            json=request_payload,
            timeout=120,
        )

        response.raise_for_status()

        payload = response.json()

        if payload.get("ok") is False:
            raise RuntimeError(
                payload.get("error")
                or "Doughy Brain request failed."
            )

        answer = (payload.get("answer") or "").strip()

        if not answer:
            raise RuntimeError(
                "Doughy returned an empty response."
            )

        return answer


    def extract_automatic_maintenance_question(
        thread,
        body,
    ):
        """
        Automatically route meaningful messages from the dedicated
        Maintenance thread to Doughy Jr.

        Other threads continue to require an explicit Doughy mention.
        """
        if (
            (thread.group_key or "").strip().lower()
            != "role:maintenance"
        ):
            return ""

        text = str(body or "").strip()

        if not text:
            return ""

        # Explicit escape hatch for human-only conversation.
        if text.lower().startswith("/human"):
            return ""

        # Do not launch Doughy for greeting-only messages.
        # The user's actual request often arrives as the next message.
        greeting_only = re.fullmatch(
            r"(?i)\s*(?:hi|hello|hey|good morning|good afternoon|good evening)"
            r"(?:\s+(?:there|doughy|@doughy))?[!.?,]*\s*",
            text,
        )

        if greeting_only:
            return ""

        # Preserve normal @doughy parsing when someone still uses it.
        explicitly_addressed = extract_doughy_question(text)

        if explicitly_addressed:
            return explicitly_addressed

        normalized = re.sub(
            r"\s+",
            " ",
            text.lower(),
        ).strip(" .,!?:;-'\"")

        quiet_messages = {
            "ok",
            "okay",
            "k",
            "kk",
            "yes",
            "yep",
            "yeah",
            "no",
            "nope",
            "thanks",
            "thank you",
            "ty",
            "done",
            "got it",
            "sounds good",
            "perfect",
            "great",
            "nice",
            "cool",
            "noted",
            "roger",
            "copy",
            "good morning",
            "good night",
        }

        if normalized in quiet_messages:
            return ""

        # Ignore emoji/punctuation-only acknowledgements.
        if not re.search(r"[a-z0-9]", normalized):
            return ""

        return text


    def create_doughy_thread_reply(
        thread_id,
        source_message_id,
        requesting_user_id,
        question,
    ):
        with app.app_context():
            try:
                thread = Thread.query.get(thread_id)
                source_message = ThreadMessage.query.get(
                    source_message_id
                )
                requesting_user = User.query.get(
                    requesting_user_id
                )

                if (
                    not thread
                    or not source_message
                    or not requesting_user
                ):
                    return

                doughy = get_or_create_doughy_user()

                ensure_thread_member(
                    thread.id,
                    doughy.id,
                )

                db.session.commit()

                extra_context = build_doughy_thread_context(
                    thread=thread,
                    requesting_user=requesting_user,
                    source_message=source_message,
                )

                doughy_agent = (
                    "maintenance_connect"
                    if (
                        (thread.group_key or "").strip().lower()
                        == "role:maintenance"
                    )
                    else "general_doughy"
                )

                answer = request_doughy_answer(
                    question=question,
                    extra_context=extra_context,
                    agent=doughy_agent,
                )

                reply = ThreadMessage(
                    thread_id=thread.id,
                    sender_user_id=doughy.id,
                    body=answer,
                    requires_ack=False,
                )

                db.session.add(reply)
                db.session.commit()

                emit_thread_message_created(
                    thread,
                    reply,
                )

                notify_thread_members(
                    thread,
                    doughy,
                    reply,
                )

            except Exception as error:
                db.session.rollback()

                app.logger.exception(
                    "Doughy Connect reply failed: %s",
                    error,
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
            sender_role in ["admin", "hr", "coach"]
            and thread.thread_type != "direct"
        )

        if not membership and not sender_can_access_group_thread:
            return jsonify({"success": False, "error": "Sender is not a member of this thread."}), 403

        if thread.thread_type == "company" and sender_role not in ["admin", "hr", "coach"]:
            return jsonify({
                "success": False,
                "error": "Only Admin, HR, or Coach can send company-wide messages.",
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

        socketio.start_background_task(
            emit_thread_message_created_background,
            thread.id,
            message.id,
        )

        socketio.start_background_task(
            notify_thread_members_background,
            thread.id,
            sender.id,
            message.id,
        )

        doughy_question = ""

        if (
            (sender.username or "").strip().lower()
            != "doughy"
        ):
            if (
                (thread.group_key or "").strip().lower()
                == "role:maintenance"
            ):
                doughy_question = (
                    extract_automatic_maintenance_question(
                        thread,
                        body,
                    )
                )
            else:
                doughy_question = extract_doughy_question(
                    body
                )

        if doughy_question:
            socketio.start_background_task(
                create_doughy_thread_reply,
                thread.id,
                message.id,
                sender.id,
                doughy_question,
            )

        return jsonify({
            "success": True,
            "message": serialize_thread_message(
                message,
                user_id=sender.id,
                include_receipts=False,
            ),
            "push_queued": True,
            "doughy_queued": bool(doughy_question),
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


    @app.delete("/api/threads/<int:thread_id>")
    def delete_thread_everyone(thread_id):
        data = request.get_json(silent=True) or {}
        actor, actor_error = require_admin_actor(data)
        if actor_error:
            return actor_error

        thread = Thread.query.get(thread_id)
        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        if thread.thread_type == "direct":
            return jsonify({
                "success": False,
                "error": "Direct message threads can only be removed per user.",
            }), 400

        message_ids = [
            row.id
            for row in ThreadMessage.query
            .with_entities(ThreadMessage.id)
            .filter_by(thread_id=thread.id)
            .all()
        ]

        if message_ids:
            existing_tables = set(inspect(db.engine).get_table_names())

            related_cleanup = [
                (ThreadMessageReaction, "thread_message_id", "message_id"),
                (ThreadMessageAck, "thread_message_id", "message_id"),
                (ThreadMessageAttachment, "thread_message_id", "message_id"),
            ]

            for model, preferred_column, fallback_column in related_cleanup:
                table_name = getattr(model, "__tablename__", None)

                if table_name not in existing_tables:
                    continue

                message_column = getattr(
                    model,
                    preferred_column,
                    getattr(model, fallback_column, None),
                )

                if message_column is None:
                    continue

                model.query.filter(
                    message_column.in_(message_ids)
                ).delete(synchronize_session=False)

            ThreadMessage.query.filter_by(
                thread_id=thread.id
            ).delete(synchronize_session=False)

        existing_tables = set(inspect(db.engine).get_table_names())

        if getattr(ThreadFavorite, "__tablename__", None) in existing_tables:
            ThreadFavorite.query.filter_by(
                thread_id=thread.id
            ).delete(synchronize_session=False)

        ThreadMember.query.filter_by(
            thread_id=thread.id
        ).delete(synchronize_session=False)

        Thread.query.filter_by(
            id=thread.id
        ).delete(synchronize_session=False)

        db.session.commit()

        return jsonify({
            "success": True,
            "deleted_thread_id": thread_id,
        })


    @app.post("/api/threads/<int:thread_id>/delete")
    def delete_thread_for_user(thread_id):
        ensure_thread_hidden_at_column()

        data = request.get_json() or {}
        user_id = data.get("user_id")

        if not user_id:
            return jsonify({
                "success": False,
                "error": "user_id is required.",
            }), 400

        thread = Thread.query.get(thread_id)
        if not thread:
            return jsonify({"success": False, "error": "Thread not found."}), 404

        if thread.thread_type != "direct":
            return jsonify({
                "success": False,
                "error": "Only direct message threads can be deleted.",
            }), 400

        membership = ThreadMember.query.filter_by(
            thread_id=thread.id,
            user_id=user_id,
        ).first()

        if not membership:
            return jsonify({"success": False, "error": "Thread membership not found."}), 404

        membership.hidden_at = datetime.utcnow()
        membership.muted = True
        db.session.commit()

        return jsonify({
            "success": True,
            "thread_id": thread.id,
            "hidden_at": iso_utc(membership.hidden_at),
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

        # Do not broadcast read receipts live.
        # Old/current mobile clients can treat this socket event as a reason to reload messages,
        # which causes chat bouncing and repeated GET messages + POST read loops.
        # Read state is still saved in the DB above.

        return jsonify({
            "success": True,
            "thread_id": int(thread_id),
            "user_id": int(user_id),
            "last_read_at": iso_utc(membership.last_read_at),
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


def iso_utc(dt):
    if not dt:
        return None
    return dt.isoformat().replace("+00:00", "Z") + ("Z" if dt.tzinfo is None and not dt.isoformat().endswith("Z") else "")


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
        "created_at": iso_utc(message.created_at),
        "read_at": iso_utc(recipient.read_at) if recipient and recipient.read_at else None,
        "acknowledged_at": iso_utc(recipient.acknowledged_at) if recipient and recipient.acknowledged_at else None,
    }

def ensure_thread_favorites_table():
    try:
        ThreadFavorite.__table__.create(db.engine, checkfirst=True)
        return True
    except Exception:
        db.session.rollback()
        return False


def ensure_thread_hidden_at_column():
    try:
        db.session.execute(db.text("ALTER TABLE thread_members ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP"))
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        return False



def serialize_thread_light(thread, user_id=None, last_message=None, unread_count=0, member_count=0, muted=False, favorite=False, include_members=False):
    preview = ""
    last_time = None

    if last_message:
        preview = (last_message.body or "")[:160]
        last_time = iso_utc(last_message.created_at) if last_message.created_at else None

    pinned_message = None

    if getattr(thread, "pinned_message_id", None):
        pinned_message = ThreadMessage.query.filter_by(
            id=thread.pinned_message_id,
            thread_id=thread.id,
        ).first()

    return {
        "id": thread.id,
        "thread_type": thread.thread_type,
        "name": thread.name,
        "group_key": thread.group_key,
        "created_at": iso_utc(thread.created_at) if thread.created_at else None,
        "last_message": preview,
        "last_time": last_time,
        "unread": int(unread_count or 0),
        "members": [serialize_user(member.user) for member in thread.members] if include_members else [],
        "member_count": int(member_count or 0),
        "muted": bool(muted),
        "favorite": bool(favorite),
        "pinned_message": serialize_pinned_thread_message(pinned_message) if pinned_message else None,
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

    pinned_message = None

    if getattr(thread, "pinned_message_id", None):
        pinned_message = ThreadMessage.query.filter_by(
            id=thread.pinned_message_id,
            thread_id=thread.id,
        ).first()

    return {
        "id": thread.id,
        "thread_type": thread.thread_type,
        "name": thread.name,
        "group_key": thread.group_key,
        "created_at": iso_utc(thread.created_at),
        "last_message": last_message.body if last_message else "",
        "last_time": iso_utc(last_message.created_at) if last_message else None,
        "unread": unread_count,
        "members": [serialize_user(member.user) for member in thread.members],
        "muted": membership.muted if membership else False,
        "favorite": favorite,
        "pinned_message": serialize_pinned_thread_message(pinned_message) if pinned_message else None,
    }


def serialize_pinned_thread_message(message):
    if not message:
        return None

    sender = message.sender

    return {
        "id": message.id,
        "thread_id": message.thread_id,
        "sender_user_id": message.sender_user_id,
        "sender": sender.name if sender else "Unknown",
        "sender_role": sender.role if sender else None,
        "body": message.body,
        "created_at": iso_utc(message.created_at) if message.created_at else None,
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
        "created_at": iso_utc(attachment.created_at) if attachment.created_at else None,
    }


def serialize_thread_message(message, user_id=None, include_receipts=True):
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

    seen_by_users = []
    delivered_to_users = []

    if include_receipts:
        try:
            memberships = (
                ThreadMember.query
                .filter(ThreadMember.thread_id == message.thread_id)
                .filter(ThreadMember.user_id != message.sender_user_id)
                .all()
            )

            for membership in memberships:
                if not membership.user:
                    continue

                user_data = serialize_user(membership.user)

                if membership.last_read_at and message.created_at and membership.last_read_at >= message.created_at:
                    seen_by_users.append(user_data)
                else:
                    delivered_to_users.append(user_data)
        except Exception:
            seen_by_users = []
            delivered_to_users = []

    return {
        "id": message.id,
        "thread_id": message.thread_id,
        "sender": serialize_user(message.sender),
        "body": message.body,
        "requires_ack": message.requires_ack,
        "acknowledged": acknowledged,
        "created_at": iso_utc(message.created_at),
        "is_me": message.sender_user_id == user_id if user_id else False,
        "seen_by_count": seen_by_count,
        "seen_by": seen_by_users,
        "seen_count": seen_by_count,
        "delivered_to_count": delivered_to_count,
        "delivered_to": delivered_to_users,
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
        "created_at": iso_utc(assignment.created_at) if assignment.created_at else None,
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
        "created_at": iso_utc(area.created_at) if area.created_at else None,
    }

def serialize_message_reactions(message, current_user_id=None):
    try:
        existing_tables = set(inspect(db.engine).get_table_names())

        if getattr(ThreadMessageReaction, "__tablename__", None) not in existing_tables:
            return []

        reactions = (
            ThreadMessageReaction.query
            .filter_by(thread_message_id=message.id)
            .all()
        )
    except Exception:
        db.session.rollback()
        return []

    counts = {}
    reacted_by_me = {}

    for reaction in reactions:
        emoji = reaction.emoji or "👍"
        counts[emoji] = counts.get(emoji, 0) + 1

        if current_user_id and str(reaction.user_id) == str(current_user_id):
            reacted_by_me[emoji] = True

    return [
        {
            "emoji": emoji,
            "count": count,
            "reacted_by_me": bool(reacted_by_me.get(emoji)),
        }
        for emoji, count in sorted(counts.items())
    ]

