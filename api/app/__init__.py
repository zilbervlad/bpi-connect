from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from app.extensions import db
from app.models import Area, Store, User, Message, MessageRecipient


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
