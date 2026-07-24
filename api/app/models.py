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
    assignment_type = db.Column(
        db.String(40),
        default="primary",
    )  # primary, secondary, oversight
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref="store_assignments")
    store = db.relationship("Store", backref="user_assignments")


class AvailabilityRequest(db.Model):
    __tablename__ = "availability_requests"
    __table_args__ = (
        db.Index(
            "ix_availability_requests_user_status",
            "user_id",
            "status",
        ),
        db.Index(
            "ix_availability_requests_store_status",
            "store_id",
            "status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
    )
    store_id = db.Column(
        db.Integer,
        db.ForeignKey("stores.id"),
        nullable=False,
    )

    effective_date = db.Column(db.Date, nullable=False)

    monday = db.Column(db.String(120), nullable=True)
    tuesday = db.Column(db.String(120), nullable=True)
    wednesday = db.Column(db.String(120), nullable=True)
    thursday = db.Column(db.String(120), nullable=True)
    friday = db.Column(db.String(120), nullable=True)
    saturday = db.Column(db.String(120), nullable=True)
    sunday = db.Column(db.String(120), nullable=True)

    employee_note = db.Column(db.Text, nullable=True)

    status = db.Column(
        db.String(30),
        nullable=False,
        default="pending",
    )

    reviewed_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True,
    )
    manager_note = db.Column(db.Text, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = db.relationship(
        "User",
        foreign_keys=[user_id],
        backref="availability_requests",
    )
    store = db.relationship(
        "Store",
        backref="availability_requests",
    )
    reviewed_by = db.relationship(
        "User",
        foreign_keys=[reviewed_by_user_id],
        backref="availability_requests_reviewed",
    )


class TimeOffRequest(db.Model):
    __tablename__ = "time_off_requests"
    __table_args__ = (
        db.CheckConstraint(
            "end_date >= start_date",
            name="ck_time_off_end_after_start",
        ),
        db.Index(
            "ix_time_off_requests_user_status",
            "user_id",
            "status",
        ),
        db.Index(
            "ix_time_off_requests_store_status",
            "store_id",
            "status",
        ),
        db.Index(
            "ix_time_off_requests_dates",
            "start_date",
            "end_date",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
    )
    store_id = db.Column(
        db.Integer,
        db.ForeignKey("stores.id"),
        nullable=False,
    )

    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)

    start_time = db.Column(db.String(20), nullable=True)
    end_time = db.Column(db.String(20), nullable=True)
    all_day = db.Column(db.Boolean, default=True, nullable=False)

    reason = db.Column(db.Text, nullable=True)

    status = db.Column(
        db.String(30),
        nullable=False,
        default="pending",
    )

    reviewed_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True,
    )
    manager_note = db.Column(db.Text, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = db.relationship(
        "User",
        foreign_keys=[user_id],
        backref="time_off_requests",
    )
    store = db.relationship(
        "Store",
        backref="time_off_requests",
    )
    reviewed_by = db.relationship(
        "User",
        foreign_keys=[reviewed_by_user_id],
        backref="time_off_requests_reviewed",
    )


class StoreScheduleImage(db.Model):
    __tablename__ = "store_schedule_images"
    __table_args__ = (
        db.Index(
            "ix_store_schedule_images_store_week",
            "store_id",
            "week_start",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)

    store_id = db.Column(
        db.Integer,
        db.ForeignKey("stores.id"),
        nullable=False,
    )

    week_start = db.Column(
        db.Date,
        nullable=False,
    )

    image_url = db.Column(
        db.Text,
        nullable=False,
    )
    thumbnail_url = db.Column(
        db.Text,
        nullable=True,
    )

    original_filename = db.Column(
        db.String(255),
        nullable=True,
    )
    mime_type = db.Column(
        db.String(120),
        nullable=True,
    )
    size_bytes = db.Column(
        db.Integer,
        nullable=True,
    )

    uploaded_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
    )

    notes = db.Column(
        db.Text,
        nullable=True,
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    store = db.relationship(
        "Store",
        backref="schedule_images",
    )
    uploaded_by = db.relationship(
        "User",
        backref="schedule_images_uploaded",
    )


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

