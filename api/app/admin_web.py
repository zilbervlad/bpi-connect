import os
from functools import wraps
from datetime import datetime

from werkzeug.security import check_password_hash

from flask import (
    Blueprint,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

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
    ThreadMessage,
)


admin_web_bp = Blueprint(
    "admin_web",
    __name__,
    url_prefix="/admin",
    template_folder="templates",
)


def _admin_password():
    return (
        os.getenv("BPI_CONNECT_ADMIN_PASSWORD", "").strip()
        or os.getenv("ADMIN_WEB_PASSWORD", "").strip()
    )


def _find_admin_user(identifier):
    identifier = (identifier or "").strip().lower()

    if not identifier:
        return None

    return User.query.filter(
        db.or_(
            db.func.lower(User.email) == identifier,
            db.func.lower(User.username) == identifier,
        )
    ).first()


def _user_can_access_admin(user):
    if not user or not user.is_active:
        return False

    return (user.role or "").strip().lower() in {"admin", "hr"}


def _is_logged_in():
    return bool(session.get("bpi_connect_admin_web"))


def _current_admin_user():
    user_id = session.get("bpi_connect_admin_user_id")

    if not user_id:
        return None

    return User.query.get(user_id)


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not _is_logged_in():
            return redirect(url_for("admin_web.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def fmt_dt(value):
    if not value:
        return "—"
    try:
        return value.strftime("%m/%d/%y %I:%M %p")
    except Exception:
        return str(value)


def user_store_display(user):
    stores = []

    if getattr(user, "store", None):
        stores.append(user.store.store_number)

    for assignment in getattr(user, "store_assignments", []) or []:
        if assignment.store and assignment.store.store_number not in stores:
            stores.append(assignment.store.store_number)

    return ", ".join(stores) if stores else "—"


@admin_web_bp.app_template_filter("fmt_dt")
def fmt_dt_filter(value):
    return fmt_dt(value)


@admin_web_bp.app_template_filter("stores_display")
def stores_display_filter(user):
    return user_store_display(user)


@admin_web_bp.route("/login", methods=["GET", "POST"])
def login():
    configured_password = _admin_password()

    if request.method == "POST":
        identifier = (request.form.get("identifier") or "").strip()
        password = request.form.get("password", "")

        # Legit login path: BPI Connect Admin/HR user credentials.
        user = _find_admin_user(identifier)

        if user and _user_can_access_admin(user) and user.password_hash:
            if check_password_hash(user.password_hash, password):
                session["bpi_connect_admin_web"] = True
                session["bpi_connect_admin_user_id"] = user.id
                session["bpi_connect_admin_name"] = user.name
                session["bpi_connect_admin_role"] = user.role
                return redirect(request.args.get("next") or url_for("admin_web.dashboard"))

        # Emergency fallback: env password, useful if user passwords are not set yet.
        if configured_password and password == configured_password:
            session["bpi_connect_admin_web"] = True
            session["bpi_connect_admin_name"] = "Admin"
            session["bpi_connect_admin_role"] = "system"
            return redirect(request.args.get("next") or url_for("admin_web.dashboard"))

        flash("Invalid admin login.", "error")

    return render_template("admin/login.html", has_password=bool(configured_password))


@admin_web_bp.route("/logout")
def logout():
    for key in [
        "bpi_connect_admin_web",
        "bpi_connect_admin_user_id",
        "bpi_connect_admin_name",
        "bpi_connect_admin_role",
    ]:
        session.pop(key, None)

    return redirect(url_for("admin_web.login"))


@admin_web_bp.route("/")
@admin_required
def dashboard():
    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    inactive_users = total_users - active_users
    total_threads = Thread.query.count()
    total_announcements = Message.query.filter_by(message_type="announcement").count()
    unread_announcements = MessageRecipient.query.filter(MessageRecipient.read_at.is_(None)).count()
    pending_acks = MessageRecipient.query.join(Message).filter(
        Message.requires_ack.is_(True),
        MessageRecipient.acknowledged_at.is_(None),
    ).count()

    role_rows = (
        db.session.query(User.role, db.func.count(User.id))
        .group_by(User.role)
        .order_by(db.func.count(User.id).desc())
        .all()
    )

    recent_announcements = (
        Message.query
        .filter_by(message_type="announcement")
        .order_by(Message.created_at.desc())
        .limit(8)
        .all()
    )

    recent_threads = (
        Thread.query
        .order_by(Thread.created_at.desc())
        .limit(8)
        .all()
    )

    return render_template(
        "admin/dashboard.html",
        total_users=total_users,
        active_users=active_users,
        inactive_users=inactive_users,
        total_threads=total_threads,
        total_announcements=total_announcements,
        unread_announcements=unread_announcements,
        pending_acks=pending_acks,
        role_rows=role_rows,
        recent_announcements=recent_announcements,
        recent_threads=recent_threads,
    )


@admin_web_bp.route("/users")
@admin_required
def users():
    q = (request.args.get("q") or "").strip()
    role = (request.args.get("role") or "").strip()
    status = (request.args.get("status") or "").strip()

    query = User.query

    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                User.name.ilike(like),
                User.email.ilike(like),
                User.username.ilike(like),
                User.phone_number.ilike(like),
            )
        )

    if role:
        query = query.filter(User.role == role)

    if status == "active":
        query = query.filter(User.is_active.is_(True))
    elif status == "inactive":
        query = query.filter(User.is_active.is_(False))

    rows = query.order_by(User.is_active.desc(), User.name.asc()).limit(300).all()

    roles = [
        role
        for (role,) in db.session.query(User.role).distinct().order_by(User.role.asc()).all()
        if role
    ]

    return render_template("admin/users.html", users=rows, q=q, role=role, status=status, roles=roles)



