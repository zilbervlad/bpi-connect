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
    username = db.Column(db.String(120), unique=True, nullable=True)
    email = db.Column(db.String(180), unique=True, nullable=True)
    phone_number = db.Column(db.String(40), nullable=True)
    bpi_ops_user_id = db.Column(db.Integer, unique=True, nullable=True)
    avatar_url = db.Column(db.Text, nullable=True)
    role = db.Column(db.String(50), nullable=False)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=True)
    area_id = db.Column(db.Integer, db.ForeignKey("areas.id"), nullable=True)

    password_hash = db.Column(db.String(255), nullable=True)
    invite_token = db.Column(db.String(255), unique=True, nullable=True)
    invite_sent_at = db.Column(db.DateTime, nullable=True)
    invite_accepted_at = db.Column(db.DateTime, nullable=True)

    password_reset_token = db.Column(db.String(255), unique=True, nullable=True)
    password_reset_sent_at = db.Column(db.DateTime, nullable=True)
    last_login_at = db.Column(db.DateTime, nullable=True)

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    store = db.relationship("Store", backref="users")
    area = db.relationship("Area", backref="users")


class UserStoreAssignment(db.Model):
    __tablename__ = "user_store_assignments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False)
    assignment_type = db.Column(db.String(40), default="primary")  # primary, oversight
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref="store_assignments")
    store = db.relationship("Store", backref="user_assignments")


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
    pinned_message_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    created_by = db.relationship("User", backref="created_threads")


class ThreadFavorite(db.Model):
    __tablename__ = "thread_favorites"

    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(db.Integer, db.ForeignKey("threads.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    thread = db.relationship("Thread", backref="favorites")
    user = db.relationship("User", backref="thread_favorites")


class ThreadMember(db.Model):
    __tablename__ = "thread_members"

    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(db.Integer, db.ForeignKey("threads.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    member_role = db.Column(db.String(40), default="member")
    muted = db.Column(db.Boolean, default=False)
    last_read_at = db.Column(db.DateTime, nullable=True)
    hidden_at = db.Column(db.DateTime, nullable=True)
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


class PushToken(db.Model):
    __tablename__ = "push_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.Text, nullable=False, unique=True)
    platform = db.Column(db.String(40), nullable=True)
    device_name = db.Column(db.String(160), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship("User", backref="push_tokens")


class ThreadMessageAttachment(db.Model):
    __tablename__ = "thread_message_attachments"

    id = db.Column(db.Integer, primary_key=True)
    thread_message_id = db.Column(db.Integer, db.ForeignKey("thread_messages.id"), nullable=False)
    file_type = db.Column(db.String(40), nullable=False, default="image")
    url = db.Column(db.Text, nullable=False)
    thumbnail_url = db.Column(db.Text, nullable=True)
    original_filename = db.Column(db.String(255), nullable=True)
    mime_type = db.Column(db.String(120), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    thread_message = db.relationship("ThreadMessage", backref="attachments")


class ThreadMessageAck(db.Model):
    __tablename__ = "thread_message_acks"

    id = db.Column(db.Integer, primary_key=True)
    thread_message_id = db.Column(db.Integer, db.ForeignKey("thread_messages.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    acknowledged_at = db.Column(db.DateTime, default=datetime.utcnow)

    thread_message = db.relationship("ThreadMessage", backref="acks")
    user = db.relationship("User", backref="thread_message_acks")

class ThreadMessageReaction(db.Model):
    __tablename__ = "thread_message_reactions"

    id = db.Column(db.Integer, primary_key=True)
    thread_message_id = db.Column(db.Integer, db.ForeignKey("thread_messages.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    emoji = db.Column(db.String(20), default="👍")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    thread_message = db.relationship("ThreadMessage", backref="reactions")
    user = db.relationship("User", backref="thread_message_reactions")

