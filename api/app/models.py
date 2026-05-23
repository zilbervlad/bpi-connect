from datetime import datetime
from app.extensions import db


class Area(db.Model):
    __tablename__ = "areas"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Store(db.Model):
    __tablename__ = "stores"

    id = db.Column(db.Integer, primary_key=True)
    store_number = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=True)
    area_id = db.Column(db.Integer, db.ForeignKey("areas.id"), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    area = db.relationship("Area", backref="stores")


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(180), unique=True, nullable=True)
    role = db.Column(db.String(50), nullable=False)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=True)
    area_id = db.Column(db.Integer, db.ForeignKey("areas.id"), nullable=True)

    password_hash = db.Column(db.String(255), nullable=True)
    invite_token = db.Column(db.String(255), unique=True, nullable=True)
    invite_sent_at = db.Column(db.DateTime, nullable=True)
    invite_accepted_at = db.Column(db.DateTime, nullable=True)
    last_login_at = db.Column(db.DateTime, nullable=True)

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    store = db.relationship("Store", backref="users")
    area = db.relationship("Area", backref="users")


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    sender_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=False)
    message_type = db.Column(db.String(40), default="private")
    priority = db.Column(db.String(40), default="normal")
    target_type = db.Column(db.String(40), default="individual")
    target_label = db.Column(db.String(160), nullable=True)
    requires_ack = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sender = db.relationship("User", backref="sent_messages")


class MessageRecipient(db.Model):
    __tablename__ = "message_recipients"

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    read_at = db.Column(db.DateTime, nullable=True)
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    delivered_at = db.Column(db.DateTime, default=datetime.utcnow)

    message = db.relationship("Message", backref="recipients")
    user = db.relationship("User", backref="received_messages")


class Thread(db.Model):
    __tablename__ = "threads"

    id = db.Column(db.Integer, primary_key=True)
    thread_type = db.Column(db.String(40), nullable=False)
    name = db.Column(db.String(160), nullable=False)
    group_key = db.Column(db.String(160), unique=True, nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    created_by = db.relationship("User", backref="created_threads")


class ThreadMember(db.Model):
    __tablename__ = "thread_members"

    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(db.Integer, db.ForeignKey("threads.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    member_role = db.Column(db.String(40), default="member")
    muted = db.Column(db.Boolean, default=False)
    last_read_at = db.Column(db.DateTime, nullable=True)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    thread = db.relationship("Thread", backref="members")
    user = db.relationship("User", backref="thread_memberships")


class ThreadMessage(db.Model):
    __tablename__ = "thread_messages"

    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(db.Integer, db.ForeignKey("threads.id"), nullable=False)
    sender_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    body = db.Column(db.Text, nullable=False)
    requires_ack = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    thread = db.relationship("Thread", backref="thread_messages")
    sender = db.relationship("User", backref="thread_messages_sent")


class ThreadMessageAck(db.Model):
    __tablename__ = "thread_message_acks"

    id = db.Column(db.Integer, primary_key=True)
    thread_message_id = db.Column(db.Integer, db.ForeignKey("thread_messages.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    acknowledged_at = db.Column(db.DateTime, default=datetime.utcnow)

    thread_message = db.relationship("ThreadMessage", backref="acks")
    user = db.relationship("User", backref="thread_message_acks")