@admin_web_bp.route("/users/<int:user_id>", methods=["GET", "POST"])
@admin_required
def user_detail(user_id):
    user = User.query.get_or_404(user_id)
    stores = Store.query.order_by(Store.store_number.asc()).all()
    areas = Area.query.order_by(Area.name.asc()).all()

    if request.method == "POST":
        user.name = (request.form.get("name") or "").strip() or user.name
        user.email = (request.form.get("email") or "").strip() or None
        user.username = (request.form.get("username") or "").strip() or None
        user.phone_number = (request.form.get("phone_number") or "").strip() or None
        user.role = (request.form.get("role") or "").strip() or user.role
        user.is_active = bool(request.form.get("is_active"))

        primary_store_id = request.form.get("store_id") or ""
        user.store_id = int(primary_store_id) if primary_store_id else None

        area_id = request.form.get("area_id") or ""
        user.area_id = int(area_id) if area_id else None

        selected_store_ids = {
            int(value)
            for value in request.form.getlist("assigned_store_ids")
            if str(value).isdigit()
        }

        if user.store_id:
            selected_store_ids.add(user.store_id)

        existing_assignments = {
            row.store_id: row
            for row in UserStoreAssignment.query.filter_by(user_id=user.id).all()
        }

        for store_id in selected_store_ids:
            if store_id not in existing_assignments:
                db.session.add(UserStoreAssignment(
                    user_id=user.id,
                    store_id=store_id,
                    assignment_type="oversight",
                ))

        for store_id, assignment in existing_assignments.items():
            if store_id not in selected_store_ids:
                db.session.delete(assignment)

        db.session.commit()

        # Keep auto group chats aligned with store/role/area changes.
        try:
            from app import sync_user_to_default_chats
            sync_user_to_default_chats(user)
            db.session.commit()
        except Exception:
            db.session.rollback()
            flash("User saved, but chat sync failed. Run default chat backfill if needed.", "error")
            return redirect(url_for("admin_web.user_detail", user_id=user.id))

        flash("User updated.", "success")
        return redirect(url_for("admin_web.user_detail", user_id=user.id))

    assigned_store_ids = {
        row.store_id
        for row in UserStoreAssignment.query.filter_by(user_id=user.id).all()
    }

    if user.store_id:
        assigned_store_ids.add(user.store_id)

    return render_template(
        "admin/user_detail.html",
        user=user,
        stores=stores,
        areas=areas,
        assigned_store_ids=assigned_store_ids,
    )


@admin_web_bp.route("/users/<int:user_id>/toggle-active", methods=["POST"])
@admin_required
def toggle_user_active(user_id):
    user = User.query.get_or_404(user_id)
    user.is_active = not bool(user.is_active)
    db.session.commit()
    flash(f"{user.name} is now {'active' if user.is_active else 'inactive'}.", "success")
    return redirect(request.referrer or url_for("admin_web.users"))


