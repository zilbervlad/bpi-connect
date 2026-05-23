from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from app.extensions import db
from app.models import Area, Store, User, Message, MessageRecipient, Thread, ThreadMember, ThreadMessage, ThreadMessageAck


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "dev-secret-key"
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///bpi_connect.db"
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

    @app.post("/dev/init-db")
    def init_db():
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

    @app.get("/api/users")
    def list_users():
        users = User.query.order_by(User.role.asc(), User.name.asc()).all()

        return jsonify({
            "success": True,
            "users": [serialize_user(user) for user in users],
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


def serialize_user(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "store": user.store.store_number if user.store else None,
        "store_name": user.store.name if user.store else None,
        "area": user.area.name if user.area else None,
        "is_active": user.is_active,
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