@admin_web_bp.route("/users/<int:user_id>/role", methods=["POST"])
@admin_required
def update_user_role(user_id):
    user = User.query.get_or_404(user_id)
    new_role = (request.form.get("role") or "").strip()

    if not new_role:
        flash("Role is required.", "error")
        return redirect(request.referrer or url_for("admin_web.users"))

    user.role = new_role
    db.session.commit()
    flash(f"{user.name} role updated to {new_role}.", "success")
    return redirect(request.referrer or url_for("admin_web.users"))


@admin_web_bp.route("/announcements", methods=["GET", "POST"])
@admin_required
def announcements():
    if request.method == "POST":
        title = (request.form.get("title") or "").strip()
        body = (request.form.get("body") or "").strip()
        requires_ack = bool(request.form.get("requires_ack"))

        if not title or not body:
            flash("Title and body are required.", "error")
            return redirect(url_for("admin_web.announcements"))

        sender = (
            User.query
            .filter(User.is_active.is_(True), User.role.in_(["admin", "hr"]))
            .order_by(User.id.asc())
            .first()
        ) or User.query.order_by(User.id.asc()).first()

        if not sender:
            flash("No user exists to use as announcement sender.", "error")
            return redirect(url_for("admin_web.announcements"))

        recipients = User.query.filter_by(is_active=True).all()

        message = Message(
            sender_user_id=sender.id,
            title=title,
            body=body,
            message_type="announcement",
            priority="ack" if requires_ack else "normal",
            target_type="company",
            target_label="Company",
            requires_ack=requires_ack,
        )
        db.session.add(message)
        db.session.flush()

        for user in recipients:
            db.session.add(MessageRecipient(message_id=message.id, user_id=user.id))

        db.session.commit()
        flash(f"Announcement sent to {len(recipients)} active users.", "success")
        return redirect(url_for("admin_web.announcements"))

    rows = (
        Message.query
        .filter_by(message_type="announcement")
        .order_by(Message.created_at.desc())
        .limit(100)
        .all()
    )

    stats = {}
    for message in rows:
        recipients = list(message.recipients or [])
        stats[message.id] = {
            "delivered": len(recipients),
            "read": sum(1 for row in recipients if row.read_at),
            "acked": sum(1 for row in recipients if row.acknowledged_at),
        }

    return render_template("admin/announcements.html", announcements=rows, stats=stats)



@admin_web_bp.route("/announcements/<int:message_id>")
@admin_required
def announcement_detail(message_id):
    message = Message.query.get_or_404(message_id)

    recipients = (
        MessageRecipient.query
        .filter_by(message_id=message.id)
        .join(User)
        .order_by(User.name.asc())
        .all()
    )

    delivered_count = len(recipients)
    read_count = sum(1 for row in recipients if row.read_at)
    acked_count = sum(1 for row in recipients if row.acknowledged_at)
    unread_count = sum(1 for row in recipients if not row.read_at)
    pending_ack_count = sum(
        1 for row in recipients
        if message.requires_ack and not row.acknowledged_at
    )

    return render_template(
        "admin/announcement_detail.html",
        message=message,
        recipients=recipients,
        delivered_count=delivered_count,
        read_count=read_count,
        acked_count=acked_count,
        unread_count=unread_count,
        pending_ack_count=pending_ack_count,
    )


@admin_web_bp.route("/threads")
@admin_required
def threads():
    q = (request.args.get("q") or "").strip()
    query = Thread.query

    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                Thread.name.ilike(like),
                Thread.thread_type.ilike(like),
                Thread.group_key.ilike(like),
            )
        )

    rows = query.order_by(Thread.thread_type.asc(), Thread.name.asc()).limit(300).all()

    member_counts = dict(
        db.session.query(ThreadMember.thread_id, db.func.count(ThreadMember.id))
        .group_by(ThreadMember.thread_id)
        .all()
    )

    message_counts = dict(
        db.session.query(ThreadMessage.thread_id, db.func.count(ThreadMessage.id))
        .group_by(ThreadMessage.thread_id)
        .all()
    )

    return render_template(
        "admin/threads.html",
        threads=rows,
        q=q,
        member_counts=member_counts,
        message_counts=message_counts,
    )


@admin_web_bp.route("/threads/<int:thread_id>/rename", methods=["POST"])
@admin_required
def rename_thread(thread_id):
    thread = Thread.query.get_or_404(thread_id)
    name = (request.form.get("name") or "").strip()

    if not name:
        flash("Thread name is required.", "error")
        return redirect(request.referrer or url_for("admin_web.threads"))

    thread.name = name
    db.session.commit()
    flash("Thread renamed.", "success")
    return redirect(request.referrer or url_for("admin_web.threads"))
